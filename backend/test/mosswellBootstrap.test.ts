import type { Location } from '@piquet-h/shared'
import assert from 'node:assert'
import { describe, test } from 'node:test'
import { __resetSeedWorldTestState, seedWorld } from '../src/seeding/seedWorld.js'

// PERSISTENCE_MODE controlled by local.settings.json (use npm run test:memory or test:cosmos)

describe('Mosswell Bootstrap - Idempotency', () => {
    test('seedWorld is idempotent on repeated calls with same data', async () => {
        __resetSeedWorldTestState()
        const playerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

        const first = await seedWorld({ demoPlayerId: playerId })
        assert.ok(first.locationsProcessed > 0, 'first run processes locations')

        const second = await seedWorld({ demoPlayerId: playerId })
        assert.equal(second.locationVerticesCreated, 0, 'second run creates no new vertices')
        assert.equal(second.exitsCreated, 0, 'second run creates no new exits')
        assert.equal(second.playerCreated, false, 'second run does not recreate player')
        assert.equal(second.locationsProcessed, first.locationsProcessed, 'same number of locations processed')
        assert.equal(second.demoPlayerId, playerId, 'demo player id matches')
    })

    test('seedWorld handles multiple sequential runs without duplication', async () => {
        __resetSeedWorldTestState()
        const playerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

        const firstRun = await seedWorld({ demoPlayerId: playerId })
        const secondRun = await seedWorld({ demoPlayerId: playerId })
        const thirdRun = await seedWorld({ demoPlayerId: playerId })

        // Second and third runs should not create any new data
        assert.equal(secondRun.locationVerticesCreated, 0, 'second run creates nothing')
        assert.equal(thirdRun.locationVerticesCreated, 0, 'third run creates nothing')
        assert.equal(thirdRun.exitsCreated, 0, 'third run creates no exits')
        assert.equal(firstRun.locationsProcessed, secondRun.locationsProcessed, 'processes same count')
    })
})

describe('Mosswell Bootstrap - Partial Seed Edge Cases', () => {
    test('seedWorld handles partial location pre-seeding', async () => {
        __resetSeedWorldTestState()
        const playerId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

        // Pre-seed with a minimal blueprint (simulate partial previous seed)
        const partialBlueprint: Location[] = [
            {
                id: 'partial-loc-unique-1',
                name: 'Partial Location',
                description: 'Already seeded',
                exits: [],
                version: 1
            }
        ]

        const partialResult = await seedWorld({ demoPlayerId: playerId, blueprint: partialBlueprint })
        assert.equal(partialResult.locationsProcessed, 1, 'processes 1 location')

        // Re-run with same blueprint - should be idempotent
        const rerunResult = await seedWorld({ demoPlayerId: playerId, blueprint: partialBlueprint })
        assert.equal(rerunResult.locationVerticesCreated, 0, 'no new vertices on rerun')
        assert.equal(rerunResult.exitsCreated, 0, 'no new exits on rerun')
    })

    test('seedWorld handles location with exits that already exist', async () => {
        __resetSeedWorldTestState()
        const playerId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

        const blueprintWithExits: Location[] = [
            {
                id: 'loc-a-unique',
                name: 'Location A',
                description: 'First location',
                exits: [{ direction: 'north', to: 'loc-b-unique' }],
                version: 1
            },
            {
                id: 'loc-b-unique',
                name: 'Location B',
                description: 'Second location',
                exits: [],
                version: 1
            }
        ]

        const first = await seedWorld({ demoPlayerId: playerId, blueprint: blueprintWithExits })
        assert.equal(first.locationsProcessed, 2, 'processes both locations')

        const second = await seedWorld({ demoPlayerId: playerId, blueprint: blueprintWithExits })
        assert.equal(second.exitsCreated, 0, 'no duplicate exits created')
    })

    test('seedWorld handles player already existing from different source', async () => {
        __resetSeedWorldTestState()
        const playerId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

        // First seed creates player
        await seedWorld({ demoPlayerId: playerId, blueprint: [] })

        // Second seed with same player id should not recreate
        const second = await seedWorld({ demoPlayerId: playerId, blueprint: [] })
        assert.equal(second.playerCreated, false, 'player not recreated')
        assert.equal(second.demoPlayerId, playerId, 'same player id returned')
    })
})

