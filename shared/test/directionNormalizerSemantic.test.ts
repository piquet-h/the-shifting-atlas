import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeDirection, type LocationExitContext } from '../src/direction/directionNormalizer.js'

/**
 * Test suite for N2 semantic exit resolution
 * - Exit name matching
 * - Synonym matching
 * - Landmark alias matching
 * - Ambiguity handling (multiple matches)
 * - Edge cases (conflicts with cardinal shortcuts, etc.)
 */

// ---------------------------------------------------------------------------
// Helper: Create test context
// ---------------------------------------------------------------------------
function createContext(
    exits: Array<{ direction: string; name?: string; synonyms?: string[] }>,
    landmarkAliases?: Record<string, string>
): LocationExitContext {
    // Test helper: accepts string types for convenience, they match the actual Direction type at runtime
    return {
        exits: exits as LocationExitContext['exits'],
        landmarkAliases: landmarkAliases as LocationExitContext['landmarkAliases']
    }
}

// ---------------------------------------------------------------------------
// Semantic exit name resolution (happy path)
// ---------------------------------------------------------------------------
test('normalizeDirection: semantic exit name exact match', () => {
    const context = createContext([
        { direction: 'north', name: 'wooden_door' },
        { direction: 'south', name: 'stone_archway' }
    ])

    const result = normalizeDirection('wooden_door', undefined, context)
    assert.equal(result.status, 'ok')
    assert.equal(result.canonical, 'north')
})

test('normalizeDirection: semantic exit name case insensitive', () => {
    const context = createContext([{ direction: 'east', name: 'Iron_Gate' }])

    const result = normalizeDirection('IRON_GATE', undefined, context)
    assert.equal(result.status, 'ok')
    assert.equal(result.canonical, 'east')
})

// ---------------------------------------------------------------------------
// Synonym resolution
// ---------------------------------------------------------------------------
test('normalizeDirection: synonym resolves to direction', () => {
    const context = createContext([{ direction: 'north', name: 'entrance', synonyms: ['gate', 'doorway'] }])

    const result = normalizeDirection('gate', undefined, context)
    assert.equal(result.status, 'ok')
    assert.equal(result.canonical, 'north')
})

test('normalizeDirection: synonym case insensitive', () => {
    const context = createContext([{ direction: 'west', synonyms: ['Portal', 'Passage'] }])

    const result = normalizeDirection('portal', undefined, context)
    assert.equal(result.status, 'ok')
    assert.equal(result.canonical, 'west')
})

test('normalizeDirection: multiple synonyms on same exit', () => {
    const context = createContext([{ direction: 'up', synonyms: ['ladder', 'stairs', 'staircase'] }])

    assert.equal(normalizeDirection('ladder', undefined, context).canonical, 'up')
    assert.equal(normalizeDirection('stairs', undefined, context).canonical, 'up')
    assert.equal(normalizeDirection('staircase', undefined, context).canonical, 'up')
})

// ---------------------------------------------------------------------------
// Landmark alias resolution
// ---------------------------------------------------------------------------
test('normalizeDirection: landmark alias resolves to direction', () => {
    const context = createContext([{ direction: 'south' }, { direction: 'east' }], { fountain: 'south', statue: 'east' })

    const result = normalizeDirection('fountain', undefined, context)
    assert.equal(result.status, 'ok')
    assert.equal(result.canonical, 'south')
})

test('normalizeDirection: landmark alias case insensitive', () => {
    const context = createContext([{ direction: 'north' }], { Market_Square: 'north' })

    const result = normalizeDirection('market_square', undefined, context)
    assert.equal(result.status, 'ok')
    assert.equal(result.canonical, 'north')
})

test('normalizeDirection: exit name takes priority over landmark', () => {
    // If an exit has a name that matches a landmark, exit name wins
    const context = createContext([{ direction: 'north', name: 'fountain' }], { fountain: 'south' })

    const result = normalizeDirection('fountain', undefined, context)
    assert.equal(result.status, 'ok')
    assert.equal(result.canonical, 'north') // Exit name wins, not landmark
})

// ---------------------------------------------------------------------------
// Ambiguity handling (multiple matches)
// ---------------------------------------------------------------------------
test('normalizeDirection: ambiguous - multiple exits with same synonym', () => {
    const context = createContext([
        { direction: 'north', synonyms: ['door'] },
        { direction: 'south', synonyms: ['door'] }
    ])

    const result = normalizeDirection('door', undefined, context)
    assert.equal(result.status, 'ambiguous')
    assert.equal(result.ambiguityCount, 2)
    assert.match(result.clarification ?? '', /matches multiple exits/i)
    assert.match(result.clarification ?? '', /north.*south/i)
})

test('normalizeDirection: ambiguous - exit name appears multiple times', () => {
    // Edge case: multiple exits with same name (shouldn't happen, but handle gracefully)
    const context = createContext([
        { direction: 'east', name: 'passage' },
        { direction: 'west', name: 'passage' }
    ])

    const result = normalizeDirection('passage', undefined, context)
    assert.equal(result.status, 'ambiguous')
    assert.equal(result.ambiguityCount, 2)
})

test('normalizeDirection: ambiguous - three or more matches', () => {
    const context = createContext([
        { direction: 'north', synonyms: ['tunnel'] },
        { direction: 'south', synonyms: ['tunnel'] },
        { direction: 'east', synonyms: ['tunnel'] }
    ])

    const result = normalizeDirection('tunnel', undefined, context)
    assert.equal(result.status, 'ambiguous')
    assert.equal(result.ambiguityCount, 3)
})

// ---------------------------------------------------------------------------
// Unknown semantic input (no match)
// ---------------------------------------------------------------------------
test('normalizeDirection: unknown semantic name - no context', () => {
    // Without context, semantic names fall through to typo/unknown
    const result = normalizeDirection('wooden_door')
    assert.equal(result.status, 'unknown')
})

