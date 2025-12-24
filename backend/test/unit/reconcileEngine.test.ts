/**
 * Unit tests for Reconcile Engine
 * TDD: Tests written first to define expected behavior (RED phase)
 *
 * Tests reconciliation policies: wait (player behind), slow (player slightly ahead),
 * compress (player far ahead), and synchronized (no change) cases.
 */

import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import type { IReconcileEngine } from '../../src/services/ReconcileEngine.js'
import { UnitTestFixture } from '../helpers/UnitTestFixture.js'

describe('ReconcileEngine (unit)', () => {
    let fixture: UnitTestFixture
    let engine: IReconcileEngine

    beforeEach(async () => {
        fixture = new UnitTestFixture()
        await fixture.setup()
        engine = await fixture.getReconcileEngine()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    describe('wait policy: player behind location', () => {
        test('reconciles player clock to location when player behind', async () => {
            // Given: Player clock behind location clock
            const playerClock = 50000 // 50 seconds
            const locationClock = 100000 // 100 seconds
            const playerId = 'player-1'
            const locationId = 'loc-1'

            // When: Reconcile is called
            const result = await engine.reconcile(playerClock, locationClock, playerId, locationId)

            // Then: Wait policy should be used
            assert.strictEqual(result.reconciliationMethod, 'wait', 'Should use wait policy')
            assert.strictEqual(result.playerTickBefore, 50000, 'Should capture player tick before')
            assert.strictEqual(result.playerTickAfter, 100000, 'Should advance player to location clock')
            assert.strictEqual(result.worldClockTick, 100000, 'Should match location clock')
        })

        test('applies wait policy for small negative offset (< 1 minute)', async () => {
            // Given: Player clock slightly behind (30 seconds)
            const playerClock = 70000
            const locationClock = 100000
            const playerId = 'player-2'
            const locationId = 'loc-2'

            // When: Reconcile is called
            const result = await engine.reconcile(playerClock, locationClock, playerId, locationId)

            // Then: Wait policy still applies (no special case for tiny offsets)
            assert.strictEqual(result.reconciliationMethod, 'wait', 'Should use wait policy even for small offset')
            assert.strictEqual(result.playerTickAfter, 100000, 'Should advance to location clock')
        })

        test('narrative text is optional for wait policy', async () => {
            // Given: Player behind location
            const playerClock = 10000
            const locationClock = 50000
            const playerId = 'player-3'
            const locationId = 'loc-3'

            // When: Reconcile is called
            const result = await engine.reconcile(playerClock, locationClock, playerId, locationId)

            // Then: Narrative text may be undefined (delegated to NarrativeLayer)
            assert.strictEqual(result.reconciliationMethod, 'wait')
            // narrativeText can be undefined or a string - interface allows optional
            if (result.narrativeText !== undefined) {
                assert.strictEqual(typeof result.narrativeText, 'string', 'Narrative text should be string if present')
            }
        })
    })

    describe('slow policy: player slightly ahead', () => {
        test('uses slow policy when player ahead by less than threshold', async () => {
            // Given: Player ahead by 30 minutes (< 1 hour threshold)
            const playerClock = 100000 + 30 * 60 * 1000 // 30 minutes ahead
            const locationClock = 100000
            const playerId = 'player-4'
            const locationId = 'loc-4'

            // When: Reconcile is called
            const result = await engine.reconcile(playerClock, locationClock, playerId, locationId)

            // Then: Slow policy should be used
            assert.strictEqual(result.reconciliationMethod, 'slow', 'Should use slow policy')
            assert.strictEqual(result.playerTickBefore, playerClock, 'Should capture original player tick')
            assert.strictEqual(result.playerTickAfter, playerClock, 'Player clock stays ahead (location catches up)')
            assert.strictEqual(result.worldClockTick, locationClock, 'Should reference location clock')
        })

        test('slow policy boundary: exactly at threshold uses compress', async () => {
            // Given: Player ahead by exactly 1 hour (SLOW_THRESHOLD)
            const playerClock = 100000 + 3600000 // Exactly 1 hour ahead
            const locationClock = 100000
            const playerId = 'player-5'
            const locationId = 'loc-5'

            // When: Reconcile is called
            const result = await engine.reconcile(playerClock, locationClock, playerId, locationId)

            // Then: Compress policy should be used (>= threshold)
            assert.strictEqual(result.reconciliationMethod, 'compress', 'Should use compress at threshold boundary')
        })
    })

    describe('compress policy: player far ahead', () => {
        test('compresses player clock when far ahead of location', async () => {
            // Given: Player ahead by more than 1 hour
            const playerClock = 100000 + 2 * 3600000 // 2 hours ahead
            const locationClock = 100000
            const playerId = 'player-6'
            const locationId = 'loc-6'

            // When: Reconcile is called
            const result = await engine.reconcile(playerClock, locationClock, playerId, locationId)

            // Then: Compress policy should be used
            assert.strictEqual(result.reconciliationMethod, 'compress', 'Should use compress policy')
            assert.strictEqual(result.playerTickBefore, playerClock, 'Should capture original player tick')
            assert.strictEqual(result.playerTickAfter, 100000, 'Should compress player back to location clock')
            assert.strictEqual(result.worldClockTick, 100000, 'Should match location clock')
        })

        test('compress policy for massive drift (player offline for days)', async () => {
            // Given: Player ahead by 7 days (extreme drift scenario)
            const playerClock = 100000 + 7 * 24 * 3600000
            const locationClock = 100000
            const playerId = 'player-7'
            const locationId = 'loc-7'

            // When: Reconcile is called
            const result = await engine.reconcile(playerClock, locationClock, playerId, locationId)

            // Then: Compress policy handles massive offsets
            assert.strictEqual(result.reconciliationMethod, 'compress', 'Should handle massive drift with compress')
            assert.strictEqual(result.playerTickAfter, 100000, 'Should compress back to location')
        })

        test('narrative text is optional for compress policy', async () => {
            // Given: Player far ahead (more than 1 hour)
            const playerClock = 500000 + 2 * 3600000 // 2 hours + 500 seconds ahead
            const locationClock = 10000
            const playerId = 'player-8'
            const locationId = 'loc-8'

            // When: Reconcile is called
            const result = await engine.reconcile(playerClock, locationClock, playerId, locationId)

            // Then: Narrative text may be present (delegated to NarrativeLayer)
            assert.strictEqual(result.reconciliationMethod, 'compress')
            // narrativeText can be undefined or a string
            if (result.narrativeText !== undefined) {
                assert.strictEqual(typeof result.narrativeText, 'string', 'Narrative text should be string if present')
            }
        })
    })

    describe('synchronized: no reconciliation needed', () => {
        test('returns no-op result when player and location exactly synchronized', async () => {
            // Given: Player and location exactly aligned
            const playerClock = 100000
            const locationClock = 100000
            const playerId = 'player-9'
            const locationId = 'loc-9'

            // When: Reconcile is called
            const result = await engine.reconcile(playerClock, locationClock, playerId, locationId)

            // Then: No change needed
            assert.strictEqual(result.playerTickBefore, 100000, 'Should capture player tick')
            assert.strictEqual(result.playerTickAfter, 100000, 'Player tick should remain unchanged')
            assert.strictEqual(result.worldClockTick, 100000, 'Should match location clock')
            // Method can be any valid value - implementation chooses how to represent no-op
            assert.ok(['wait', 'slow', 'compress'].includes(result.reconciliationMethod), 'Should return valid reconciliation method')
        })

        test('no narrative generated for synchronized clocks', async () => {
            // Given: Clocks aligned
            const playerClock = 50000
            const locationClock = 50000
            const playerId = 'player-10'
            const locationId = 'loc-10'

            // When: Reconcile is called
            const result = await engine.reconcile(playerClock, locationClock, playerId, locationId)

            // Then: No narrative should be generated (clocks already aligned)
            assert.strictEqual(result.narrativeText, undefined, 'Should not generate narrative when synchronized')
        })
    })

    describe('edge cases', () => {
        test('two players with opposite offsets reconcile independently', async () => {
            // Given: Two players with opposite offsets to same location
            const locationClock = 100000

            // Player 1: Behind location
            const player1Clock = 50000
            const result1 = await engine.reconcile(player1Clock, locationClock, 'player-11', 'loc-11')

            // Player 2: Far ahead of location (> 1 hour)
            const player2Clock = 100000 + 2 * 3600000 // 2 hours ahead
            const result2 = await engine.reconcile(player2Clock, locationClock, 'player-12', 'loc-11')

            // Then: Each reconciles independently
            assert.strictEqual(result1.reconciliationMethod, 'wait', 'Player 1 should wait')
            assert.strictEqual(result1.playerTickAfter, 100000, 'Player 1 advances to location')

            assert.strictEqual(result2.reconciliationMethod, 'compress', 'Player 2 should compress')
            assert.strictEqual(result2.playerTickAfter, 100000, 'Player 2 compresses to location')
        })

        test('handles zero clock values', async () => {
            // Given: Both clocks at zero (game start scenario)
            const playerClock = 0
            const locationClock = 0
            const playerId = 'player-13'
            const locationId = 'loc-13'

            // When: Reconcile is called
            const result = await engine.reconcile(playerClock, locationClock, playerId, locationId)

            // Then: Should handle zero clocks gracefully
            assert.strictEqual(result.playerTickAfter, 0, 'Should remain at zero')
            assert.strictEqual(result.worldClockTick, 0, 'Location clock at zero')
        })

        test('handles large tick values without overflow', async () => {
            // Given: Large tick values (years of game time)
            const playerClock = Number.MAX_SAFE_INTEGER - 1000000
            const locationClock = Number.MAX_SAFE_INTEGER - 500000
            const playerId = 'player-14'
            const locationId = 'loc-14'

            // When: Reconcile is called
            const result = await engine.reconcile(playerClock, locationClock, playerId, locationId)

            // Then: Should handle large values safely
            assert.ok(Number.isSafeInteger(result.playerTickAfter), 'Result should be safe integer')
            assert.ok(Number.isSafeInteger(result.worldClockTick), 'Clock should be safe integer')
        })
    })
})
