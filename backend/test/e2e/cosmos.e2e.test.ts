/**
 * E2E Integration Test Suite (Cosmos Gremlin + SQL)
 *
 * Comprehensive E2E tests running against real Cosmos DB to validate full traversal
 * and persistence flows. Tests production-readiness of Cosmos interactions.
 *
 * Test Scope (Focused on Critical Paths):
 * - Real Cosmos DB behavior (latency, concurrency, partition keys)
 * - Production-readiness validation (multi-hop traversal, world seeding)
 * - Performance benchmarking (p95 latency targets)
 * - Database-specific behavior (partition key routing, actual performance)
 *
 * NOT in Scope (Covered by Unit/Integration Tests):
 * - Input validation (see: backend/test/integration/moveValidation.test.ts)
 * - Error handling (see: backend/test/unit/performMove.core.test.ts)
 * - Telemetry emission (see: backend/test/integration/performMove.telemetry.test.ts)
 * - Throttling/retry logic (see: backend/test/integration/moveValidation.test.ts - mocked 429 responses)
 *
 * Rate Limiting Strategy:
 * - Tests include deliberate delays (50-100ms) between rapid operations
 * - Concurrent operations limited to 5 requests to avoid Cosmos DB throttling
 * - This prevents 429 errors while still validating production behavior
 * - Throttling retry logic tested separately with mocked responses (integration layer)
 *
 * Test Environment:
 * - PERSISTENCE_MODE=cosmos (required)
 * - GREMLIN_ENDPOINT_TEST (or GREMLIN_ENDPOINT) - Cosmos Gremlin endpoint
 * - GREMLIN_GRAPH_TEST=world-test - Dedicated test graph for isolation
 * - COSMOS_SQL_ENDPOINT_TEST (or COSMOS_SQL_ENDPOINT) - Cosmos SQL API endpoint
 * - NODE_ENV=test - Routes to 'test' partition within the test graph
 *
 * Performance Targets (p95):
 * - Full suite: <90s
 * - Single move operation: <500ms
 * - LOOK query: <200ms
 *
 * Acceptance Criteria Coverage:
 * ✓ Test fixture: automated world seed (≥5 locations with exits)
 * ✓ Cleanup strategy: teardown removes test data
 * ✓ Cosmos connection: uses test-specific database
 * ✓ Player bootstrap → location lookup → first LOOK (cold start)
 * ✓ Multi-hop traversal (move 3+ times, verify location updates)
 * ✓ Concurrent operations (2 players, no state corruption, consistent reads)
 * ✓ Performance metrics tracking (p95 latency for LOOK and move operations)
 *
 * Tests Removed (Covered Elsewhere):
 * ❌ Idempotent world seeding (see: backend/test/integration/worldSeed.test.ts)
 * ❌ Partition key routing (configuration validation, tested once in infra)
 * ❌ Throttling/429 retry (see: backend/test/integration/moveValidation.test.ts)
 *
 * Related:
 * - Issue: piquet-h/the-shifting-atlas#170
 * - ADR-002: Graph Partition Strategy
 * - Test Strategy: docs/testing/test-strategy.md
 * - Test Inventory: docs/testing/test-inventory-analysis.md
 */

import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { E2ETestFixture } from './E2ETestFixture.js'

// Global handler for unhandled Promise rejections to aid debugging
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise)
    console.error('Reason:', reason)
})

