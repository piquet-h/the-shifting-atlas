/**
 * Unit tests for exitDescriptionScaffold.ts
 *
 * Tests the deterministic scaffold generator (generateExitDescriptionScaffold).
 * Validates all direction classes, duration buckets, and hint combinations.
 */

import assert from 'node:assert'
import { describe, test } from 'node:test'
import { generateExitDescriptionScaffold, travelDurationMsToBucket } from '../../src/services/exitDescriptionScaffold.js'

// ---------------------------------------------------------------------------
// Helper: basic contract checks (no shared validator — use inline checks)
// ---------------------------------------------------------------------------

function assertValidScaffold(
    description: string,
    result: { forward: string; backward: string },
    expectedFwdDir: string,
    grade?: string
): void {
    const { forward, backward } = result

    // EL-01/EL-02: length bounds
    assert.ok(forward.length >= 15, `${description}: forward too short (${forward.length}): "${forward}"`)
    assert.ok(forward.length <= 120, `${description}: forward too long (${forward.length}): "${forward}"`)
    assert.ok(backward.length >= 15, `${description}: backward too short (${backward.length}): "${backward}"`)
    assert.ok(backward.length <= 120, `${description}: backward too long (${backward.length}): "${backward}"`)

    // EL-03: single sentence
    const fwdPeriods = (forward.match(/[.!?]/g) || []).length
    const bwdPeriods = (backward.match(/[.!?]/g) || []).length
    assert.equal(fwdPeriods, 1, `${description}: forward must end with exactly one period: "${forward}"`)
    assert.equal(bwdPeriods, 1, `${description}: backward must end with exactly one period: "${backward}"`)

    // EL-09: no weather/time-of-day
    const weatherPattern =
        /\b(fog|mist|rain|snow|storm|wind|cloud|ice|frost|morning|evening|dusk|dawn|sunset|twilight|moonlit|sunlit|starlit)\b/i
    assert.ok(!weatherPattern.test(forward), `${description}: weather term in forward: "${forward}"`)
    assert.ok(!weatherPattern.test(backward), `${description}: weather term in backward: "${backward}"`)

    // EL-08: no numeric durations
    const numericPattern = /\b\d+\s*(min|minute|sec|second|hour|meter|metre|km|mile)\b/i
    assert.ok(!numericPattern.test(forward), `${description}: numeric duration in forward: "${forward}"`)
    assert.ok(!numericPattern.test(backward), `${description}: numeric duration in backward: "${backward}"`)

    // EL-06: no climb/descend verbs unless grade is ascending/descending
    if (!grade || grade === 'level') {
        const climbPattern = /\b(climb|climbs|descend|descends|ascend|ascends)\b/i
        // Only check cardinal/diagonal — up/down direction uses vertical verbs
        const isVertical = expectedFwdDir === 'up' || expectedFwdDir === 'down'
        if (!isVertical) {
            assert.ok(!climbPattern.test(forward), `${description}: grade-verb without grade hint in forward: "${forward}"`)
        }
    }

    // Must end with period
    assert.ok(forward.endsWith('.'), `${description}: forward must end with '.': "${forward}"`)
    assert.ok(backward.endsWith('.'), `${description}: backward must end with '.': "${backward}"`)
}

// ---------------------------------------------------------------------------
// in / out directions (interior threshold transitions)
// ---------------------------------------------------------------------------