test('normalizeDirection: unknown semantic name - with context but no match', () => {
    const context = createContext([{ direction: 'north', name: 'stone_arch' }])

    const result = normalizeDirection('wooden_door', undefined, context)
    assert.equal(result.status, 'unknown')
    assert.match(result.clarification ?? '', /not a recognized direction/i)
})

// ---------------------------------------------------------------------------
// Priority / Precedence tests
// ---------------------------------------------------------------------------
test('normalizeDirection: canonical direction beats semantic', () => {
    // Canonical directions should match before semantic resolution
    const context = createContext([{ direction: 'south', name: 'north' }])

    const result = normalizeDirection('north', undefined, context)
    assert.equal(result.status, 'ok')
    assert.equal(result.canonical, 'north') // Canonical direction, not semantic name
})

test('normalizeDirection: shortcut beats semantic', () => {
    // Shortcuts should match before semantic resolution
    const context = createContext([{ direction: 'south', name: 'n' }])

    const result = normalizeDirection('n', undefined, context)
    assert.equal(result.status, 'ok')
    assert.equal(result.canonical, 'north') // Shortcut for north, not semantic name
})

test('normalizeDirection: semantic beats relative (no heading)', () => {
    // Semantic resolution should happen before relative direction check
    const context = createContext([{ direction: 'east', name: 'left' }])

    const result = normalizeDirection('left', undefined, context)
    assert.equal(result.status, 'ok')
    assert.equal(result.canonical, 'east') // Semantic match, not ambiguous relative
})

test('normalizeDirection: semantic beats typo correction', () => {
    // If semantic name is one edit distance from a direction, semantic wins
    const context = createContext([{ direction: 'west', name: 'nort' }]) // 'nort' is typo for 'north'

    const result = normalizeDirection('nort', undefined, context)
    assert.equal(result.status, 'ok')
    assert.equal(result.canonical, 'west') // Semantic match, not typo correction to 'north'
})

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------
test('normalizeDirection: empty exits array', () => {
    const context = createContext([])

    const result = normalizeDirection('door', undefined, context)
    assert.equal(result.status, 'unknown')
})

test('normalizeDirection: exit with name but no synonyms', () => {
    const context = createContext([{ direction: 'north', name: 'gate' }])

    assert.equal(normalizeDirection('gate', undefined, context).canonical, 'north')
    assert.equal(normalizeDirection('door', undefined, context).status, 'unknown')
})

test('normalizeDirection: exit with synonyms but no name', () => {
    const context = createContext([{ direction: 'south', synonyms: ['archway', 'arch'] }])

    assert.equal(normalizeDirection('archway', undefined, context).canonical, 'south')
    assert.equal(normalizeDirection('arch', undefined, context).canonical, 'south')
})

test('normalizeDirection: synonym matches exit name on different exit', () => {
    // Synonym 'door' on north exit, name 'door' on south exit
    const context = createContext([
        { direction: 'north', synonyms: ['door'] },
        { direction: 'south', name: 'door' }
    ])

    const result = normalizeDirection('door', undefined, context)
    assert.equal(result.status, 'ambiguous')
    assert.equal(result.ambiguityCount, 2)
})

test('normalizeDirection: undefined landmarkAliases is handled', () => {
    const context = createContext([{ direction: 'north', name: 'gate' }])
    // landmarkAliases is undefined

    const result = normalizeDirection('gate', undefined, context)
    assert.equal(result.status, 'ok')
    assert.equal(result.canonical, 'north')
})

test('normalizeDirection: empty landmarkAliases object', () => {
    const context = createContext([{ direction: 'north' }], {})

    const result = normalizeDirection('fountain', undefined, context)
    assert.equal(result.status, 'unknown')
})

// ---------------------------------------------------------------------------
// Integration with existing features
// ---------------------------------------------------------------------------
test('normalizeDirection: semantic + relative - semantic first', () => {
    // With heading, relative should work; semantic name takes priority
    const context = createContext([{ direction: 'west', name: 'forward' }])

    // Without context or heading, 'forward' is ambiguous relative
    assert.equal(normalizeDirection('forward').status, 'ambiguous')

    // With context but no heading, semantic wins
    assert.equal(normalizeDirection('forward', undefined, context).canonical, 'west')

    // With heading but no context, relative wins
    assert.equal(normalizeDirection('forward', 'north').canonical, 'north')

    // With both context and heading, semantic wins (comes first in pipeline)
    assert.equal(normalizeDirection('forward', 'north', context).canonical, 'west')
})

test('normalizeDirection: all features together', () => {
    const context = createContext(
        [
            { direction: 'north', name: 'main_gate', synonyms: ['gate', 'entrance'] },
            { direction: 'south', name: 'back_door', synonyms: ['door'] },
            { direction: 'east', synonyms: ['alley'] },
            { direction: 'west' }
        ],
        { fountain: 'north', market: 'east' }
    )

    // Canonical
    assert.equal(normalizeDirection('north', undefined, context).canonical, 'north')

    // Shortcut
    assert.equal(normalizeDirection('w', undefined, context).canonical, 'west')

    // Semantic name
    assert.equal(normalizeDirection('main_gate', undefined, context).canonical, 'north')

    // Synonym
    assert.equal(normalizeDirection('alley', undefined, context).canonical, 'east')

    // Landmark
    assert.equal(normalizeDirection('fountain', undefined, context).canonical, 'north')

    // Relative (with heading)
    assert.equal(normalizeDirection('left', 'north', context).canonical, 'west')

    // Unknown
    assert.equal(normalizeDirection('nowhere', undefined, context).status, 'unknown')
})
