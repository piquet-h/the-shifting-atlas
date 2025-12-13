/**
 * Unit tests for Player Clock Service
 * TDD: Tests written first to define expected behavior (RED phase)
 */

import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import type { PlayerDoc } from '@piquet-h/shared'
import { UnitTestFixture } from '../helpers/UnitTestFixture.js'
import type { IPlayerClockAPI } from '../../src/services/types.js'
import type { IWorldClockService } from '../../src/services/types.js'
import type { IPlayerDocRepository } from '../../src/repos/PlayerDocRepository.js'

describe('PlayerClockService (unit)', () => {
    let fixture: UnitTestFixture
    let service: IPlayerClockAPI
    let worldClockService: IWorldClockService
    let playerRepo: IPlayerDocRepository

    beforeEach(async () => {
        fixture = new UnitTestFixture()
        await fixture.setup()
        service = await fixture.getPlayerClockService()
        worldClockService = await fixture.getWorldClockService()
        playerRepo = await fixture.getPlayerDocRepository()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    describe('advancePlayerTime', () => {
        test('updates player clockTick by duration', async () => {
            // Setup: Create a player with initial clock
            const playerId = 'test-player-1'
            const initialPlayer: PlayerDoc = {
                id: playerId,
                createdUtc: new Date().toISOString(),
                updatedUtc: new Date().toISOString(),
                currentLocationId: 'loc-1',
                clockTick: 1000
            }
            await playerRepo.upsertPlayer(initialPlayer)

            // Act: Advance player time by 60 seconds
            await service.advancePlayerTime(playerId, 60000, 'move')

            // Assert: Player clock should be advanced
            const updated = await playerRepo.getPlayer(playerId)
            assert.ok(updated, 'Player should exist')
            assert.strictEqual(updated.clockTick, 61000, 'Clock should advance by duration')
        })

        test('updates lastAction timestamp', async () => {
            const playerId = 'test-player-2'
            const initialPlayer: PlayerDoc = {
                id: playerId,
                createdUtc: new Date().toISOString(),
                updatedUtc: new Date().toISOString(),
                currentLocationId: 'loc-1',
                clockTick: 0
            }
            await playerRepo.upsertPlayer(initialPlayer)

            const beforeTime = new Date()
            await service.advancePlayerTime(playerId, 5000, 'look')
            const afterTime = new Date()

            const updated = await playerRepo.getPlayer(playerId)
            assert.ok(updated, 'Player should exist')
            assert.ok(updated.lastAction, 'lastAction should be set')

            const lastActionTime = new Date(updated.lastAction)
            assert.ok(lastActionTime >= beforeTime && lastActionTime <= afterTime, 'lastAction should be current timestamp')
        })

        test('initializes clockTick to 0 if undefined', async () => {
            const playerId = 'test-player-3'
            const initialPlayer: PlayerDoc = {
                id: playerId,
                createdUtc: new Date().toISOString(),
                updatedUtc: new Date().toISOString(),
                currentLocationId: 'loc-1'
                // clockTick intentionally undefined
            }
            await playerRepo.upsertPlayer(initialPlayer)

            await service.advancePlayerTime(playerId, 10000, 'examine')

            const updated = await playerRepo.getPlayer(playerId)
            assert.strictEqual(updated?.clockTick, 10000, 'Should initialize from 0 and advance')
        })

        test('rejects negative duration', async () => {
            const playerId = 'test-player-4'
            const initialPlayer: PlayerDoc = {
                id: playerId,
                createdUtc: new Date().toISOString(),
                updatedUtc: new Date().toISOString(),
                currentLocationId: 'loc-1',
                clockTick: 1000
            }
            await playerRepo.upsertPlayer(initialPlayer)

            await assert.rejects(
                async () => service.advancePlayerTime(playerId, -1000, 'invalid'),
                /duration must be positive/i,
                'Should reject negative duration'
            )
        })

        test('rejects unknown playerId', async () => {
            await assert.rejects(
                async () => service.advancePlayerTime('unknown-player', 1000, 'move'),
                /player.*not found/i,
                'Should reject unknown player'
            )
        })

        test('emits Player.Clock.Advanced telemetry event', async () => {
            const playerId = 'test-player-5'
            const initialPlayer: PlayerDoc = {
                id: playerId,
                createdUtc: new Date().toISOString(),
                updatedUtc: new Date().toISOString(),
                currentLocationId: 'loc-1',
                clockTick: 500
            }
            await playerRepo.upsertPlayer(initialPlayer)

            const telemetry = await fixture.getTelemetryClient()
            await service.advancePlayerTime(playerId, 2000, 'move')

            const events = telemetry.events.filter((e) => e.name === 'Player.Clock.Advanced')
            assert.strictEqual(events.length, 1, 'Should emit one telemetry event')
            assert.strictEqual(events[0].properties?.playerId, playerId)
            assert.strictEqual(events[0].properties?.actionType, 'move')
            assert.strictEqual(events[0].properties?.durationMs, 2000)
            assert.strictEqual(events[0].properties?.newTick, 2500)
        })
    })

    describe('applyDrift', () => {
        test('calculates drift correctly with default rate (1.0)', async () => {
            const playerId = 'test-player-6'
            const initialPlayer: PlayerDoc = {
                id: playerId,
                createdUtc: new Date().toISOString(),
                updatedUtc: new Date().toISOString(),
                currentLocationId: 'loc-1',
                clockTick: 1000
            }
            await playerRepo.upsertPlayer(initialPlayer)

            // Apply drift: 60 seconds real time = 60 seconds game time (rate 1.0)
            await service.applyDrift(playerId, 60000)

            const updated = await playerRepo.getPlayer(playerId)
            assert.strictEqual(updated?.clockTick, 61000, 'Drift should advance clock by elapsed * rate')
        })

        test('updates lastDrift timestamp', async () => {
            const playerId = 'test-player-7'
            const initialPlayer: PlayerDoc = {
                id: playerId,
                createdUtc: new Date().toISOString(),
                updatedUtc: new Date().toISOString(),
                currentLocationId: 'loc-1',
                clockTick: 0
            }
            await playerRepo.upsertPlayer(initialPlayer)

            const beforeTime = new Date()
            await service.applyDrift(playerId, 30000)
            const afterTime = new Date()

            const updated = await playerRepo.getPlayer(playerId)
            assert.ok(updated?.lastDrift, 'lastDrift should be set')

            const lastDriftTime = new Date(updated.lastDrift)
            assert.ok(lastDriftTime >= beforeTime && lastDriftTime <= afterTime, 'lastDrift should be current timestamp')
        })

        test('rejects negative realTimeElapsed', async () => {
            const playerId = 'test-player-8'
            const initialPlayer: PlayerDoc = {
                id: playerId,
                createdUtc: new Date().toISOString(),
                updatedUtc: new Date().toISOString(),
                currentLocationId: 'loc-1',
                clockTick: 1000
            }
            await playerRepo.upsertPlayer(initialPlayer)

            await assert.rejects(
                async () => service.applyDrift(playerId, -5000),
                /elapsed.*must be.*positive/i,
                'Should reject negative elapsed time'
            )
        })

        test('emits Player.Clock.DriftApplied telemetry event', async () => {
            const playerId = 'test-player-9'
            const initialPlayer: PlayerDoc = {
                id: playerId,
                createdUtc: new Date().toISOString(),
                updatedUtc: new Date().toISOString(),
                currentLocationId: 'loc-1',
                clockTick: 100
            }
            await playerRepo.upsertPlayer(initialPlayer)

            const telemetry = await fixture.getTelemetryClient()
            await service.applyDrift(playerId, 10000)

            const events = telemetry.events.filter((e) => e.name === 'Player.Clock.DriftApplied')
            assert.strictEqual(events.length, 1, 'Should emit one telemetry event')
            assert.strictEqual(events[0].properties?.playerId, playerId)
            assert.strictEqual(events[0].properties?.realTimeElapsedMs, 10000)
            assert.strictEqual(events[0].properties?.driftMs, 10000)
            assert.strictEqual(events[0].properties?.newTick, 10100)
        })
    })

    describe('reconcile', () => {
        test('wait policy: player behind location', async () => {
            // Setup world clock
            await worldClockService.advanceTick(100000, 'test setup')

            // Setup player behind world clock
            const playerId = 'test-player-10'
            const locationId = 'loc-1'
            const initialPlayer: PlayerDoc = {
                id: playerId,
                createdUtc: new Date().toISOString(),
                updatedUtc: new Date().toISOString(),
                currentLocationId: locationId,
                clockTick: 50000 // Behind world clock by 50 seconds
            }
            await playerRepo.upsertPlayer(initialPlayer)

            // Act: Reconcile
            const result = await service.reconcile(playerId, locationId)

            // Assert: Wait policy should be used
            assert.strictEqual(result.reconciliationMethod, 'wait', 'Should use wait policy')
            assert.strictEqual(result.playerTickBefore, 50000, 'Should capture initial tick')
            assert.strictEqual(result.playerTickAfter, 100000, 'Should advance to world clock')
            assert.strictEqual(result.worldClockTick, 100000, 'Should match world clock')

            // Verify player updated
            const updated = await playerRepo.getPlayer(playerId)
            assert.strictEqual(updated?.clockTick, 100000, 'Player clock should be synced')
        })

        test('compress policy: player far ahead of location', async () => {
            // Setup world clock
            await worldClockService.advanceTick(50000, 'test setup')

            // Setup player far ahead (>1 hour)
            const playerId = 'test-player-11'
            const locationId = 'loc-1'
            const initialPlayer: PlayerDoc = {
                id: playerId,
                createdUtc: new Date().toISOString(),
                updatedUtc: new Date().toISOString(),
                currentLocationId: locationId,
                clockTick: 4000000 // Ahead by ~1 hour
            }
            await playerRepo.upsertPlayer(initialPlayer)

            // Act: Reconcile
            const result = await service.reconcile(playerId, locationId)

            // Assert: Compress policy should be used
            assert.strictEqual(result.reconciliationMethod, 'compress', 'Should use compress policy')
            assert.strictEqual(result.playerTickBefore, 4000000)
            assert.strictEqual(result.playerTickAfter, 50000, 'Should compress back to world clock')
            assert.strictEqual(result.worldClockTick, 50000)

            // Verify player updated
            const updated = await playerRepo.getPlayer(playerId)
            assert.strictEqual(updated?.clockTick, 50000, 'Player clock should be compressed')
        })

        test('no reconciliation when player and location aligned', async () => {
            // Setup world clock
            await worldClockService.advanceTick(75000, 'test setup')

            // Setup player aligned with world clock
            const playerId = 'test-player-12'
            const locationId = 'loc-1'
            const initialPlayer: PlayerDoc = {
                id: playerId,
                createdUtc: new Date().toISOString(),
                updatedUtc: new Date().toISOString(),
                currentLocationId: locationId,
                clockTick: 75000 // Exactly aligned
            }
            await playerRepo.upsertPlayer(initialPlayer)

            // Act: Reconcile
            const result = await service.reconcile(playerId, locationId)

            // Assert: No change needed
            assert.strictEqual(result.playerTickBefore, 75000)
            assert.strictEqual(result.playerTickAfter, 75000, 'Clock should remain unchanged')
            assert.strictEqual(result.worldClockTick, 75000)

            // Method can be any - implementation decides how to represent "no-op"
            const updated = await playerRepo.getPlayer(playerId)
            assert.strictEqual(updated?.clockTick, 75000, 'Player clock unchanged')
        })

        test('emits Player.Clock.Reconciled telemetry event', async () => {
            await worldClockService.advanceTick(100000, 'test setup')

            const playerId = 'test-player-13'
            const locationId = 'loc-1'
            const initialPlayer: PlayerDoc = {
                id: playerId,
                createdUtc: new Date().toISOString(),
                updatedUtc: new Date().toISOString(),
                currentLocationId: locationId,
                clockTick: 30000
            }
            await playerRepo.upsertPlayer(initialPlayer)

            const telemetry = await fixture.getTelemetryClient()
            await service.reconcile(playerId, locationId)

            const events = telemetry.events.filter((e) => e.name === 'Player.Clock.Reconciled')
            assert.strictEqual(events.length, 1, 'Should emit one telemetry event')
            assert.strictEqual(events[0].properties?.playerId, playerId)
            assert.strictEqual(events[0].properties?.locationId, locationId)
            assert.strictEqual(events[0].properties?.method, 'wait')
            assert.ok('offsetMs' in events[0].properties!)
        })

        test('rejects unknown playerId', async () => {
            await assert.rejects(
                async () => service.reconcile('unknown-player', 'loc-1'),
                /player.*not found/i,
                'Should reject unknown player'
            )
        })
    })

    describe('getPlayerOffset', () => {
        test('returns positive offset when player ahead', async () => {
            // World clock at 50 seconds
            await worldClockService.advanceTick(50000, 'test setup')

            const playerId = 'test-player-14'
            const initialPlayer: PlayerDoc = {
                id: playerId,
                createdUtc: new Date().toISOString(),
                updatedUtc: new Date().toISOString(),
                currentLocationId: 'loc-1',
                clockTick: 80000 // 30 seconds ahead
            }
            await playerRepo.upsertPlayer(initialPlayer)

            const offset = await service.getPlayerOffset(playerId)
            assert.strictEqual(offset, 30000, 'Offset should be positive when ahead')
        })

        test('returns negative offset when player behind', async () => {
            // World clock at 100 seconds
            await worldClockService.advanceTick(100000, 'test setup')

            const playerId = 'test-player-15'
            const initialPlayer: PlayerDoc = {
                id: playerId,
                createdUtc: new Date().toISOString(),
                updatedUtc: new Date().toISOString(),
                currentLocationId: 'loc-1',
                clockTick: 60000 // 40 seconds behind
            }
            await playerRepo.upsertPlayer(initialPlayer)

            const offset = await service.getPlayerOffset(playerId)
            assert.strictEqual(offset, -40000, 'Offset should be negative when behind')
        })

        test('returns zero offset when aligned', async () => {
            await worldClockService.advanceTick(50000, 'test setup')

            const playerId = 'test-player-16'
            const initialPlayer: PlayerDoc = {
                id: playerId,
                createdUtc: new Date().toISOString(),
                updatedUtc: new Date().toISOString(),
                currentLocationId: 'loc-1',
                clockTick: 50000
            }
            await playerRepo.upsertPlayer(initialPlayer)

            const offset = await service.getPlayerOffset(playerId)
            assert.strictEqual(offset, 0, 'Offset should be zero when aligned')
        })

        test('rejects unknown playerId', async () => {
            await assert.rejects(
                async () => service.getPlayerOffset('unknown-player'),
                /player.*not found/i,
                'Should reject unknown player'
            )
        })
    })
})