describe('exitDescriptionScaffold — in/out interior transitions', () => {
    test('in: default (no pathKind) uses "into" framing', () => {
        const result = generateExitDescriptionScaffold({ direction: 'in', durationBucket: 'threshold' })
        assert.ok(result.forward.includes('into'), `Expected "into" in forward: "${result.forward}"`)
        assertValidScaffold('in default', result, 'in')
    })

    test('in: door pathKind uses into framing', () => {
        const result = generateExitDescriptionScaffold({ direction: 'in', durationBucket: 'threshold', pathKind: 'door' })
        assert.ok(result.forward.toLowerCase().includes('door'), `Expected "door" in forward: "${result.forward}"`)
        assert.ok(result.forward.includes('into'), `Expected "into" in forward: "${result.forward}"`)
        assertValidScaffold('in door', result, 'in')
    })

    test('in: gate pathKind uses into framing', () => {
        const result = generateExitDescriptionScaffold({ direction: 'in', durationBucket: 'threshold', pathKind: 'gate' })
        assert.ok(result.forward.toLowerCase().includes('gate'), `Expected "gate" in forward: "${result.forward}"`)
        assertValidScaffold('in gate', result, 'in')
    })

    test('in: passage pathKind uses "through" framing', () => {
        const result = generateExitDescriptionScaffold({ direction: 'in', durationBucket: 'threshold', pathKind: 'passage' })
        assert.ok(result.forward.toLowerCase().includes('through'), `Expected "through" in forward: "${result.forward}"`)
        assert.ok(result.backward.toLowerCase().includes('back out'), `Expected "back out" in backward: "${result.backward}"`)
        assertValidScaffold('in passage', result, 'in')
    })

    test('in: gap pathKind uses "through" framing', () => {
        const result = generateExitDescriptionScaffold({ direction: 'in', durationBucket: 'threshold', pathKind: 'gap' })
        assert.ok(result.forward.toLowerCase().includes('through'), `Expected "through" in forward: "${result.forward}"`)
        assertValidScaffold('in gap', result, 'in')
    })

    test('in: backward uses "back outside" or "back out"', () => {
        const result = generateExitDescriptionScaffold({ direction: 'in', durationBucket: 'threshold' })
        const bwdLower = result.backward.toLowerCase()
        assert.ok(
            bwdLower.includes('back out') || bwdLower.includes('back outside'),
            `Expected "back out" or "back outside" in backward: "${result.backward}"`
        )
        assertValidScaffold('in backward check', result, 'in')
    })

    test('out: default opens back outside', () => {
        const result = generateExitDescriptionScaffold({ direction: 'out', durationBucket: 'threshold' })
        assert.ok(result.forward.toLowerCase().includes('outside'), `Expected "outside" in forward: "${result.forward}"`)
        assertValidScaffold('out default', result, 'out')
    })

    test('out: passage uses "back out" framing', () => {
        const result = generateExitDescriptionScaffold({ direction: 'out', durationBucket: 'threshold', pathKind: 'passage' })
        assert.ok(result.forward.toLowerCase().includes('back out'), `Expected "back out" in forward: "${result.forward}"`)
        assertValidScaffold('out passage', result, 'out')
    })

    test('in/out: ignores durationBucket (always threshold register)', () => {
        const nearResult = generateExitDescriptionScaffold({ direction: 'in', durationBucket: 'near' })
        const distantResult = generateExitDescriptionScaffold({ direction: 'in', durationBucket: 'distant' })
        assertValidScaffold('in near-bucket', nearResult, 'in')
        assertValidScaffold('in distant-bucket', distantResult, 'in')
    })

    test('in/out: no road/trail/track/journey/walk/ride (EL-05)', () => {
        const result = generateExitDescriptionScaffold({ direction: 'in', durationBucket: 'threshold' })
        const el05Terms = /\b(road|trail|track|journey|walk|ride)\b/i
        assert.ok(!el05Terms.test(result.forward), `Forward must not contain EL-05 terms: "${result.forward}"`)
        assert.ok(!el05Terms.test(result.backward), `Backward must not contain EL-05 terms: "${result.backward}"`)
    })
})

// ---------------------------------------------------------------------------
// up / down directions (vertical transitions)
// ---------------------------------------------------------------------------

