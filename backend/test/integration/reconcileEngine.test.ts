/**
 * Integration tests for Reconcile Engine
 *
 * Tests ReconcileEngine with real repository implementations to verify
 * end-to-end reconciliation behavior with player clock updates.
 */

import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import type { PlayerDoc } from '@piquet-h/shared'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'
import type { IReconcileEngine } from '../../src/services/ReconcileEngine.js'
import type { IPlayerDocRepository } from '../../src/repos/PlayerDocRepository.js'
import type { IWorldClockService } from '../../src/services/types.js'

describe('ReconcileEngine (integration)', () => {
    let fixture: IntegrationTestFixture
    let engine: IReconcileEngine
    let playerRepo: IPlayerDocRepository
    let worldClockService: IWorldClockService

    beforeEach(async () => {
        fixture = new IntegrationTestFixture()
        await fixture.setup()
        engine = await fixture.getReconcileEngine()
        playerRepo = await fixture.getPlayerDocRepository()
        worldClockService = await fixture.getWorldClockService()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    test('player with offset reconciles to location clock and narrative returned', async () => {
        // Given: World clock advanced to 100 seconds
        await worldClockService.advanceTick(100000, 'test setup')

        // Given: Player behind world clock
        const playerId = 'integration-player-1'
        const locationId = 'integration-loc-1'
        const initialPlayer: PlayerDoc = {
            id: playerId,
            createdUtc: new Date().toISOString(),
            updatedUtc: new Date().toISOString(),
            currentLocationId: locationId,
            clockTick: 50000 // Behind by 50 seconds
        }
        await playerRepo.upsertPlayer(initialPlayer)

        // When: Reconcile is called
        const locationClock = await worldClockService.getCurrentTick()
        const result = await engine.reconcile(initialPlayer.clockTick!, locationClock, playerId, locationId)

        // Then: Reconciliation result shows wait policy applied
        assert.strictEqual(result.reconciliationMethod, 'wait', 'Should use wait policy')
        assert.strictEqual(result.playerTickBefore, 50000, 'Should capture initial tick')
        assert.strictEqual(result.playerTickAfter, 100000, 'Should advance to world clock')
        assert.strictEqual(result.worldClockTick, 100000, 'Should match world clock')

        // Note: Narrative text is optional (delegated to NarrativeLayer)
        // Engine returns undefined for MVP, NarrativeLayer integration is separate issue
    })

    test('player ahead of location triggers compress policy', async () => {
        // Given: World clock at 50 seconds
        await worldClockService.advanceTick(50000, 'test setup')

        // Given: Player far ahead (more than 1 hour)
        const playerId = 'integration-player-2'
        const locationId = 'integration-loc-2'
        const initialPlayer: PlayerDoc = {
            id: playerId,
            createdUtc: new Date().toISOString(),
            updatedUtc: new Date().toISOString(),
            currentLocationId: locationId,
            clockTick: 50000 + 2 * 3600000 // 2 hours ahead
        }
        await playerRepo.upsertPlayer(initialPlayer)

        // When: Reconcile is called
        const locationClock = await worldClockService.getCurrentTick()
        const result = await engine.reconcile(initialPlayer.clockTick!, locationClock, playerId, locationId)

        // Then: Compress policy applied
        assert.strictEqual(result.reconciliationMethod, 'compress', 'Should use compress policy')
        assert.strictEqual(result.playerTickAfter, 50000, 'Should compress back to location clock')
    })

    test('player slightly ahead triggers slow policy', async () => {
        // Given: World clock at 100 seconds
        await worldClockService.advanceTick(100000, 'test setup')

        // Given: Player ahead by 30 minutes (< 1 hour threshold)
        const playerId = 'integration-player-3'
        const locationId = 'integration-loc-3'
        const playerAheadBy = 30 * 60 * 1000 // 30 minutes
        const initialPlayer: PlayerDoc = {
            id: playerId,
            createdUtc: new Date().toISOString(),
            updatedUtc: new Date().toISOString(),
            currentLocationId: locationId,
            clockTick: 100000 + playerAheadBy
        }
        await playerRepo.upsertPlayer(initialPlayer)

        // When: Reconcile is called
        const locationClock = await worldClockService.getCurrentTick()
        const result = await engine.reconcile(initialPlayer.clockTick!, locationClock, playerId, locationId)

        // Then: Slow policy applied (rare edge case)
        assert.strictEqual(result.reconciliationMethod, 'slow', 'Should use slow policy')
        assert.strictEqual(result.playerTickAfter, initialPlayer.clockTick, 'Player clock stays ahead')
    })

    test('synchronized clocks return no-op with no narrative', async () => {
        // Given: World clock at 75 seconds
        await worldClockService.advanceTick(75000, 'test setup')

        // Given: Player exactly aligned with world clock
        const playerId = 'integration-player-4'
        const locationId = 'integration-loc-4'
        const clockTick = 75000
        const initialPlayer: PlayerDoc = {
            id: playerId,
            createdUtc: new Date().toISOString(),
            updatedUtc: new Date().toISOString(),
            currentLocationId: locationId,
            clockTick
        }
        await playerRepo.upsertPlayer(initialPlayer)

        // When: Reconcile is called
        const locationClock = await worldClockService.getCurrentTick()
        const result = await engine.reconcile(clockTick, locationClock, playerId, locationId)

        // Then: No change needed
        assert.strictEqual(result.playerTickBefore, 75000)
        assert.strictEqual(result.playerTickAfter, 75000, 'Clock unchanged')
        assert.strictEqual(result.narrativeText, undefined, 'No narrative for synchronized clocks')
    })
})
