/**
 * Exit Hint Debounce Repository Unit Tests
 *
 * Tests the in-memory implementation behavior:
 * - First call should emit (emit=true, debounceHit=false)
 * - Second call within window should be debounced (emit=false, debounceHit=true)
 * - Call after window expires should emit again
 * - Different player/location/direction combinations tracked separately
 */

import assert from 'node:assert'
import { beforeEach, describe, test } from 'node:test'
import { MemoryExitHintDebounceRepository } from '../../src/repos/exitHintDebounceRepository.memory.js'

describe('Exit Hint Debounce Repository', () => {
    describe('In-Memory Implementation', () => {
        let repo: MemoryExitHintDebounceRepository

        beforeEach(() => {
            // Use a 100ms debounce window for fast tests
            repo = new MemoryExitHintDebounceRepository(100)
        })

        test('first call should emit', async () => {
            const result = await repo.shouldEmit('player1', 'location1', 'north')

            assert.strictEqual(result.emit, true, 'Should emit on first call')
            assert.strictEqual(result.debounceHit, false, 'Should not be a debounce hit')
        })

        test('second call within window should be debounced', async () => {
            // First call - should emit
            await repo.shouldEmit('player1', 'location1', 'north')

            // Second call immediately - should be debounced
            const result = await repo.shouldEmit('player1', 'location1', 'north')

            assert.strictEqual(result.emit, false, 'Should not emit on second call within window')
            assert.strictEqual(result.debounceHit, true, 'Should be a debounce hit')
        })

        test('call after window expires should emit again', async () => {
            // First call - should emit
            await repo.shouldEmit('player1', 'location1', 'north')

            // Wait for debounce window to expire
            await new Promise((resolve) => setTimeout(resolve, 150))

            // Third call after window - should emit again
            const result = await repo.shouldEmit('player1', 'location1', 'north')

            assert.strictEqual(result.emit, true, 'Should emit after window expires')
            assert.strictEqual(result.debounceHit, false, 'Should not be a debounce hit after window expires')
        })

        test('different players are tracked separately', async () => {
            // Player 1 first call
            await repo.shouldEmit('player1', 'location1', 'north')

            // Player 2 first call - should also emit
            const result = await repo.shouldEmit('player2', 'location1', 'north')

            assert.strictEqual(result.emit, true, 'Different player should emit')
            assert.strictEqual(result.debounceHit, false, 'Different player should not be debounced')
        })

        test('different locations are tracked separately', async () => {
            // Location 1 first call
            await repo.shouldEmit('player1', 'location1', 'north')

            // Location 2 first call - should also emit
            const result = await repo.shouldEmit('player1', 'location2', 'north')

            assert.strictEqual(result.emit, true, 'Different location should emit')
            assert.strictEqual(result.debounceHit, false, 'Different location should not be debounced')
        })

        test('different directions are tracked separately', async () => {
            // North first call
            await repo.shouldEmit('player1', 'location1', 'north')

            // South first call - should also emit
            const result = await repo.shouldEmit('player1', 'location1', 'south')

            assert.strictEqual(result.emit, true, 'Different direction should emit')
            assert.strictEqual(result.debounceHit, false, 'Different direction should not be debounced')
        })

        test('clear removes all entries', async () => {
            // First call - should emit
            await repo.shouldEmit('player1', 'location1', 'north')

            // Clear the store
            repo.clear()

            // Call after clear - should emit again (as if first call)
            const result = await repo.shouldEmit('player1', 'location1', 'north')

            assert.strictEqual(result.emit, true, 'Should emit after clear')
            assert.strictEqual(result.debounceHit, false, 'Should not be a debounce hit after clear')
        })

        test('handles all canonical directions', async () => {
            const directions = [
                'north',
                'south',
                'east',
                'west',
                'up',
                'down',
                'in',
                'out',
                'northeast',
                'northwest',
                'southeast',
                'southwest'
            ] as const

            for (const dir of directions) {
                const result = await repo.shouldEmit('player1', 'location1', dir)
                assert.strictEqual(result.emit, true, `Should emit for direction ${dir}`)
            }
        })
    })
})

describe('Exit Hint Debounce Key Utilities', () => {
    test('buildDebounceKey creates correct format', async () => {
        const { buildDebounceKey } = await import('@piquet-h/shared/types/exitHintDebounceRepository')
        const key = buildDebounceKey('player-123', 'location-456', 'north')
        assert.strictEqual(key, 'player-123:location-456:north')
    })

    test('buildScopeKey creates correct format', async () => {
        const { buildScopeKey } = await import('@piquet-h/shared/types/exitHintDebounceRepository')
        const scopeKey = buildScopeKey('player-123')
        assert.strictEqual(scopeKey, 'player:player-123')
    })

    test('parseDebounceKey parses valid key', async () => {
        const { parseDebounceKey } = await import('@piquet-h/shared/types/exitHintDebounceRepository')
        const parsed = parseDebounceKey('player-123:location-456:north')

        assert.ok(parsed, 'Should parse valid key')
        assert.strictEqual(parsed.playerId, 'player-123')
        assert.strictEqual(parsed.originLocationId, 'location-456')
        assert.strictEqual(parsed.direction, 'north')
    })

    test('parseDebounceKey returns null for invalid key', async () => {
        const { parseDebounceKey } = await import('@piquet-h/shared/types/exitHintDebounceRepository')
        const parsed = parseDebounceKey('invalid-key')

        assert.strictEqual(parsed, null, 'Should return null for invalid key')
    })
})