describe('exitDescriptionScaffold — up/down vertical transitions', () => {
    test('up: default produces upward language', () => {
        const result = generateExitDescriptionScaffold({ direction: 'up', durationBucket: 'threshold' })
        assert.ok(
            result.forward.toLowerCase().includes('ascend') || result.forward.toLowerCase().includes('up'),
            `Expected upward language in forward: "${result.forward}"`
        )
        assertValidScaffold('up default', result, 'up')
    })

    test('up: stair pathKind uses "Stone steps ascend above"', () => {
        const result = generateExitDescriptionScaffold({ direction: 'up', durationBucket: 'threshold', pathKind: 'stair' })
        assert.ok(result.forward.toLowerCase().includes('stone steps'), `Expected "Stone steps" in forward: "${result.forward}"`)
        assert.ok(result.forward.toLowerCase().includes('ascend'), `Expected "ascend" in forward: "${result.forward}"`)
        assert.ok(result.backward.toLowerCase().includes('descend'), `Expected "descend" in backward: "${result.backward}"`)
        assertValidScaffold('up stair', result, 'up')
    })

    test('up: ladder pathKind uses ladder register', () => {
        const result = generateExitDescriptionScaffold({ direction: 'up', durationBucket: 'threshold', pathKind: 'ladder' })
        assert.ok(result.forward.toLowerCase().includes('ladder'), `Expected "ladder" in forward: "${result.forward}"`)
        assert.ok(result.forward.toLowerCase().includes('ascend'), `Expected "ascend" in forward: "${result.forward}"`)
        assertValidScaffold('up ladder', result, 'up')
    })

    test('down: stair pathKind uses "Stone steps descend below"', () => {
        const result = generateExitDescriptionScaffold({ direction: 'down', durationBucket: 'threshold', pathKind: 'stair' })
        assert.ok(result.forward.toLowerCase().includes('stone steps'), `Expected "Stone steps" in forward: "${result.forward}"`)
        assert.ok(result.forward.toLowerCase().includes('descend'), `Expected "descend" in forward: "${result.forward}"`)
        assert.ok(result.backward.toLowerCase().includes('ascend'), `Expected "ascend" in backward: "${result.backward}"`)
        assertValidScaffold('down stair', result, 'down')
    })

    test('down: ladder pathKind uses ladder drop register', () => {
        const result = generateExitDescriptionScaffold({ direction: 'down', durationBucket: 'threshold', pathKind: 'ladder' })
        assert.ok(result.forward.toLowerCase().includes('ladder'), `Expected "ladder" in forward: "${result.forward}"`)
        assert.ok(
            result.forward.toLowerCase().includes('drops') || result.forward.toLowerCase().includes('drop'),
            `Expected "drop" in forward: "${result.forward}"`
        )
        assertValidScaffold('down ladder', result, 'down')
    })

    test('up/down stair: forward and backward are complementary', () => {
        const upResult = generateExitDescriptionScaffold({ direction: 'up', durationBucket: 'threshold', pathKind: 'stair' })
        const downResult = generateExitDescriptionScaffold({ direction: 'down', durationBucket: 'threshold', pathKind: 'stair' })
        assert.equal(upResult.forward, downResult.backward, 'up.forward should equal down.backward')
        assert.equal(upResult.backward, downResult.forward, 'up.backward should equal down.forward')
    })
})

// ---------------------------------------------------------------------------
// Cardinal directions — duration buckets (no grade)
// ---------------------------------------------------------------------------

describe('exitDescriptionScaffold — cardinal directions × buckets', () => {
    test('threshold: "A path leads north" (no walk wording)', () => {
        const result = generateExitDescriptionScaffold({ direction: 'north', durationBucket: 'threshold' })
        assert.ok(result.forward.includes('north'), `Expected "north" in forward: "${result.forward}"`)
        assert.ok(!/\bwalk\b/i.test(result.forward), `"walk" must not appear in threshold: "${result.forward}"`)
        assertValidScaffold('threshold north', result, 'north')
    })

    test('near: uses "short" qualifier', () => {
        const result = generateExitDescriptionScaffold({ direction: 'north', durationBucket: 'near' })
        assert.ok(result.forward.toLowerCase().includes('short'), `Expected "short" qualifier: "${result.forward}"`)
        assertValidScaffold('near north', result, 'north')
    })

    test('moderate: uses "continues"', () => {
        const result = generateExitDescriptionScaffold({ direction: 'east', durationBucket: 'moderate' })
        assert.ok(result.forward.toLowerCase().includes('continues'), `Expected "continues": "${result.forward}"`)
        assertValidScaffold('moderate east', result, 'east')
    })

    test('far: uses "stretches"', () => {
        const result = generateExitDescriptionScaffold({ direction: 'west', durationBucket: 'far' })
        assert.ok(result.forward.toLowerCase().includes('stretches'), `Expected "stretches": "${result.forward}"`)
        assertValidScaffold('far west', result, 'west')
    })

    test('distant: uses "disappears" and "distance"', () => {
        const result = generateExitDescriptionScaffold({ direction: 'north', durationBucket: 'distant' })
        assert.ok(result.forward.toLowerCase().includes('disappears'), `Expected "disappears": "${result.forward}"`)
        assert.ok(result.forward.toLowerCase().includes('distance'), `Expected "distance": "${result.forward}"`)
        assertValidScaffold('distant north', result, 'north')
    })

    test('all cardinals × all buckets: valid output', () => {
        const cardinals = ['north', 'south', 'east', 'west'] as const
        const buckets = ['threshold', 'near', 'moderate', 'far', 'distant'] as const
        for (const dir of cardinals) {
            for (const bucket of buckets) {
                const result = generateExitDescriptionScaffold({ direction: dir, durationBucket: bucket })
                assertValidScaffold(`${bucket} ${dir}`, result, dir)
            }
        }
    })

    test('backward includes opposite direction', () => {
        const result = generateExitDescriptionScaffold({ direction: 'north', durationBucket: 'moderate' })
        assert.ok(result.backward.includes('south'), `Expected "south" in backward: "${result.backward}"`)
    })
})