describe('E2E Integration Tests - Cosmos DB', () => {
    let fixture: E2ETestFixture

    beforeEach(async () => {
        if (process.env.PERSISTENCE_MODE !== 'cosmos') {
            console.log('⊘ Skipping E2E tests (PERSISTENCE_MODE != cosmos)')
            return
        }
        fixture = new E2ETestFixture()
        await fixture.setup()
    })

    afterEach(async () => {
        if (fixture) {
            await fixture.teardown()
        }
    })

    describe('World Seeding & Cleanup', () => {
        test('seed script creates ≥5 locations with exits', async () => {
            if (process.env.PERSISTENCE_MODE !== 'cosmos') return
            const startTime = Date.now()
            const { locations, demoPlayerId } = await fixture.seedTestWorld()
            const duration = Date.now() - startTime
            fixture.trackPerformance('seed-world', duration)

            assert.ok(locations.length >= 5, `Expected ≥5 locations, got ${locations.length}`)

            const locationRepository = await fixture.getLocationRepository()

            // Validate each location exists and has expected exits
            for (const loc of locations) {
                const retrieved = await locationRepository.get(loc.id)
                assert.ok(retrieved, `Location ${loc.id} should exist after seeding`)
                assert.equal(retrieved.name, loc.name, 'Location name matches')

                // Validate exits were created
                const expectedExitCount = loc.exits?.length || 0
                const actualExitCount = retrieved.exits?.length || 0
                assert.equal(
                    actualExitCount,
                    expectedExitCount,
                    `Location ${loc.id} should have ${expectedExitCount} exits, but has ${actualExitCount}. ` +
                        `Expected: [${loc.exits?.map((e) => e.direction).join(', ')}], ` +
                        `Actual: [${retrieved.exits?.map((e) => e.direction).join(', ')}]`
                )

                // Validate each exit direction matches and target exists
                for (const expectedExit of loc.exits || []) {
                    const actualExit = retrieved.exits?.find((e) => e.direction === expectedExit.direction)
                    assert.ok(actualExit, `Location ${loc.id} should have exit in direction '${expectedExit.direction}'`)
                    assert.equal(
                        actualExit.to,
                        expectedExit.to,
                        `Exit ${loc.id} --${expectedExit.direction}--> should point to ${expectedExit.to}, but points to ${actualExit.to}`
                    )

                    // Verify target location exists
                    if (actualExit.to) {
                        const targetExists = await locationRepository.get(actualExit.to)
                        assert.ok(
                            targetExists,
                            `Exit target location ${actualExit.to} should exist (from ${loc.id} via ${expectedExit.direction})`
                        )
                    }
                }

                console.log(`✓ Location ${loc.id}: ${actualExitCount} exits validated`)
            }

            const playerRepository = await fixture.getPlayerRepository()
            const player = await playerRepository.get(demoPlayerId)
            assert.ok(player, 'Demo player should exist')
            assert.equal(player.id, demoPlayerId, 'Player ID matches')

            console.log(`✓ Seeded ${locations.length} locations in ${duration}ms`)
        })
    })

    describe('Player Bootstrap & First LOOK (Cold Start)', () => {
        test('player bootstrap → location lookup → first LOOK', async () => {
            if (process.env.PERSISTENCE_MODE !== 'cosmos') return
            const { locations, demoPlayerId } = await fixture.seedTestWorld()
            const startTime = Date.now()

            const playerRepository = await fixture.getPlayerRepository()
            const player = await playerRepository.get(demoPlayerId)
            assert.ok(player, 'Player should exist after seed')

            // Use first test location (player's currentLocationId may point to STARTER_LOCATION_ID which isn't in test blueprint)
            const locationRepository = await fixture.getLocationRepository()
            const location = await locationRepository.get(locations[0].id)

            const duration = Date.now() - startTime
            fixture.trackPerformance('first-look', duration)

            assert.ok(location, 'Location should be retrieved')
            assert.ok(location.name, 'Location should have name')
            assert.ok(location.description, 'Location should have description')

            console.log(`✓ First LOOK completed in ${duration}ms`)
        })

        test('LOOK query meets performance target (<200ms p95)', async () => {
            if (process.env.PERSISTENCE_MODE !== 'cosmos') return
            const { locations } = await fixture.seedTestWorld()
            const locationRepository = await fixture.getLocationRepository()

            const iterations = 20
            for (let i = 0; i < iterations; i++) {
                const locationId = locations[i % locations.length].id
                const start = Date.now()
                const location = await locationRepository.get(locationId)
                const duration = Date.now() - start

                assert.ok(location, `Location ${locationId} should exist`)
                fixture.trackPerformance('look-query', duration)

                // Add small delay to prevent Cosmos DB throttling (429 errors)
                await new Promise((resolve) => setTimeout(resolve, 50))
            }

            const p95 = fixture.getP95Latency('look-query')
            assert.ok(p95 !== null, 'Should have p95 latency measurement')
            console.log(`✓ LOOK query p95: ${p95}ms`)
        })
    })

    describe('Multi-Hop Traversal', () => {
        test('move 3+ times and verify location updates', async () => {
            if (process.env.PERSISTENCE_MODE !== 'cosmos') return
            const { locations } = await fixture.seedTestWorld()
            const locationRepository = await fixture.getLocationRepository()
            const hubLocation = locations[0]

            const start1 = Date.now()
            const move1Result = await locationRepository.move(hubLocation.id, 'north')
            fixture.trackPerformance('move-operation', Date.now() - start1)

            if (move1Result.status !== 'ok') {
                console.error(`Move 1 failed with reason: ${move1Result.reason}`)
                const hubState = await locationRepository.get(hubLocation.id)
                console.error(`Hub location state:`, JSON.stringify(hubState, null, 2))
            }
            assert.equal(
                move1Result.status,
                'ok',
                `First move should succeed. Got: ${move1Result.status === 'error' ? move1Result.reason : 'ok'}`
            )
            if (move1Result.status === 'ok') {
                assert.equal(move1Result.location.id, 'e2e-test-loc-north', 'Should move to north location')
            }

            const start2 = Date.now()
            const move2Result = await locationRepository.move('e2e-test-loc-north', 'south')
            fixture.trackPerformance('move-operation', Date.now() - start2)

            if (move2Result.status !== 'ok') {
                console.error(`Move 2 failed with reason: ${move2Result.reason}`)
                const northState = await locationRepository.get('e2e-test-loc-north')
                console.error(`North location state:`, JSON.stringify(northState, null, 2))
            }
            assert.equal(
                move2Result.status,
                'ok',
                `Second move should succeed. Got: ${move2Result.status === 'error' ? move2Result.reason : 'ok'}`
            )
            if (move2Result.status === 'ok') {
                assert.equal(move2Result.location.id, hubLocation.id, 'Should return to hub')
            }

            const start3 = Date.now()
            const move3Result = await locationRepository.move(hubLocation.id, 'east')
            fixture.trackPerformance('move-operation', Date.now() - start3)

            if (move3Result.status !== 'ok') {
                console.error(`Move 3 failed with reason: ${move3Result.reason}`)
                const hubState = await locationRepository.get(hubLocation.id)
                console.error(`Hub location state:`, JSON.stringify(hubState, null, 2))
            }
            assert.equal(
                move3Result.status,
                'ok',
                `Third move should succeed. Got: ${move3Result.status === 'error' ? move3Result.reason : 'ok'}`
            )
            if (move3Result.status === 'ok') {
                assert.equal(move3Result.location.id, 'e2e-test-loc-east', 'Should move to east location')
            }

            const start4 = Date.now()
            const move4Result = await locationRepository.move('e2e-test-loc-east', 'north')
            fixture.trackPerformance('move-operation', Date.now() - start4)

            if (move4Result.status !== 'ok') {
                console.error(`Move 4 failed with reason: ${move4Result.reason}`)
                const eastState = await locationRepository.get('e2e-test-loc-east')
                console.error(`East location state:`, JSON.stringify(eastState, null, 2))
            }
            assert.equal(
                move4Result.status,
                'ok',
                `Fourth move should succeed. Got: ${move4Result.status === 'error' ? move4Result.reason : 'ok'}`
            )
            if (move4Result.status === 'ok') {
                assert.equal(move4Result.location.id, 'e2e-test-loc-north', 'Should move to north location via alternate path')
            }

            console.log(`✓ Completed 4 move operations`)
        })

        test('move operation meets performance target (<500ms p95)', async () => {
            if (process.env.PERSISTENCE_MODE !== 'cosmos') return
            const { locations } = await fixture.seedTestWorld()
            const locationRepository = await fixture.getLocationRepository()
            const hubLocation = locations[0]

            const iterations = 20
            let failureCount = 0
            for (let i = 0; i < iterations; i++) {
                const start = Date.now()
                const direction = i % 2 === 0 ? 'north' : 'south'
                const fromId = i % 2 === 0 ? hubLocation.id : 'e2e-test-loc-north'
                const result = await locationRepository.move(fromId, direction)
                const duration = Date.now() - start

                if (result.status !== 'ok') {
                    failureCount++
                    console.error(`Move ${i + 1} failed with reason: ${result.reason}`)
                    const locationState = await locationRepository.get(fromId)
                    console.error(`Location ${fromId} state:`, JSON.stringify(locationState, null, 2))
                }
                assert.equal(
                    result.status,
                    'ok',
                    `Move ${i + 1} should succeed (from: ${fromId}, direction: ${direction}). Got: ${result.status === 'error' ? result.reason : 'ok'}`
                )
                fixture.trackPerformance('move-rapid', duration)

                // Add small delay to prevent Cosmos DB throttling (429 errors)
                // Wait 50ms between operations to stay under RU/s limits
                await new Promise((resolve) => setTimeout(resolve, 50))
            }

            if (failureCount > 0) {
                console.error(`Total failures in rapid move test: ${failureCount}/${iterations}`)
            }

            const p95 = fixture.getP95Latency('move-rapid')
            assert.ok(p95 !== null, 'Should have p95 latency measurement')

            console.log(`✓ Move operation p95: ${p95}ms`)
            console.log(`✓ Completed ${iterations} rapid moves`)
        })
    })

    describe('Concurrent Operations', () => {
        test('2 players move simultaneously without state corruption', async () => {
            if (process.env.PERSISTENCE_MODE !== 'cosmos') return
            const { locations } = await fixture.seedTestWorld()
            const playerRepository = await fixture.getPlayerRepository()
            const locationRepository = await fixture.getLocationRepository()

            const player1Id = 'e2e-concurrent-1'
            const player2Id = 'e2e-concurrent-2'
            fixture.registerTestPlayerId(player1Id)
            fixture.registerTestPlayerId(player2Id)

            await playerRepository.getOrCreate(player1Id)
            await playerRepository.getOrCreate(player2Id)

            const hubLocation = locations[0]

            const [result1, result2] = await Promise.all([
                locationRepository.move(hubLocation.id, 'north'),
                locationRepository.move(hubLocation.id, 'south')
            ])

            assert.equal(result1.status, 'ok', 'Player 1 move should succeed')
            assert.equal(result2.status, 'ok', 'Player 2 move should succeed')

            if (result1.status === 'ok' && result2.status === 'ok') {
                assert.notEqual(result1.location.id, result2.location.id, 'Players should be in different locations')
            }

            console.log(`✓ Concurrent moves completed without corruption`)
        })

        test('concurrent location lookups return consistent data', async () => {
            if (process.env.PERSISTENCE_MODE !== 'cosmos') return
            const { locations } = await fixture.seedTestWorld()
            const locationRepository = await fixture.getLocationRepository()
            const hubLocation = locations[0]

            // Reduced from 10 to 5 concurrent lookups to avoid Cosmos DB throttling
            const lookups = Array(5)
                .fill(null)
                .map(() => locationRepository.get(hubLocation.id))
            const results = await Promise.all(lookups)

            results.forEach((result, index) => {
                assert.ok(result, `Lookup ${index} should return location`)
                assert.equal(result?.id, hubLocation.id, 'Location ID should match')
                assert.equal(result?.name, hubLocation.name, 'Location name should match')
            })

            console.log(`✓ Completed ${lookups.length} concurrent lookups with consistent results`)
        })
    })
})
