/**
 * Persistence Concurrency and Idempotency Race Test
 *
 * This test validates that concurrent upsert and ensureExit operations maintain
 * idempotency guarantees under parallel execution conditions, preventing:
 * - Duplicate vertex creation
 * - Duplicate exit edges
 * - Unnecessary version inflation
 *
 * References:
 * - ADR-001: Mosswell Persistence & Layering (idempotent upsert pattern with fold/coalesce)
 * - Issue: Persistence Concurrency Idempotency Race Test
 *
 * Scope: In-memory mode for deterministic, fast CI execution
 * Future: Optional Cosmos mode when external dependencies are available
 */

import { Location } from '@piquet-h/shared'
import assert from 'node:assert'
import { describe, test } from 'node:test'
import { InMemoryLocationRepository } from '../../src/repos/locationRepository.memory.js'

describe('Persistence Concurrency Idempotency', () => {
    /**
     * Stress test: concurrent upsert operations on same location set
     * Validates: only one creation per location, version increments only on content change
     */
    test('concurrent upsert maintains idempotency - no duplicate vertices', async () => {
        const repo = new InMemoryLocationRepository()

        // Define a set of test locations
        const locationIds = ['loc-1', 'loc-2', 'loc-3']
        const locations: Location[] = locationIds.map((id) => ({
            id,
            name: `Test Location ${id}`,
            description: `A test location with id ${id}`,
            exits: []
        }))

        // Number of concurrent operations
        const concurrencyLevel = 15

        // Create N parallel promises attempting to upsert the same locations
        const promises: Promise<{ created: boolean; id: string; updatedRevision?: number }>[] = []
        for (let i = 0; i < concurrencyLevel; i++) {
            for (const location of locations) {
                promises.push(repo.upsert(location))
            }
        }

        // Execute all upserts concurrently
        const results = await Promise.all(promises)

        // Assert: only one creation per location (3 total creates across 45 operations)
        const createdCount = results.filter((r) => r.created).length
        assert.equal(createdCount, locationIds.length, `Expected ${locationIds.length} creates but got ${createdCount}`)

        // Assert: all subsequent operations returned created=false
        const updateCount = results.filter((r) => !r.created).length
        assert.equal(updateCount, concurrencyLevel * locationIds.length - locationIds.length)

        // Verify locations exist and have correct content
        for (const location of locations) {
            const retrieved = await repo.get(location.id)
            assert.ok(retrieved, `Location ${location.id} should exist`)
            assert.equal(retrieved.name, location.name)
            assert.equal(retrieved.description, location.description)
        }
    })

    /**
     * Stress test: concurrent ensureExit on same edge set
     * Validates: only one creation per edge, no duplicate edges
     */
    test('concurrent ensureExit maintains idempotency - no duplicate edges', async () => {
        const repo = new InMemoryLocationRepository()

        // Pre-seed locations
        const locations: Location[] = [
            { id: 'A', name: 'Location A', description: 'Start point', exits: [] },
            { id: 'B', name: 'Location B', description: 'Mid point', exits: [] },
            { id: 'C', name: 'Location C', description: 'End point', exits: [] }
        ]

        for (const loc of locations) {
            await repo.upsert(loc)
        }

        // Define edge set
        const edges = [
            { from: 'A', direction: 'north', to: 'B' },
            { from: 'B', direction: 'south', to: 'A' },
            { from: 'B', direction: 'east', to: 'C' },
            { from: 'C', direction: 'west', to: 'B' }
        ]

        // Number of concurrent operations per edge
        const concurrencyLevel = 20

        // Create N parallel promises attempting to create the same edges
        const promises: Promise<{ created: boolean }>[] = []
        for (let i = 0; i < concurrencyLevel; i++) {
            for (const edge of edges) {
                promises.push(repo.ensureExit(edge.from, edge.direction, edge.to))
            }
        }

        // Execute all ensureExit calls concurrently
        const results = await Promise.all(promises)

        // Assert: only one creation per edge
        const createdCount = results.filter((r) => r.created).length
        assert.equal(createdCount, edges.length, `Expected ${edges.length} creates but got ${createdCount}`)

        // Assert: all subsequent operations returned created=false
        const skippedCount = results.filter((r) => !r.created).length
        assert.equal(skippedCount, concurrencyLevel * edges.length - edges.length)

        // Verify edges exist and no duplicates
        for (const edge of edges) {
            const location = await repo.get(edge.from)
            assert.ok(location, `Location ${edge.from} should exist`)

            const matchingExits = location.exits?.filter((e) => e.direction === edge.direction && e.to === edge.to) || []
            assert.equal(
                matchingExits.length,
                1,
                `Expected exactly 1 exit from ${edge.from} ${edge.direction} to ${edge.to}, found ${matchingExits.length}`
            )
        }
    })

    /**
     * Stress test: version increments only on actual content changes
     * Validates: minimal version inflation under parallel upserts
     */
    test('concurrent upsert with same content - minimal version increments', async () => {
        const repo = new InMemoryLocationRepository()

        // Create initial location
        const initialLocation: Location = {
            id: 'version-test',
            name: 'Version Test Location',
            description: 'Testing version increment behavior',
            exits: [],
            version: 1
        }

        await repo.upsert(initialLocation)

        // Verify initial version
        let location = await repo.get('version-test')
        assert.equal(location?.version, 1)

        // Concurrent upserts with SAME content (no changes)
        const sameContentPromises: Promise<{ created: boolean; id: string; updatedRevision?: number }>[] = []
        for (let i = 0; i < 15; i++) {
            sameContentPromises.push(
                repo.upsert({
                    ...initialLocation,
                    version: undefined // Don't specify version, let repo calculate
                })
            )
        }

        const sameContentResults = await Promise.all(sameContentPromises)

        // Assert: no version increments when content unchanged
        const versionsIncremented = sameContentResults.filter((r) => r.updatedRevision !== undefined).length
        assert.equal(versionsIncremented, 0, 'Version should not increment when content unchanged')

        location = await repo.get('version-test')
        assert.equal(location?.version, 1, 'Version should remain 1 after same-content upserts')
    })

    /**
     * Stress test: version increments exactly once per content change
     * Validates: deterministic version increment behavior
     */
    test('concurrent upsert with changed content - version increments only once per change', async () => {
        const repo = new InMemoryLocationRepository()

        // Create initial location
        const initialLocation: Location = {
            id: 'version-change-test',
            name: 'Version Change Test',
            description: 'Initial description',
            exits: [],
            version: 1
        }

        await repo.upsert(initialLocation)

        // Concurrent upserts with CHANGED content
        const changedLocation: Location = {
            ...initialLocation,
            description: 'Updated description',
            version: undefined
        }

        const changedContentPromises: Promise<{ created: boolean; id: string; updatedRevision?: number }>[] = []
        for (let i = 0; i < 15; i++) {
            changedContentPromises.push(repo.upsert(changedLocation))
        }

        const changedContentResults = await Promise.all(changedContentPromises)

        // Assert: exactly one version increment (first operation that detects change)
        const versionsIncremented = changedContentResults.filter((r) => r.updatedRevision !== undefined).length
        assert.equal(versionsIncremented, 1, 'Version should increment exactly once when content changes')

        // Verify final version is 2
        const location = await repo.get('version-change-test')
        assert.equal(location?.version, 2, 'Version should be 2 after content change')
        assert.equal(location?.description, 'Updated description')
    })

    /**
     * Combined stress test: concurrent upserts + ensureExit operations
     * Validates: full seeding scenario with mixed operations
     *
     * Note: This test ensures locations exist before creating exits, which is
     * the expected pattern for seeding operations. The concurrent upserts ensure
     * idempotency on vertex creation, then exits are created with similar guarantees.
     */
    test('concurrent mixed operations - full seeding scenario', async () => {
        const repo = new InMemoryLocationRepository()

        // Define location set
        const locationIds = ['hub', 'north-room', 'south-room', 'east-room', 'west-room']
        const locations: Location[] = locationIds.map((id) => ({
            id,
            name: `Room ${id}`,
            description: `Description for ${id}`,
            exits: []
        }))

        // Define edge set (star pattern from hub)
        const edges = [
            { from: 'hub', direction: 'north', to: 'north-room' },
            { from: 'north-room', direction: 'south', to: 'hub' },
            { from: 'hub', direction: 'south', to: 'south-room' },
            { from: 'south-room', direction: 'north', to: 'hub' },
            { from: 'hub', direction: 'east', to: 'east-room' },
            { from: 'east-room', direction: 'west', to: 'hub' },
            { from: 'hub', direction: 'west', to: 'west-room' },
            { from: 'west-room', direction: 'east', to: 'hub' }
        ]

        // Simulate parallel seeding: multiple workers trying to seed simultaneously
        const workers = 12

        // Phase 1: Concurrent upserts (ensure all locations exist first)
        const upsertPromises: Promise<{ created: boolean; id: string; updatedRevision?: number }>[] = []
        for (let worker = 0; worker < workers; worker++) {
            for (const location of locations) {
                upsertPromises.push(repo.upsert(location))
            }
        }
        const upsertResults = await Promise.all(upsertPromises)

        // Assert: exactly one creation per location
        const locationsCreated = upsertResults.filter((r) => r.created).length
        assert.equal(locationsCreated, locations.length, `Expected ${locations.length} location creates, got ${locationsCreated}`)

        // Phase 2: Concurrent exit creation (now that locations are guaranteed to exist)
        const exitPromises: Promise<{ created: boolean }>[] = []
        for (let worker = 0; worker < workers; worker++) {
            for (const edge of edges) {
                exitPromises.push(repo.ensureExit(edge.from, edge.direction, edge.to))
            }
        }
        const exitResults = await Promise.all(exitPromises)

        // Assert: exactly one creation per edge
        const edgesCreated = exitResults.filter((r) => r.created).length
        assert.equal(edgesCreated, edges.length, `Expected ${edges.length} edge creates, got ${edgesCreated}`)

        // Verify data integrity: all locations exist with correct edges
        for (const edge of edges) {
            const location = await repo.get(edge.from)
            assert.ok(location, `Location ${edge.from} should exist`)

            const matchingExits = location.exits?.filter((e) => e.direction === edge.direction && e.to === edge.to) || []
            assert.equal(matchingExits.length, 1, `Expected exactly 1 exit from ${edge.from} ${edge.direction} to ${edge.to}`)
        }

        // Verify hub has 4 exits (to all 4 rooms)
        const hub = await repo.get('hub')
        assert.equal(hub?.exits?.length, 4, 'Hub should have 4 exits')
    })

    /**
     * Edge case: concurrent ensureExitBidirectional with reciprocal flag
     * Validates: no duplicate reciprocal edges
     */
    test('concurrent ensureExitBidirectional maintains idempotency', async () => {
        const repo = new InMemoryLocationRepository()

        // Pre-seed locations
        await repo.upsert({ id: 'X', name: 'Location X', description: 'Start', exits: [] })
        await repo.upsert({ id: 'Y', name: 'Location Y', description: 'End', exits: [] })

        // Concurrent bidirectional exit creation
        const promises: Promise<{ created: boolean; reciprocalCreated?: boolean }>[] = []
        for (let i = 0; i < 20; i++) {
            promises.push(repo.ensureExitBidirectional('X', 'north', 'Y', { reciprocal: true }))
        }

        const results = await Promise.all(promises)

        // Assert: exactly one forward creation
        const forwardCreated = results.filter((r) => r.created).length
        assert.equal(forwardCreated, 1, 'Forward exit should be created exactly once')

        // Assert: exactly one reciprocal creation
        const reciprocalCreated = results.filter((r) => r.reciprocalCreated).length
        assert.equal(reciprocalCreated, 1, 'Reciprocal exit should be created exactly once')

        // Verify: X has one north exit to Y
        const locX = await repo.get('X')
        const xExits = locX?.exits?.filter((e) => e.direction === 'north' && e.to === 'Y') || []
        assert.equal(xExits.length, 1, 'X should have exactly one north exit to Y')

        // Verify: Y has one south exit to X
        const locY = await repo.get('Y')
        const yExits = locY?.exits?.filter((e) => e.direction === 'south' && e.to === 'X') || []
        assert.equal(yExits.length, 1, 'Y should have exactly one south exit to X')
    })
})
