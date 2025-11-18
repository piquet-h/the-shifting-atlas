import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'
import type { ContainerMode } from '../helpers/testInversify.config.js'

/**
 * Run test suite against both memory and cosmos modes
 * Cosmos mode tests will skip gracefully if infrastructure is not available
 */
function describeForBothModes(suiteName: string, testFn: (mode: ContainerMode) => void): void {
    const modes: ContainerMode[] = ['memory', 'cosmos']

    for (const mode of modes) {
        describe(`${suiteName} [${mode}]`, () => {
            // Skip cosmos tests if PERSISTENCE_MODE is not explicitly set to 'cosmos'
            // This allows tests to run in CI without requiring Cosmos DB credentials
            if (mode === 'cosmos' && process.env.PERSISTENCE_MODE !== 'cosmos') {
                test.skip('Cosmos tests skipped (PERSISTENCE_MODE != cosmos)', () => {})
                return
            }
            testFn(mode)
        })
    }
}

describeForBothModes('Exit Repository', (mode) => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture(mode)
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    test('getExits returns exits from repository', async () => {
        const locationRepo = await fixture.getLocationRepository()
        const exitRepo = await fixture.getExitRepository()

        // Create location with exits
        await locationRepo.upsert({
            id: 'loc-1',
            name: 'Location 1',
            description: 'First location',
            exits: []
        })
        await locationRepo.upsert({
            id: 'loc-2',
            name: 'Location 2',
            description: 'Second location',
            exits: []
        })
        await locationRepo.upsert({
            id: 'loc-3',
            name: 'Location 3',
            description: 'Third location',
            exits: []
        })
        await locationRepo.ensureExit('loc-1', 'north', 'loc-2')
        await locationRepo.ensureExit('loc-1', 'east', 'loc-3')

        const exits = await exitRepo.getExits('loc-1')

        assert.strictEqual(exits.length, 2)
        // Exits should be sorted
        assert.strictEqual(exits[0].direction, 'north')
        assert.strictEqual(exits[0].toLocationId, 'loc-2')
        assert.strictEqual(exits[1].direction, 'east')
        assert.strictEqual(exits[1].toLocationId, 'loc-3')
    })

    test('getExits returns empty array for unknown location', async () => {
        const exitRepo = await fixture.getExitRepository()
        const exits = await exitRepo.getExits('unknown-loc')

        assert.strictEqual(exits.length, 0)
    })

    test('getExits returns ordered exits', async () => {
        const locationRepo = await fixture.getLocationRepository()
        const exitRepo = await fixture.getExitRepository()

        // Create locations
        await locationRepo.upsert({ id: 'loc1', name: 'Location 1', description: 'First', exits: [] })
        await locationRepo.upsert({ id: 'A', name: 'Location A', description: 'North', exits: [] })
        await locationRepo.upsert({ id: 'B', name: 'Location B', description: 'South', exits: [] })
        await locationRepo.upsert({ id: 'C', name: 'Location C', description: 'East', exits: [] })

        // Create exits in non-canonical order
        await locationRepo.ensureExit('loc1', 'south', 'B')
        await locationRepo.ensureExit('loc1', 'north', 'A')
        await locationRepo.ensureExit('loc1', 'east', 'C')

        const exits = await exitRepo.getExits('loc1')

        assert.strictEqual(exits.length, 3)
        assert.strictEqual(exits[0].direction, 'north')
        assert.strictEqual(exits[1].direction, 'south')
        assert.strictEqual(exits[2].direction, 'east')
    })

    test('getExits returns empty array for location with no exits', async () => {
        const locationRepo = await fixture.getLocationRepository()
        const exitRepo = await fixture.getExitRepository()

        await locationRepo.upsert({
            id: 'loc1',
            name: 'Empty Location',
            description: 'No exits',
            exits: []
        })

        const exits = await exitRepo.getExits('loc1')

        assert.strictEqual(exits.length, 0)
    })

    test('exits are returned sorted when fetched from seeded data', async () => {
        const exitRepo = await fixture.getExitRepository()
        // Use Mosswell River Jetty ID from seed data
        const exits = await exitRepo.getExits('a4d1c3f1-5b2a-4f7d-9d4b-8f0c2a6b7e21')

        assert.ok(exits.length > 0, 'Should have exits from seed data')
        // Verify exits are in canonical order (first should be a cardinal direction if present)
        if (exits.length > 1) {
            const directions = exits.map((e) => e.direction)
            // Check that at least the basic ordering is maintained (north before east, etc)
            const northIndex = directions.indexOf('north')
            const southIndex = directions.indexOf('south')
            const eastIndex = directions.indexOf('east')
            const westIndex = directions.indexOf('west')

            if (northIndex !== -1 && eastIndex !== -1) {
                assert.ok(northIndex < eastIndex, 'North should come before east')
            }
            if (southIndex !== -1 && eastIndex !== -1) {
                assert.ok(southIndex < eastIndex, 'South should come before east')
            }
        }
    })

    test('getExits returns empty array for non-existent location', async () => {
        const exitRepo = await fixture.getExitRepository()
        const exits = await exitRepo.getExits('non-existent-id')

        assert.strictEqual(exits.length, 0)
    })

    test('getExits maintains canonical exit ordering with mixed directions', async () => {
        const locationRepo = await fixture.getLocationRepository()
        const exitRepo = await fixture.getExitRepository()

        // Create locations
        await locationRepo.upsert({ id: 'test-loc', name: 'Test Location', description: 'Test', exits: [] })
        await locationRepo.upsert({ id: 'loc-a', name: 'Location A', description: 'North', exits: [] })
        await locationRepo.upsert({ id: 'loc-b', name: 'Location B', description: 'East', exits: [] })
        await locationRepo.upsert({ id: 'loc-c', name: 'Location C', description: 'West', exits: [] })
        await locationRepo.upsert({ id: 'loc-d', name: 'Location D', description: 'Down', exits: [] })

        // Create exits in non-canonical order
        await locationRepo.ensureExit('test-loc', 'down', 'loc-d')
        await locationRepo.ensureExit('test-loc', 'north', 'loc-a')
        await locationRepo.ensureExit('test-loc', 'west', 'loc-c')
        await locationRepo.ensureExit('test-loc', 'east', 'loc-b')

        const exits = await exitRepo.getExits('test-loc')

        assert.strictEqual(exits.length, 4)
        assert.strictEqual(exits[0].direction, 'north')
        assert.strictEqual(exits[1].direction, 'east')
        assert.strictEqual(exits[2].direction, 'west')
        assert.strictEqual(exits[3].direction, 'down')
    })
})
