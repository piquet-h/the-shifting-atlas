import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import {
    ExitGenerationHintStore,
    getExitGenerationHintStore,
    resetExitGenerationHintStore,
    hashPlayerIdForTelemetry
} from '../src/direction/exitGenerationHintStore.js'
import { normalizeDirection, type LocationExitContext } from '../src/direction/directionNormalizer.js'

/**
 * Test suite for N4 Exit Generation Fallback (Issue #35)
 *
 * Tests cover:
 * - Generate status when no exit exists for valid direction
 * - OK status when exit exists
 * - No generate status when no context provided (backward compat)
 * - Debounce effectiveness
 * - Player ID hashing for telemetry
 */

// ---------------------------------------------------------------------------
// Helper: Create test context with locationId
// ---------------------------------------------------------------------------
function createContext(
    locationId: string,
    exits: Array<{ direction: string; name?: string; synonyms?: string[] }>,
    landmarkAliases?: Record<string, string>
): LocationExitContext {
    return {
        locationId,
        exits: exits as LocationExitContext['exits'],
        landmarkAliases: landmarkAliases as LocationExitContext['landmarkAliases']
    }
}

// ---------------------------------------------------------------------------
// normalizeDirection generate status tests
// ---------------------------------------------------------------------------
describe('N4 Exit Generation Fallback - normalizeDirection', () => {
    it('should return generate status when direction is valid but no exit exists', () => {
        const context = createContext('loc-123', [{ direction: 'south' }])

        const result = normalizeDirection('north', undefined, context)

        assert.equal(result.status, 'generate')
        assert.equal(result.canonical, 'north')
        assert.ok(result.generationHint, 'Should have generationHint')
        assert.equal(result.generationHint?.originLocationId, 'loc-123')
        assert.equal(result.generationHint?.direction, 'north')
        assert.ok(result.clarification, 'Should have clarification message')
    })

    it('should return ok status when exit exists for the direction', () => {
        const context = createContext('loc-123', [{ direction: 'north' }, { direction: 'south' }])

        const result = normalizeDirection('north', undefined, context)

        assert.equal(result.status, 'ok')
        assert.equal(result.canonical, 'north')
        assert.equal(result.generationHint, undefined)
    })

    it('should return ok status when no context provided (backward compat)', () => {
        // Without context, normalizer cannot check exit existence
        const result = normalizeDirection('north')

        assert.equal(result.status, 'ok')
        assert.equal(result.canonical, 'north')
        assert.equal(result.generationHint, undefined)
    })

    it('should return generate for shortcut when no exit exists', () => {
        const context = createContext('loc-456', [{ direction: 'south' }])

        const result = normalizeDirection('n', undefined, context)

        assert.equal(result.status, 'generate')
        assert.equal(result.canonical, 'north')
        assert.equal(result.generationHint?.originLocationId, 'loc-456')
        assert.equal(result.generationHint?.direction, 'north')
    })

    it('should return generate for typo-corrected direction when no exit exists', () => {
        const context = createContext('loc-789', [{ direction: 'south' }])

        const result = normalizeDirection('nort', undefined, context)

        assert.equal(result.status, 'generate')
        assert.equal(result.canonical, 'north')
        assert.ok(result.clarification?.includes('Interpreted'))
        assert.equal(result.generationHint?.direction, 'north')
    })

    it('should return generate for relative direction when no exit exists', () => {
        const context = createContext('loc-abc', [{ direction: 'north' }])

        // Heading is north, 'left' resolves to 'west', but no west exit exists
        const result = normalizeDirection('left', 'north', context)

        assert.equal(result.status, 'generate')
        assert.equal(result.canonical, 'west')
        assert.equal(result.generationHint?.direction, 'west')
    })

    it('should return ok for relative direction when exit exists', () => {
        const context = createContext('loc-abc', [{ direction: 'north' }, { direction: 'west' }])

        const result = normalizeDirection('left', 'north', context)

        assert.equal(result.status, 'ok')
        assert.equal(result.canonical, 'west')
    })

    it('should return ok for semantic exit match (exit inherently exists)', () => {
        const context = createContext('loc-def', [{ direction: 'north', name: 'wooden_door' }])

        const result = normalizeDirection('wooden_door', undefined, context)

        assert.equal(result.status, 'ok')
        assert.equal(result.canonical, 'north')
    })

    it('should preserve clarification message for generate status with typo', () => {
        const context = createContext('loc-ghi', [{ direction: 'south' }])

        const result = normalizeDirection('nort', undefined, context)

        assert.equal(result.status, 'generate')
        assert.ok(result.clarification?.includes('Interpreted "nort" as "north"'))
    })
})