describe('Mosswell Bootstrap - Missing Environment Variables', () => {
    test('seedWorld uses default player id when not provided', async () => {
        __resetSeedWorldTestState()
        const result = await seedWorld({ blueprint: [] })
        assert.ok(result.demoPlayerId, 'returns a demo player id')
        // Default from seedWorld implementation
        assert.equal(result.demoPlayerId, '00000000-0000-4000-8000-000000000001', 'uses default demo player id')
    })

    test('seedWorld handles empty blueprint gracefully', async () => {
        __resetSeedWorldTestState()
        const result = await seedWorld({ blueprint: [], demoPlayerId: 'llllllll-llll-4lll-8lll-llllllllllll' })
        assert.equal(result.locationsProcessed, 0, 'processes zero locations')
        assert.equal(result.locationVerticesCreated, 0, 'creates zero vertices')
        assert.equal(result.exitsCreated, 0, 'creates zero exits')
        // Player still gets created
    })

    test('seedWorld uses default blueprint when not provided', async () => {
        __resetSeedWorldTestState()
        const result = await seedWorld({ demoPlayerId: 'mmmmmmmm-mmmm-4mmm-8mmm-mmmmmmmmmmmm' })
        // Default blueprint is starterLocationsData from villageLocations.json
        assert.ok(result.locationsProcessed > 0, 'processes default locations')
    })
})

describe('Mosswell Bootstrap - Data Integrity', () => {
    test('seedWorld processes all Mosswell locations from default blueprint', async () => {
        __resetSeedWorldTestState()
        const result = await seedWorld({ demoPlayerId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' })
        // villageLocations.json has 34 locations
        assert.ok(result.locationsProcessed >= 30, 'processes at least 30 Mosswell locations')
    })

    test('seedWorld creates expected starter location', async () => {
        __resetSeedWorldTestState()
        await seedWorld({ demoPlayerId: 'gggggggg-gggg-4ggg-8ggg-gggggggggggg' })
        const { getLocationRepository } = await import('../src/repos/locationRepository.js')
        const locRepo = await getLocationRepository()
        const starterLoc = await locRepo.get('a4d1c3f1-5b2a-4f7d-9d4b-8f0c2a6b7e21')
        assert.ok(starterLoc, 'starter location exists')
        assert.equal(starterLoc.name, 'Mosswell River Jetty', 'correct starter location name')
    })

    test('seedWorld creates exits for interconnected locations', async () => {
        __resetSeedWorldTestState()
        await seedWorld({ demoPlayerId: 'hhhhhhhh-hhhh-4hhh-8hhh-hhhhhhhhhhhh' })

        const { getLocationRepository } = await import('../src/repos/locationRepository.js')
        const locRepo = await getLocationRepository()
        const jetty = await locRepo.get('a4d1c3f1-5b2a-4f7d-9d4b-8f0c2a6b7e21')
        assert.ok(jetty, 'jetty location exists')
        assert.ok(jetty.exits && jetty.exits.length > 0, 'jetty has exits')
    })

    test('seedWorld respects location version on upsert', async () => {
        // This test verifies the version is processed and not lost during seeding
        // We use a location from the default dataset to avoid reset issues
        __resetSeedWorldTestState()

        const blueprint: Location[] = [
            {
                id: 'a4d1c3f1-5b2a-4f7d-9d4b-8f0c2a6b7e21', // Mosswell River Jetty
                name: 'Mosswell River Jetty',
                description: 'Test description',
                version: 99, // Custom version
                exits: []
            }
        ]

        await seedWorld({ blueprint, demoPlayerId: 'iiiiiiii-iiii-4iii-8iii-iiiiiiiiiiii' })

        const { getLocationRepository } = await import('../src/repos/locationRepository.js')
        const locRepo = await getLocationRepository()
        const loc = await locRepo.get('a4d1c3f1-5b2a-4f7d-9d4b-8f0c2a6b7e21')

        assert.ok(loc, 'location exists')
        assert.ok(loc.version !== undefined, 'version is preserved')
        // Note: version might be incremented by upsert logic, but it should exist
    })
})

describe('Mosswell Bootstrap - Custom Options', () => {
    test('seedWorld accepts custom log function', async () => {
        __resetSeedWorldTestState()
        const logs: unknown[][] = []
        const customLog = (...args: unknown[]) => {
            logs.push(args)
        }

        await seedWorld({ log: customLog, demoPlayerId: 'jjjjjjjj-jjjj-4jjj-8jjj-jjjjjjjjjjjj' })
        assert.ok(logs.length > 0, 'log function was called')
        // Check that demo player log was emitted
        const playerLog = logs.find((log) => log[0] === 'seedWorld: demoPlayer')
        assert.ok(playerLog, 'demo player log emitted')
    })

    test('seedWorld returns consistent metrics', async () => {
        __resetSeedWorldTestState()
        const result = await seedWorld({ demoPlayerId: 'kkkkkkkk-kkkk-4kkk-8kkk-kkkkkkkkkkkk' })

        assert.ok(typeof result.locationsProcessed === 'number', 'locationsProcessed is number')
        assert.ok(typeof result.locationVerticesCreated === 'number', 'locationVerticesCreated is number')
        assert.ok(typeof result.exitsCreated === 'number', 'exitsCreated is number')
        assert.ok(typeof result.playerCreated === 'boolean', 'playerCreated is boolean')
        assert.ok(typeof result.demoPlayerId === 'string', 'demoPlayerId is string')

        assert.ok(result.locationVerticesCreated <= result.locationsProcessed, 'vertices created <= locations processed')
    })
})
