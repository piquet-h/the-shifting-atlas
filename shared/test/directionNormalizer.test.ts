import assert from 'node:assert/strict'
import test from 'node:test'
import { isRelativeDirection, normalizeDirection, resolveRelativeDirection } from '../src/direction/directionNormalizer.js'

/**
 * Refactored for readability / maintainability.
 * Strategy:
 *  - Group related concerns (relative detection, resolution, normalization facets)
 *  - Table‑driven cases avoid copy/paste while keeping granular failing test names
 *  - Preserve original coverage & edge cases
 */

// ---------------------------------------------------------------------------
// Relative direction identification
// ---------------------------------------------------------------------------
test('isRelativeDirection: positive tokens', () => {
    for (const value of ['left', 'right', 'forward', 'back', 'LEFT', 'Right']) {
        assert.ok(isRelativeDirection(value), `Expected '${value}' to be relative`)
    }
})

test('isRelativeDirection: negative tokens', () => {
    for (const value of ['north', 'south', 'invalid', '']) {
        assert.ok(!isRelativeDirection(value), `Expected '${value}' NOT to be relative`)
    }
})

// ---------------------------------------------------------------------------
// Relative resolution (direction + heading)
// ---------------------------------------------------------------------------
interface RelativeExpectation {
    heading: string
    expected: Record<'forward' | 'back' | 'left' | 'right', string>
}

const relativeMatrix: RelativeExpectation[] = [
    { heading: 'north', expected: { forward: 'north', back: 'south', left: 'west', right: 'east' } },
    { heading: 'south', expected: { forward: 'south', back: 'north', left: 'east', right: 'west' } },
    { heading: 'east', expected: { forward: 'east', back: 'west', left: 'north', right: 'south' } },
    { heading: 'west', expected: { forward: 'west', back: 'east', left: 'south', right: 'north' } },
    { heading: 'northeast', expected: { forward: 'northeast', back: 'southwest', left: 'northwest', right: 'southeast' } },
    { heading: 'southwest', expected: { forward: 'southwest', back: 'northeast', left: 'southeast', right: 'northwest' } },
    { heading: 'up', expected: { forward: 'up', back: 'down', left: 'up', right: 'up' } },
    { heading: 'out', expected: { forward: 'out', back: 'in', left: 'out', right: 'out' } }
]

for (const { heading, expected } of relativeMatrix) {
    for (const rel of Object.keys(expected) as (keyof typeof expected)[]) {
        test(`resolveRelativeDirection: ${rel} from ${heading}`, () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            assert.equal(resolveRelativeDirection(rel, heading as any), expected[rel])
        })
    }
}

// Explicit regression for acceptance criteria example (west + left → south)
test('resolveRelativeDirection: regression west + left → south', () => {
    assert.equal(resolveRelativeDirection('left', 'west'), 'south')
})

// ---------------------------------------------------------------------------
// normalizeDirection – canonical + case insensitivity
// ---------------------------------------------------------------------------
test('normalizeDirection: canonical passthrough + case', () => {
    const r1 = normalizeDirection('north')
    assert.equal(r1.status, 'ok')
    assert.equal(r1.canonical, 'north')

    const r2 = normalizeDirection('SOUTH')
    assert.equal(r2.status, 'ok')
    assert.equal(r2.canonical, 'south')
})

// Relative with heading
test('normalizeDirection: relative with heading', () => {
    const result = normalizeDirection('left', 'north')
    assert.equal(result.status, 'ok')
    assert.equal(result.canonical, 'west')
})

// Relative without heading → ambiguous
test('normalizeDirection: relative without heading ambiguous', () => {
    const result = normalizeDirection('left')
    assert.equal(result.status, 'ambiguous')
    assert.equal(result.canonical, undefined)
    assert.match(result.clarification ?? '', /previous move/i)
})

// Unknown token
test('normalizeDirection: unknown token', () => {
    const result = normalizeDirection('invalid')
    assert.equal(result.status, 'unknown')
    assert.equal(result.canonical, undefined)
    assert.match(result.clarification ?? '', /not a recognized direction/i)
})

// Empty / whitespace only
test('normalizeDirection: empty & whitespace', () => {
    for (const value of ['', '   ']) {
        const r = normalizeDirection(value)
        assert.equal(r.status, 'unknown', `Expected unknown for '${value}'`)
    }
})

// Whitespace trimming
test('normalizeDirection: trims whitespace', () => {
    const result = normalizeDirection('  north  ')
    assert.equal(result.status, 'ok')
    assert.equal(result.canonical, 'north')
})

// Heading wrap (already covered via regression + relative matrix; keep explicit)
test('normalizeDirection: heading wrap west + left', () => {
    const result = normalizeDirection('left', 'west')
    assert.equal(result.status, 'ok')
    assert.equal(result.canonical, 'south')
})

// ---------------------------------------------------------------------------
// Shortcuts (Stage 1)
// ---------------------------------------------------------------------------
const shortcutMap: Record<string, string> = {
    n: 'north',
    s: 'south',
    e: 'east',
    w: 'west',
    ne: 'northeast',
    nw: 'northwest',
    se: 'southeast',
    sw: 'southwest',
    u: 'up',
    d: 'down',
    i: 'in',
    o: 'out'
}

for (const [shortcut, canonical] of Object.entries(shortcutMap)) {
    test(`normalizeDirection: shortcut '${shortcut}' → ${canonical}`, () => {
        const r = normalizeDirection(shortcut)
        assert.deepEqual(r, { status: 'ok', canonical })
    })
}

test('normalizeDirection: shortcut case insensitivity', () => {
    assert.equal(normalizeDirection('N').canonical, 'north')
    assert.equal(normalizeDirection('NE').canonical, 'northeast')
    assert.equal(normalizeDirection('U').canonical, 'up')
})

// ---------------------------------------------------------------------------
// Typo tolerance (edit distance ≤1)
// ---------------------------------------------------------------------------
interface TypoCase {
    input: string
    expected: string
}
const typoGood: TypoCase[] = [
    { input: 'nort', expected: 'north' },
    { input: 'sooth', expected: 'south' }, // substitution
    { input: 'norrth', expected: 'north' }, // insertion
    { input: 'dwn', expected: 'down' } // deletion
]

for (const { input, expected } of typoGood) {
    test(`normalizeDirection: typo '${input}' → ${expected}`, () => {
        const r = normalizeDirection(input)
        assert.equal(r.status, 'ok')
        assert.equal(r.canonical, expected)
        if (input !== expected) {
            assert.match(r.clarification ?? '', new RegExp(input, 'i'))
            assert.match(r.clarification ?? '', new RegExp(expected, 'i'))
        }
    })
}

test('normalizeDirection: no match beyond edit distance 1', () => {
    const r = normalizeDirection('xyz')
    assert.equal(r.status, 'unknown')
    assert.equal(r.canonical, undefined)
})

for (const ambiguous of ['est', 'weast']) {
    test(`normalizeDirection: ambiguous typo '${ambiguous}'`, () => {
        const r = normalizeDirection(ambiguous)
        assert.equal(r.status, 'unknown')
        assert.equal(r.canonical, undefined)
    })
}
