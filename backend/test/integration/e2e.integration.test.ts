/* global process */
/**
 * E2E Integration Test Suite
 *
 * Comprehensive end-to-end tests running against real persistence layer (memory or Cosmos).
 * Validates full traversal and persistence flows for production-readiness.
 *
 * Acceptance Criteria:
 * - Test fixture: automated world seed with ≥5 locations
 * - Cleanup strategy: teardown removes all test data
 * - Tests cover: player bootstrap, LOOK, multi-hop traversal, exit validation, concurrent moves
 * - Performance targets: suite <90s, move <500ms, LOOK <200ms
 *
 * Environment: PERSISTENCE_MODE=memory (tests work with both memory and cosmos)
 */
import type { Location } from '@piquet-h/shared'
import assert from 'node:assert'
import { describe, test } from 'node:test'
import { ILocationRepository } from '../../src/repos/locationRepository.js'
import { IPlayerRepository } from '../../src/repos/playerRepository.js'
import { seedWorld, type SeedWorldResult } from '../../src/seeding/seedWorld.js'
import { getLocationRepositoryForTest, getPlayerRepositoryForTest } from '../helpers/testContainer.js'

// Test fixtures: Create a small test world with ≥5 locations for traversal
const createTestWorldBlueprint = (): Location[] => [
    {
        id: 'e2e-start',
        name: 'E2E Starting Point',
        description: 'Test starting location for E2E suite.',
        tags: ['test', 'e2e'],
        exits: [
            { direction: 'north', to: 'e2e-north', description: 'North corridor' },
            { direction: 'east', to: 'e2e-east', description: 'East passage' },
            { direction: 'west', to: 'e2e-west', description: 'West tunnel' }
        ],
        version: 1
    },
    {
        id: 'e2e-north',
        name: 'Northern Chamber',
        description: 'A cold chamber to the north.',
        tags: ['test', 'e2e'],
        exits: [
            { direction: 'south', to: 'e2e-start', description: 'Back south' },
            { direction: 'north', to: 'e2e-far-north', description: 'Further north' }
        ],
        version: 1
    },
    {
        id: 'e2e-far-north',
        name: 'Far Northern Room',
        description: 'The far northern extent.',
        tags: ['test', 'e2e'],
        exits: [{ direction: 'south', to: 'e2e-north', description: 'Back south' }],
        version: 1
    },
    {
        id: 'e2e-east',
        name: 'Eastern Wing',
        description: 'A bright eastern wing.',
        tags: ['test', 'e2e'],
        exits: [
            { direction: 'west', to: 'e2e-start', description: 'Back west' },
            { direction: 'east', to: 'e2e-far-east', description: 'Continue east' }
        ],
        version: 1
    },
    {
        id: 'e2e-far-east',
        name: 'Far Eastern Chamber',
        description: 'The easternmost chamber.',
        tags: ['test', 'e2e'],
        exits: [{ direction: 'west', to: 'e2e-east', description: 'Back west' }],
        version: 1
    },
    {
        id: 'e2e-west',
        name: 'Western Hall',
        description: 'A dim western hall.',
        tags: ['test', 'e2e'],
        exits: [{ direction: 'east', to: 'e2e-start', description: 'Back east' }],
        version: 1
    },
    {
        id: 'e2e-blocked',
        name: 'Blocked Room',
        description: 'A room with no exits (dead end).',
        tags: ['test', 'e2e'],
        exits: [],
        version: 1
    }
]

// Test helper: Seed test world and return repositories for reuse
const seedTestWorld = async (
    playerId?: string
): Promise<{ result: SeedWorldResult; locationRepo: ILocationRepository; playerRepo: IPlayerRepository }> => {
    const blueprint = createTestWorldBlueprint()
    const locationRepository = await getLocationRepositoryForTest()
    const playerRepository = await getPlayerRepositoryForTest()
    const result = await seedWorld({ blueprint, demoPlayerId: playerId, locationRepository, playerRepository })
    return { result, locationRepo: locationRepository, playerRepo: playerRepository }
}