// ---------------------------------------------------------------------------
// Diagonal directions
// ---------------------------------------------------------------------------

describe('exitDescriptionScaffold — diagonal directions', () => {
    test('northeast: contains northeast in forward, southwest in backward', () => {
        const result = generateExitDescriptionScaffold({ direction: 'northeast', durationBucket: 'moderate' })
        assert.ok(result.forward.includes('northeast'), `Expected "northeast" in forward: "${result.forward}"`)
        assert.ok(result.backward.includes('southwest'), `Expected "southwest" in backward: "${result.backward}"`)
        assertValidScaffold('moderate northeast', result, 'northeast')
    })

    test('all diagonals × moderate: valid output', () => {
        const diagonals = ['northeast', 'northwest', 'southeast', 'southwest'] as const
        for (const dir of diagonals) {
            const result = generateExitDescriptionScaffold({ direction: dir, durationBucket: 'moderate' })
            assertValidScaffold(`moderate ${dir}`, result, dir)
        }
    })
})

// ---------------------------------------------------------------------------
// pathKind hints on cardinal exits
// ---------------------------------------------------------------------------

describe('exitDescriptionScaffold — pathKind hints', () => {
    test('road pathKind uses "road" noun', () => {
        const result = generateExitDescriptionScaffold({ direction: 'north', durationBucket: 'moderate', pathKind: 'road' })
        assert.ok(result.forward.toLowerCase().includes('road'), `Expected "road": "${result.forward}"`)
        assertValidScaffold('road north moderate', result, 'north')
    })

    test('track pathKind uses "track" noun', () => {
        const result = generateExitDescriptionScaffold({ direction: 'west', durationBucket: 'far', pathKind: 'track' })
        assert.ok(result.forward.toLowerCase().includes('track'), `Expected "track": "${result.forward}"`)
        assertValidScaffold('track west far', result, 'west')
    })

    test('trail pathKind uses "trail" noun', () => {
        const result = generateExitDescriptionScaffold({ direction: 'south', durationBucket: 'near', pathKind: 'trail' })
        assert.ok(result.forward.toLowerCase().includes('trail'), `Expected "trail": "${result.forward}"`)
        assertValidScaffold('trail south near', result, 'south')
    })

    test('door pathKind on cardinal uses "leads" (threshold) register', () => {
        const result = generateExitDescriptionScaffold({ direction: 'north', durationBucket: 'moderate', pathKind: 'door' })
        assert.ok(result.forward.toLowerCase().includes('door'), `Expected "door": "${result.forward}"`)
        assert.ok(result.forward.toLowerCase().includes('leads'), `Expected "leads" (threshold register): "${result.forward}"`)
        assertValidScaffold('door north moderate', result, 'north')
    })

    test('gate pathKind on cardinal uses threshold register', () => {
        const result = generateExitDescriptionScaffold({ direction: 'south', durationBucket: 'far', pathKind: 'gate' })
        assert.ok(result.forward.toLowerCase().includes('gate'), `Expected "gate": "${result.forward}"`)
        assertValidScaffold('gate south far', result, 'south')
    })
})

// ---------------------------------------------------------------------------
// Grade hints on cardinal exits
// ---------------------------------------------------------------------------

