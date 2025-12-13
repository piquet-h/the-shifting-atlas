/**
 * Integration tests for Player Clock Service
 * Tests service operations with repository persistence in both memory and cosmos modes
 */

import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import type { PlayerDoc } from '@piquet-h/shared'
import { describeForBothModes } from '../helpers/describeForBothModes.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

describeForBothModes('PlayerClockService Integration', (mode) => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture(mode)
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    describe('Full flow: advance → reconcile → verify', () => {
        test('player action advances clock, then reconciles to location', async () => {
            const service = await fixture.getPlayerClockService()
            const playerRepo = await fixture.getPlayerDocRepository()
            const worldClockService = await fixture.getWorldClockService()

            // Setup: Create player and advance world clock
            const playerId = 'integration-test-player-1'
            const locationId = 'integration-test-location-1'
            
            const initialPlayer: PlayerDoc = {
                id: playerId,
                createdUtc: new Date().toISOString(),
                updatedUtc: new Date().toISOString(),
                currentLocationId: locationId,
                clockTick: 0
            }
            await playerRepo.upsertPlayer(initialPlayer)
            
            // Advance world clock to 100 seconds
            await worldClockService.advanceTick(100000, 'integration test setup')

            // Act 1: Player takes an action (advances player clock)
            await service.advancePlayerTime(playerId, 60000, 'move')

            // Verify player clock advanced
            let player = await playerRepo.getPlayer(playerId)
            assert.strictEqual(player?.clockTick, 60000, 'Player clock should advance to 60s')

            // Act 2: Reconcile player to location (world clock at 100s)
            const result = await service.reconcile(playerId, locationId)

            // Verify reconciliation result
            assert.strictEqual(result.playerTickBefore, 60000, 'Should capture pre-reconciliation tick')
            assert.strictEqual(result.playerTickAfter, 100000, 'Should advance to world clock')
            assert.strictEqual(result.reconciliationMethod, 'wait', 'Should use wait policy (player behind)')
            assert.strictEqual(result.worldClockTick, 100000, 'Should match world clock')

            // Verify player document updated
            player = await playerRepo.getPlayer(playerId)
            assert.strictEqual(player?.clockTick, 100000, 'Player clock should be synced to world clock')
        })

        test('multiple reconcile calls are idempotent when already aligned', async () => {
            const service = await fixture.getPlayerClockService()
            const playerRepo = await fixture.getPlayerDocRepository()
            const worldClockService = await fixture.getWorldClockService()

            // Setup: Create player aligned with world clock
            const playerId = 'integration-test-player-2'
            const locationId = 'integration-test-location-2'
            
            await worldClockService.advanceTick(50000, 'test setup')
            
            const initialPlayer: PlayerDoc = {
                id: playerId,
                createdUtc: new Date().toISOString(),
                updatedUtc: new Date().toISOString(),
                currentLocationId: locationId,
                clockTick: 50000
            }
            await playerRepo.upsertPlayer(initialPlayer)

            // Act: Reconcile multiple times
            const result1 = await service.reconcile(playerId, locationId)
            const result2 = await service.reconcile(playerId, locationId)
            const result3 = await service.reconcile(playerId, locationId)

            // Verify all reconciliations are no-ops
            assert.strictEqual(result1.playerTickBefore, 50000)
            assert.strictEqual(result1.playerTickAfter, 50000)
            assert.strictEqual(result2.playerTickBefore, 50000)
            assert.strictEqual(result2.playerTickAfter, 50000)
            assert.strictEqual(result3.playerTickBefore, 50000)
            assert.strictEqual(result3.playerTickAfter, 50000)

            // Verify player document unchanged
            const player = await playerRepo.getPlayer(playerId)
            assert.strictEqual(player?.clockTick, 50000)
        })

        test('massive drift scenario: player offline for days', async () => {
            const service = await fixture.getPlayerClockService()
            const playerRepo = await fixture.getPlayerDocRepository()
            const worldClockService = await fixture.getWorldClockService()

            // Setup: Player far ahead (simulating days of accumulated drift)
            const playerId = 'integration-test-player-3'
            const locationId = 'integration-test-location-3'
            
            const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000 // 604800000ms
            
            const initialPlayer: PlayerDoc = {
                id: playerId,
                createdUtc: new Date().toISOString(),
                updatedUtc: new Date().toISOString(),
                currentLocationId: locationId,
                clockTick: SEVEN_DAYS_MS // Player 7 days ahead
            }
            await playerRepo.upsertPlayer(initialPlayer)
            
            // World clock is at 0 (player far ahead)
            await worldClockService.getCurrentTick() // Initialize at 0

            // Act: Reconcile should compress
            const result = await service.reconcile(playerId, locationId)

            // Verify compress policy applied
            assert.strictEqual(result.reconciliationMethod, 'compress', 'Should use compress policy for massive drift')
            assert.strictEqual(result.playerTickBefore, SEVEN_DAYS_MS, 'Should capture pre-reconciliation tick')
            assert.strictEqual(result.playerTickAfter, 0, 'Should compress back to world clock')
            assert.strictEqual(result.worldClockTick, 0)

            // Verify player document compressed
            const player = await playerRepo.getPlayer(playerId)
            assert.strictEqual(player?.clockTick, 0, 'Player clock should be compressed to world clock')
        })
    })

    describe('Drift application', () => {
        test('drift accumulates correctly over multiple applications', async () => {
            const service = await fixture.getPlayerClockService()
            const playerRepo = await fixture.getPlayerDocRepository()

            // Setup: Create player
            const playerId = 'integration-test-player-4'
            
            const initialPlayer: PlayerDoc = {
                id: playerId,
                createdUtc: new Date().toISOString(),
                updatedUtc: new Date().toISOString(),
                currentLocationId: 'loc-1',
                clockTick: 0
            }
            await playerRepo.upsertPlayer(initialPlayer)

            // Act: Apply drift multiple times (simulating periodic checks)
            await service.applyDrift(playerId, 30000) // 30 seconds real time
            await service.applyDrift(playerId, 60000) // 60 seconds real time
            await service.applyDrift(playerId, 45000) // 45 seconds real time

            // Verify cumulative drift (135 seconds total)
            const player = await playerRepo.getPlayer(playerId)
            assert.strictEqual(player?.clockTick, 135000, 'Drift should accumulate')
            assert.ok(player?.lastDrift, 'lastDrift should be set')
        })

        test('drift and action time advance both update clock', async () => {
            const service = await fixture.getPlayerClockService()
            const playerRepo = await fixture.getPlayerDocRepository()

            // Setup: Create player
            const playerId = 'integration-test-player-5'
            
            const initialPlayer: PlayerDoc = {
                id: playerId,
                createdUtc: new Date().toISOString(),
                updatedUtc: new Date().toISOString(),
                currentLocationId: 'loc-1',
                clockTick: 0
            }
            await playerRepo.upsertPlayer(initialPlayer)

            // Act: Interleave drift and actions
            await service.applyDrift(playerId, 10000) // +10s drift
            await service.advancePlayerTime(playerId, 5000, 'look') // +5s action
            await service.applyDrift(playerId, 20000) // +20s drift
            await service.advancePlayerTime(playerId, 60000, 'move') // +60s action

            // Verify combined advancement
            const player = await playerRepo.getPlayer(playerId)
            assert.strictEqual(player?.clockTick, 95000, 'Both drift and actions should advance clock')
            assert.ok(player?.lastAction, 'lastAction should be set')
            assert.ok(player?.lastDrift, 'lastDrift should be set')
        })
    })

    describe('Telemetry integration', () => {
        test('all operations emit telemetry events', async () => {
            const service = await fixture.getPlayerClockService()
            const playerRepo = await fixture.getPlayerDocRepository()
            const worldClockService = await fixture.getWorldClockService()
            const telemetry = await fixture.getTelemetryClient()

            // Setup
            const playerId = 'integration-test-player-6'
            const locationId = 'integration-test-location-6'
            
            const initialPlayer: PlayerDoc = {
                id: playerId,
                createdUtc: new Date().toISOString(),
                updatedUtc: new Date().toISOString(),
                currentLocationId: locationId,
                clockTick: 0
            }
            await playerRepo.upsertPlayer(initialPlayer)
            await worldClockService.advanceTick(100000, 'test setup')

            // Act: Perform all operations
            await service.advancePlayerTime(playerId, 10000, 'look')
            await service.applyDrift(playerId, 5000)
            await service.reconcile(playerId, locationId)

            // Verify telemetry events
            const advanceEvents = telemetry.events.filter(e => e.name === 'Player.Clock.Advanced')
            const driftEvents = telemetry.events.filter(e => e.name === 'Player.Clock.DriftApplied')
            const reconcileEvents = telemetry.events.filter(e => e.name === 'Player.Clock.Reconciled')

            assert.strictEqual(advanceEvents.length, 1, 'Should emit Player.Clock.Advanced')
            assert.strictEqual(driftEvents.length, 1, 'Should emit Player.Clock.DriftApplied')
            assert.strictEqual(reconcileEvents.length, 1, 'Should emit Player.Clock.Reconciled')

            // Verify event properties
            assert.strictEqual(advanceEvents[0].properties?.playerId, playerId)
            assert.strictEqual(advanceEvents[0].properties?.actionType, 'look')
            assert.strictEqual(advanceEvents[0].properties?.durationMs, 10000)

            assert.strictEqual(driftEvents[0].properties?.playerId, playerId)
            assert.strictEqual(driftEvents[0].properties?.realTimeElapsedMs, 5000)
            assert.strictEqual(driftEvents[0].properties?.driftMs, 5000)

            assert.strictEqual(reconcileEvents[0].properties?.playerId, playerId)
            assert.strictEqual(reconcileEvents[0].properties?.locationId, locationId)
            assert.strictEqual(reconcileEvents[0].properties?.method, 'wait')
        })
    })

    describe('Player offset calculations', () => {
        test('getPlayerOffset reflects current state correctly', async () => {
            const service = await fixture.getPlayerClockService()
            const playerRepo = await fixture.getPlayerDocRepository()
            const worldClockService = await fixture.getWorldClockService()

            // Setup: Create player
            const playerId = 'integration-test-player-7'
            
            const initialPlayer: PlayerDoc = {
                id: playerId,
                createdUtc: new Date().toISOString(),
                updatedUtc: new Date().toISOString(),
                currentLocationId: 'loc-1',
                clockTick: 0
            }
            await playerRepo.upsertPlayer(initialPlayer)

            // Initially both at 0
            let offset = await service.getPlayerOffset(playerId)
            assert.strictEqual(offset, 0, 'Initial offset should be 0')

            // Advance world clock only
            await worldClockService.advanceTick(50000, 'test')
            offset = await service.getPlayerOffset(playerId)
            assert.strictEqual(offset, -50000, 'Player should be behind')

            // Advance player clock ahead (but within slow threshold)
            await service.advancePlayerTime(playerId, 100000, 'move')
            offset = await service.getPlayerOffset(playerId)
            assert.strictEqual(offset, 50000, 'Player should be ahead')

            // Reconcile: player only slightly ahead, so uses slow policy (no change)
            const reconcileResult = await service.reconcile(playerId, 'loc-1')
            assert.strictEqual(reconcileResult.reconciliationMethod, 'slow', 'Should use slow policy for small offset')
            offset = await service.getPlayerOffset(playerId)
            assert.strictEqual(offset, 50000, 'Player offset unchanged with slow policy')

            // Now advance world clock to catch up
            await worldClockService.advanceTick(50000, 'catch up')
            offset = await service.getPlayerOffset(playerId)
            assert.strictEqual(offset, 0, 'Player should be aligned after world clock catches up')
        })
    })
})