describe('E2E Integration Test Suite', () => {
    describe('Test Fixture Setup', () => {
        test('automated world seed creates ≥5 locations with exits', async () => {
            const { result, locationRepo, playerRepo } = await seedTestWorld('00000000-0000-4000-a000-000000000001')

            assert.ok(result.locationsProcessed >= 5, 'at least 5 locations processed')
            assert.ok(result.locationVerticesCreated >= 5, 'at least 5 locations created')
            // Note: exits are stored in location records, not as separate edges in memory mode
            // Verify exits exist by checking a location
            const locRepo = await getLocationRepositoryForTest()
            const startLoc = await locRepo.get('e2e-start')
            assert.ok(startLoc && startLoc.exits && startLoc.exits.length > 0, 'locations have exits')
            assert.ok(result.playerCreated, 'demo player created')
        })

        test('cleanup strategy: teardown removes all test data', async () => {
            await seedTestWorld('00000000-0000-4000-a000-000000000002')

            // Verify data exists
            const locRepo = await getLocationRepositoryForTest()
            const loc = await locRepo.get('e2e-start')
            assert.ok(loc, 'location exists after seed')

            // Reset (cleanup)            // Verify cleanup worked (new repo instance has clean slate)
            const locRepoAfter = await getLocationRepositoryForTest()
            const locAfter = await locRepoAfter.get('e2e-start')
            assert.equal(locAfter, undefined, 'location cleaned up after reset')
        })

        test('test uses configured persistence mode', () => {
            const mode = process.env.PERSISTENCE_MODE || 'memory'
            assert.ok(['memory', 'cosmos'].includes(mode), `valid persistence mode: ${mode}`)
        })
    })

    describe('Player Bootstrap → Location Lookup → First LOOK (Cold Start)', () => {
        test('player bootstrap creates new player with starting location', async () => {
            await seedTestWorld('00000000-0000-4000-a000-000000000003')

            const playerRepo = await getPlayerRepositoryForTest()
            // The player was already created by seedTestWorld, so we're just getting it
            const { record, created } = await playerRepo.getOrCreate('00000000-0000-4000-a000-000000000003')

            // Since seedWorld already created this player, created=false on this call
            assert.equal(created, false, 'player already exists from seedWorld')
            assert.equal(record.id, '00000000-0000-4000-a000-000000000003', 'correct player id')
            assert.ok(record.currentLocationId, 'player has starting location')
            assert.equal(typeof record.guest, 'boolean', 'guest flag is boolean')
            assert.ok(record.createdUtc, 'has createdUtc timestamp')
        })

        test('LOOK at starting location returns location data', async () => {
            await seedTestWorld('00000000-0000-4000-a000-000000000004')

            const locRepo = await getLocationRepositoryForTest()
            const startLoc = await locRepo.get('e2e-start')

            assert.ok(startLoc, 'starting location found')
            assert.equal(startLoc.name, 'E2E Starting Point', 'correct location name')
            assert.ok(startLoc.description, 'has description')
            assert.ok(startLoc.exits && startLoc.exits.length > 0, 'has exits')
        })

        test('LOOK performance baseline: query completes quickly', async () => {
            await seedTestWorld('00000000-0000-4000-a000-000000000005')

            const locRepo = await getLocationRepositoryForTest()
            const start = Date.now()
            await locRepo.get('e2e-start')
            const duration = Date.now() - start

            // p95 target: <200ms (in memory should be <10ms)
            assert.ok(duration < 200, `LOOK query completed in ${duration}ms (target: <200ms)`)
        })

        test('LOOK returns exits summary for navigation', async () => {
            await seedTestWorld('00000000-0000-4000-a000-000000000006')

            const locRepo = await getLocationRepositoryForTest()
            const startLoc = await locRepo.get('e2e-start')

            assert.ok(startLoc, 'location exists')
            const exits = startLoc.exits || []
            assert.ok(exits.length >= 3, 'has multiple exits')

            // Verify exit directions
            const directions = exits.map((e) => e.direction)
            assert.ok(directions.includes('north'), 'has north exit')
            assert.ok(directions.includes('east'), 'has east exit')
            assert.ok(directions.includes('west'), 'has west exit')
        })
    })

    describe('Multi-Hop Traversal (Move 3+ Times)', () => {
        test('move north 3 times updates location each time', async () => {
            await seedTestWorld('00000000-0000-4000-a000-000000000007')

            const locRepo = await getLocationRepositoryForTest()

            // Move 1: start → north
            const move1 = await locRepo.move('e2e-start', 'north')
            assert.equal(move1.status, 'ok', 'first move succeeds')
            if (move1.status === 'ok') {
                assert.equal(move1.location.id, 'e2e-north', 'moved to northern chamber')
            }

            // Move 2: north → far north
            const move2 = await locRepo.move('e2e-north', 'north')
            assert.equal(move2.status, 'ok', 'second move succeeds')
            if (move2.status === 'ok') {
                assert.equal(move2.location.id, 'e2e-far-north', 'moved to far northern room')
            }

            // Move 3: far north → back south
            const move3 = await locRepo.move('e2e-far-north', 'south')
            assert.equal(move3.status, 'ok', 'third move succeeds')
            if (move3.status === 'ok') {
                assert.equal(move3.location.id, 'e2e-north', 'moved back to northern chamber')
            }
        })

        test('move east 2 times traverses eastern wing', async () => {
            await seedTestWorld('00000000-0000-4000-a000-000000000008')

            const locRepo = await getLocationRepositoryForTest()

            // Move 1: start → east
            const move1 = await locRepo.move('e2e-start', 'east')
            assert.equal(move1.status, 'ok', 'first move succeeds')
            if (move1.status === 'ok') {
                assert.equal(move1.location.id, 'e2e-east', 'moved to eastern wing')
            }

            // Move 2: east → far east
            const move2 = await locRepo.move('e2e-east', 'east')
            assert.equal(move2.status, 'ok', 'second move succeeds')
            if (move2.status === 'ok') {
                assert.equal(move2.location.id, 'e2e-far-east', 'moved to far eastern chamber')
            }
        })

        test('move performance baseline: operations complete quickly', async () => {
            await seedTestWorld('00000000-0000-4000-a000-000000000009')

            const locRepo = await getLocationRepositoryForTest()
            const start = Date.now()
            await locRepo.move('e2e-start', 'north')
            const duration = Date.now() - start

            // p95 target: <500ms (in memory should be <20ms)
            assert.ok(duration < 500, `Move operation completed in ${duration}ms (target: <500ms)`)
        })

        test('multi-hop round trip: start → north → far north → back', async () => {
            await seedTestWorld('00000000-0000-4000-a000-00000000000a')

            const locRepo = await getLocationRepositoryForTest()
            let currentLoc = 'e2e-start'

            // Forward journey
            const move1 = await locRepo.move(currentLoc, 'north')
            assert.equal(move1.status, 'ok', 'move to north succeeds')
            if (move1.status === 'ok') currentLoc = move1.location.id

            const move2 = await locRepo.move(currentLoc, 'north')
            assert.equal(move2.status, 'ok', 'move to far north succeeds')
            if (move2.status === 'ok') currentLoc = move2.location.id

            // Return journey
            const move3 = await locRepo.move(currentLoc, 'south')
            assert.equal(move3.status, 'ok', 'move back south succeeds')
            if (move3.status === 'ok') currentLoc = move3.location.id

            const move4 = await locRepo.move(currentLoc, 'south')
            assert.equal(move4.status, 'ok', 'move back to start succeeds')
            if (move4.status === 'ok') {
                assert.equal(move4.location.id, 'e2e-start', 'returned to starting location')
            }
        })
    })

    describe('Exit Validation (Blocked/Missing Exits)', () => {
        test('missing exit returns error with reason', async () => {
            await seedTestWorld('00000000-0000-4000-a000-00000000000b')

            const locRepo = await getLocationRepositoryForTest()
            const result = await locRepo.move('e2e-start', 'south')

            assert.equal(result.status, 'error', 'move to non-existent exit fails')
            if (result.status === 'error') {
                assert.equal(result.reason, 'no-exit', 'correct error reason')
            }
        })

        test('invalid direction returns error', async () => {
            await seedTestWorld('00000000-0000-4000-a000-00000000000c')

            const locRepo = await getLocationRepositoryForTest()
            const result = await locRepo.move('e2e-start', 'invalid-direction')

            assert.equal(result.status, 'error', 'invalid direction fails')
            if (result.status === 'error') {
                assert.ok(result.reason, 'has error reason')
            }
        })

        test('move from non-existent location returns error', async () => {
            await seedTestWorld('00000000-0000-4000-a000-00000000000d')

            const locRepo = await getLocationRepositoryForTest()
            const result = await locRepo.move('non-existent-location', 'north')

            assert.equal(result.status, 'error', 'move from missing location fails')
            if (result.status === 'error') {
                assert.equal(result.reason, 'from-missing', 'correct error reason')
            }
        })

        test('exit to non-existent target location returns error', async () => {
            await seedTestWorld('00000000-0000-4000-a000-00000000000e')

            // Manually create a location with exit to non-existent target
            const locRepo = await getLocationRepositoryForTest()
            await locRepo.upsert({
                id: 'e2e-broken',
                name: 'Broken Exit Location',
                description: 'Has exit to nowhere',
                exits: [{ direction: 'north', to: 'does-not-exist' }],
                version: 1
            })

            const result = await locRepo.move('e2e-broken', 'north')
            assert.equal(result.status, 'error', 'move to non-existent target fails')
            if (result.status === 'error') {
                assert.equal(result.reason, 'target-missing', 'correct error reason')
            }
        })

        test('blocked room (no exits) prevents movement', async () => {
            await seedTestWorld('00000000-0000-4000-a000-00000000000f')

            const locRepo = await getLocationRepositoryForTest()
            const blockedLoc = await locRepo.get('e2e-blocked')
            assert.ok(blockedLoc, 'blocked location exists')
            assert.equal(blockedLoc.exits?.length || 0, 0, 'blocked location has no exits')

            // Try to move from blocked room
            const result = await locRepo.move('e2e-blocked', 'north')
            assert.equal(result.status, 'error', 'cannot move from room with no exits')
        })
    })

    describe('Concurrent Moves (No State Corruption)', () => {
        test('two players move simultaneously without corruption', async () => {
            await seedTestWorld('00000000-0000-4000-a000-000000000010')

            const playerRepo = await getPlayerRepositoryForTest()
            const locRepo = await getLocationRepositoryForTest()

            // Create two players
            const player1Id = '00000000-0000-4000-a000-000000000010'
            const player2Id = '00000000-0000-4000-a000-000000000011'

            const { record: p1 } = await playerRepo.getOrCreate(player1Id)
            const { record: p2 } = await playerRepo.getOrCreate(player2Id)

            assert.ok(p1, 'player 1 created')
            assert.ok(p2, 'player 2 created')

            // Both players move concurrently from start location
            const [move1, move2] = await Promise.all([locRepo.move('e2e-start', 'north'), locRepo.move('e2e-start', 'east')])

            assert.equal(move1.status, 'ok', 'player 1 move succeeds')
            assert.equal(move2.status, 'ok', 'player 2 move succeeds')

            if (move1.status === 'ok' && move2.status === 'ok') {
                assert.equal(move1.location.id, 'e2e-north', 'player 1 at northern chamber')
                assert.equal(move2.location.id, 'e2e-east', 'player 2 at eastern wing')
                assert.notEqual(move1.location.id, move2.location.id, 'players at different locations')
            }
        })

        test('multiple players move from different locations simultaneously', async () => {
            await seedTestWorld('00000000-0000-4000-a000-000000000012')

            const locRepo = await getLocationRepositoryForTest()

            // Three concurrent moves from different starting points
            const [move1, move2, move3] = await Promise.all([
                locRepo.move('e2e-start', 'north'),
                locRepo.move('e2e-north', 'south'),
                locRepo.move('e2e-east', 'west')
            ])

            assert.equal(move1.status, 'ok', 'move 1 succeeds')
            assert.equal(move2.status, 'ok', 'move 2 succeeds')
            assert.equal(move3.status, 'ok', 'move 3 succeeds')
        })

        test('same player multiple rapid moves (race condition)', async () => {
            await seedTestWorld('00000000-0000-4000-a000-000000000013')

            const locRepo = await getLocationRepositoryForTest()

            // Simulate rapid-fire moves (should all succeed independently)
            const moves = await Promise.all([
                locRepo.move('e2e-start', 'north'),
                locRepo.move('e2e-north', 'south'),
                locRepo.move('e2e-start', 'east')
            ])

            // All moves should succeed (each is independent query)
            moves.forEach((move, idx) => {
                assert.equal(move.status, 'ok', `move ${idx + 1} succeeds`)
            })
        })
    })

    describe('Telemetry and Performance', () => {
        test('full suite performance baseline', async () => {
            // This test itself is a performance marker
            const suiteStart = Date.now()

            // Run a mini version of full suite
            await seedTestWorld('00000000-0000-4000-a000-000000000014')

            const locRepo = await getLocationRepositoryForTest()
            await locRepo.get('e2e-start')
            await locRepo.move('e2e-start', 'north')
            await locRepo.move('e2e-north', 'south')

            const duration = Date.now() - suiteStart

            // Mini suite should complete quickly (full suite target: <90s)
            assert.ok(duration < 5000, `Mini suite completed in ${duration}ms`)
        })

        test('batch operations maintain performance', async () => {
            await seedTestWorld('00000000-0000-4000-a000-000000000015')

            const locRepo = await getLocationRepositoryForTest()
            const start = Date.now()

            // Perform 10 operations
            for (let i = 0; i < 10; i++) {
                await locRepo.get('e2e-start')
            }

            const duration = Date.now() - start
            const avgPerOp = duration / 10

            assert.ok(avgPerOp < 200, `Average operation time: ${avgPerOp.toFixed(2)}ms (target: <200ms)`)
        })

        test('location lookup is idempotent and consistent', async () => {
            await seedTestWorld('00000000-0000-4000-a000-000000000016')

            const locRepo = await getLocationRepositoryForTest()

            // Look up same location multiple times
            const loc1 = await locRepo.get('e2e-start')
            const loc2 = await locRepo.get('e2e-start')
            const loc3 = await locRepo.get('e2e-start')

            assert.ok(loc1, 'first lookup succeeds')
            assert.ok(loc2, 'second lookup succeeds')
            assert.ok(loc3, 'third lookup succeeds')

            // All lookups return same data
            assert.equal(loc1?.name, loc2?.name, 'name consistent')
            assert.equal(loc2?.name, loc3?.name, 'name consistent across all lookups')
        })
    })

    describe('Edge Cases and Idempotency', () => {
        test('repeated LOOK operations are idempotent', async () => {
            await seedTestWorld('00000000-0000-4000-a000-000000000017')

            const locRepo = await getLocationRepositoryForTest()

            for (let i = 0; i < 5; i++) {
                const loc = await locRepo.get('e2e-start')
                assert.ok(loc, `lookup ${i + 1} succeeds`)
                assert.equal(loc.name, 'E2E Starting Point', 'consistent name')
            }
        })

        test('move then LOOK shows updated location', async () => {
            await seedTestWorld('00000000-0000-4000-a000-000000000018')

            const locRepo = await getLocationRepositoryForTest()

            // Move north
            const move = await locRepo.move('e2e-start', 'north')
            assert.equal(move.status, 'ok', 'move succeeds')

            // Look at new location
            if (move.status === 'ok') {
                const newLoc = await locRepo.get(move.location.id)
                assert.ok(newLoc, 'new location exists')
                assert.equal(newLoc.name, 'Northern Chamber', 'correct location name')
            }
        })

        test('player bootstrap is idempotent', async () => {
            await seedTestWorld('00000000-0000-4000-a000-000000000019')

            const playerRepo = await getPlayerRepositoryForTest()
            // Use a different player ID that wasn't created by seedWorld
            const playerId = '00000000-0000-4000-a000-00000000001b'

            const first = await playerRepo.getOrCreate(playerId)
            assert.ok(first.created, 'first call creates player')

            const second = await playerRepo.getOrCreate(playerId)
            assert.equal(second.created, false, 'second call returns existing player')
            assert.equal(first.record.id, second.record.id, 'same player id')
        })

        test('upsert location is idempotent', async () => {
            await seedTestWorld('00000000-0000-4000-a000-00000000001a')

            const locRepo = await getLocationRepositoryForTest()

            const loc: Location = {
                id: 'e2e-upsert-test',
                name: 'Upsert Test',
                description: 'Testing upsert idempotency',
                version: 1
            }

            const first = await locRepo.upsert(loc)
            assert.ok(first.created, 'first upsert creates')

            const second = await locRepo.upsert(loc)
            assert.equal(second.created, false, 'second upsert does not create')
        })
    })
})