describe('exitDescriptionScaffold — grade hints', () => {
    test('ascending grade uses "climbs"', () => {
        const result = generateExitDescriptionScaffold({ direction: 'west', durationBucket: 'far', grade: 'ascending' })
        assert.ok(result.forward.toLowerCase().includes('climbs'), `Expected "climbs": "${result.forward}"`)
        assertValidScaffold('west ascending', result, 'west', 'ascending')
    })

    test('ascending + track pathKind: "A track climbs [dir]"', () => {
        const result = generateExitDescriptionScaffold({ direction: 'north', durationBucket: 'far', pathKind: 'track', grade: 'ascending' })
        assert.ok(result.forward.toLowerCase().includes('track'), `Expected "track": "${result.forward}"`)
        assert.ok(result.forward.toLowerCase().includes('climbs'), `Expected "climbs": "${result.forward}"`)
        assertValidScaffold('track north ascending', result, 'north', 'ascending')
    })

    test('descending grade uses "descends"', () => {
        const result = generateExitDescriptionScaffold({ direction: 'south', durationBucket: 'moderate', grade: 'descending' })
        assert.ok(result.forward.toLowerCase().includes('descends'), `Expected "descends": "${result.forward}"`)
        assertValidScaffold('south descending', result, 'south', 'descending')
    })

    test('descending backward uses "climbs back"', () => {
        const result = generateExitDescriptionScaffold({ direction: 'south', durationBucket: 'moderate', grade: 'descending' })
        assert.ok(result.backward.toLowerCase().includes('climbs'), `Expected "climbs" in backward: "${result.backward}"`)
        assertValidScaffold('south descending backward', result, 'south', 'descending')
    })

    test('level grade produces no climbing language', () => {
        const result = generateExitDescriptionScaffold({ direction: 'north', durationBucket: 'moderate', grade: 'level' })
        const climbPattern = /\b(climb|climbs|ascend|ascends|descend|descends)\b/i
        assert.ok(!climbPattern.test(result.forward), `No grade-verb for level: "${result.forward}"`)
        assertValidScaffold('north level', result, 'north', 'level')
    })
})

// ---------------------------------------------------------------------------
// travelDurationMsToBucket
// ---------------------------------------------------------------------------

describe('travelDurationMsToBucket', () => {
    test('undefined → moderate', () => assert.equal(travelDurationMsToBucket(undefined), 'moderate'))
    test('null → moderate', () => assert.equal(travelDurationMsToBucket(null), 'moderate'))
    test('0 → moderate', () => assert.equal(travelDurationMsToBucket(0), 'moderate'))
    test('5 000 ms → threshold', () => assert.equal(travelDurationMsToBucket(5_000), 'threshold'))
    test('14 999 ms → threshold', () => assert.equal(travelDurationMsToBucket(14_999), 'threshold'))
    test('15 000 ms → near', () => assert.equal(travelDurationMsToBucket(15_000), 'near'))
    test('299 999 ms → near', () => assert.equal(travelDurationMsToBucket(299_999), 'near'))
    test('300 000 ms → moderate', () => assert.equal(travelDurationMsToBucket(300_000), 'moderate'))
    test('1 799 999 ms → moderate', () => assert.equal(travelDurationMsToBucket(1_799_999), 'moderate'))
    test('1 800 000 ms → far', () => assert.equal(travelDurationMsToBucket(1_800_000), 'far'))
    test('14 399 999 ms → far', () => assert.equal(travelDurationMsToBucket(14_399_999), 'far'))
    test('14 400 000 ms → distant', () => assert.equal(travelDurationMsToBucket(14_400_000), 'distant'))
    test('very large → distant', () => assert.equal(travelDurationMsToBucket(999_999_999), 'distant'))
})

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe('exitDescriptionScaffold — determinism', () => {
    test('identical inputs produce identical outputs', () => {
        const input = { direction: 'north' as const, durationBucket: 'moderate' as const, pathKind: 'road' as const }
        const r1 = generateExitDescriptionScaffold(input)
        const r2 = generateExitDescriptionScaffold(input)
        assert.equal(r1.forward, r2.forward)
        assert.equal(r1.backward, r2.backward)
    })

    test('different buckets produce different text', () => {
        const near = generateExitDescriptionScaffold({ direction: 'north', durationBucket: 'near' })
        const distant = generateExitDescriptionScaffold({ direction: 'north', durationBucket: 'distant' })
        assert.notEqual(near.forward, distant.forward)
    })
})

// ---------------------------------------------------------------------------
// Exhaustive sweep: all directions × all buckets
// ---------------------------------------------------------------------------

describe('exitDescriptionScaffold — exhaustive sweep', () => {
    const ALL_DIRECTIONS = [
        'north',
        'south',
        'east',
        'west',
        'northeast',
        'northwest',
        'southeast',
        'southwest',
        'up',
        'down',
        'in',
        'out'
    ] as const
    const ALL_BUCKETS = ['threshold', 'near', 'moderate', 'far', 'distant'] as const

    for (const dir of ALL_DIRECTIONS) {
        for (const bucket of ALL_BUCKETS) {
            test(`${dir} × ${bucket}`, () => {
                const result = generateExitDescriptionScaffold({ direction: dir, durationBucket: bucket })
                assertValidScaffold(`${dir} × ${bucket}`, result, dir)
            })
        }
    }
})