// ---------------------------------------------------------------------------
// ExitGenerationHintStore tests
// ---------------------------------------------------------------------------
describe('N4 Exit Generation Fallback - ExitGenerationHintStore', () => {
    let store: ExitGenerationHintStore

    beforeEach(() => {
        store = new ExitGenerationHintStore({ debounceWindowMs: 100 })
    })

    afterEach(() => {
        store.dispose()
    })

    it('should emit on first request', () => {
        const result = store.checkAndRecord('player-1', 'loc-1', 'north')

        assert.equal(result.shouldEmit, true)
        assert.equal(result.debounceHit, false)
        assert.ok(result.hint)
        assert.equal(result.hint.playerId, 'player-1')
        assert.equal(result.hint.originLocationId, 'loc-1')
        assert.equal(result.hint.direction, 'north')
        assert.ok(result.hint.timestamp)
    })

    it('should debounce identical request within window', () => {
        const first = store.checkAndRecord('player-1', 'loc-1', 'north')
        const second = store.checkAndRecord('player-1', 'loc-1', 'north')

        assert.equal(first.shouldEmit, true)
        assert.equal(first.debounceHit, false)
        assert.equal(second.shouldEmit, false)
        assert.equal(second.debounceHit, true)
    })

    it('should not debounce different direction at same location', () => {
        const first = store.checkAndRecord('player-1', 'loc-1', 'north')
        const second = store.checkAndRecord('player-1', 'loc-1', 'south')

        assert.equal(first.shouldEmit, true)
        assert.equal(second.shouldEmit, true)
    })

    it('should not debounce same direction at different location', () => {
        const first = store.checkAndRecord('player-1', 'loc-1', 'north')
        const second = store.checkAndRecord('player-1', 'loc-2', 'north')

        assert.equal(first.shouldEmit, true)
        assert.equal(second.shouldEmit, true)
    })

    it('should not debounce different players', () => {
        const first = store.checkAndRecord('player-1', 'loc-1', 'north')
        const second = store.checkAndRecord('player-2', 'loc-1', 'north')

        assert.equal(first.shouldEmit, true)
        assert.equal(second.shouldEmit, true)
    })

    it('should emit after debounce window expires', async () => {
        const first = store.checkAndRecord('player-1', 'loc-1', 'north')
        assert.equal(first.shouldEmit, true)

        // Wait for debounce window to expire
        await new Promise((resolve) => setTimeout(resolve, 150))

        const second = store.checkAndRecord('player-1', 'loc-1', 'north')
        assert.equal(second.shouldEmit, true)
        assert.equal(second.debounceHit, false)
    })

    it('should clear all entries', () => {
        store.checkAndRecord('player-1', 'loc-1', 'north')
        store.checkAndRecord('player-1', 'loc-1', 'south')
        assert.equal(store.size, 2)

        store.clear()

        assert.equal(store.size, 0)
        // Should emit again after clear
        const result = store.checkAndRecord('player-1', 'loc-1', 'north')
        assert.equal(result.shouldEmit, true)
    })

    it('should return config', () => {
        const config = store.getConfig()
        assert.equal(config.debounceWindowMs, 100)
    })
})

// ---------------------------------------------------------------------------
// Global singleton tests
// ---------------------------------------------------------------------------
describe('N4 Exit Generation Fallback - Global Store', () => {
    beforeEach(() => {
        resetExitGenerationHintStore()
    })

    afterEach(() => {
        resetExitGenerationHintStore()
    })

    it('should return same instance on multiple calls', () => {
        const store1 = getExitGenerationHintStore()
        const store2 = getExitGenerationHintStore()

        assert.strictEqual(store1, store2)
    })

    it('should reset and create new instance', () => {
        const store1 = getExitGenerationHintStore()
        store1.checkAndRecord('player-1', 'loc-1', 'north')

        resetExitGenerationHintStore()

        const store2 = getExitGenerationHintStore()
        // Should be a new instance, not debounced
        const result = store2.checkAndRecord('player-1', 'loc-1', 'north')
        assert.equal(result.shouldEmit, true)
    })
})

// ---------------------------------------------------------------------------
// Player ID hashing tests
// ---------------------------------------------------------------------------
describe('N4 Exit Generation Fallback - Player ID Hashing', () => {
    it('should hash player ID consistently', () => {
        const playerId = '12345678-1234-1234-1234-123456789abc'
        const hash1 = hashPlayerIdForTelemetry(playerId)
        const hash2 = hashPlayerIdForTelemetry(playerId)

        assert.equal(hash1, hash2)
    })

    it('should produce different hashes for different IDs', () => {
        const hash1 = hashPlayerIdForTelemetry('player-1')
        const hash2 = hashPlayerIdForTelemetry('player-2')

        assert.notEqual(hash1, hash2)
    })

    it('should return hex string', () => {
        const hash = hashPlayerIdForTelemetry('test-player')
        assert.match(hash, /^[0-9a-f]+$/)
    })

    it('should handle empty string', () => {
        const hash = hashPlayerIdForTelemetry('')
        assert.ok(hash)
        assert.match(hash, /^[0-9a-f]+$/)
    })
})

// ---------------------------------------------------------------------------
// Telemetry event name verification
// ---------------------------------------------------------------------------
describe('N4 Exit Generation Fallback - Telemetry Event', () => {
    it('should have Navigation.Exit.GenerationRequested in event names', async () => {
        const { isGameEventName } = await import('../src/telemetryEvents.js')

        assert.ok(isGameEventName('Navigation.Exit.GenerationRequested'))
    })
})
