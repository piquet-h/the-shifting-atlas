/**
 * Integration tests: scaffold generation → exit description validation
 *
 * Cross-validates that every output produced by `generateExitDescriptionScaffold`
 * (backend) passes all checks enforced by `validateExitDescription` (shared).
 *
 * This is the "integration-style" requirement from the exit description governance
 * issue: the full scaffold pipeline is exercised and the shared validator is applied
 * to its output, confirming the two modules remain in sync.
 *
 * Risk: LOW (tests only)
 * See: docs/architecture/exit-language-contract.md
 */

import assert from 'node:assert'
import { describe, test } from 'node:test'
import type { Direction } from '@piquet-h/shared'
import { validateExitDescription } from '@piquet-h/shared'
import { generateExitDescriptionScaffold } from '../../src/services/exitDescriptionScaffold.js'
import type { DurationBucket, PathKind, Grade } from '../../src/services/exitDescriptionScaffold.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Assert that both halves of a scaffold pair pass all EL-01–EL-09 checks. */
function assertScaffoldPassesValidator(
    label: string,
    forward: string,
    backward: string,
    forwardDir: Direction,
    backwardDir: Direction,
    opts?: { destinationName?: string; grade?: Grade }
): void {
    const fwdResult = validateExitDescription({
        text: forward,
        direction: forwardDir,
        grade: opts?.grade,
        destinationName: opts?.destinationName
    })
    assert.equal(
        fwdResult.valid,
        true,
        `${label}: forward failed ${fwdResult.failingCheck?.checkId} — "${fwdResult.failingCheck?.reason}": "${forward}"`
    )

    const bwdResult = validateExitDescription({
        text: backward,
        direction: backwardDir,
        grade: opts?.grade,
        destinationName: opts?.destinationName
    })
    assert.equal(
        bwdResult.valid,
        true,
        `${label}: backward failed ${bwdResult.failingCheck?.checkId} — "${bwdResult.failingCheck?.reason}": "${backward}"`
    )
}

// ---------------------------------------------------------------------------
// Exhaustive sweep: all directions × all buckets
// ---------------------------------------------------------------------------

describe('scaffold → validator: all directions × all buckets', () => {
    const ALL_DIRECTIONS: Direction[] = [
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
    ]
    const ALL_BUCKETS: DurationBucket[] = ['threshold', 'near', 'moderate', 'far', 'distant']

    for (const dir of ALL_DIRECTIONS) {
        for (const bucket of ALL_BUCKETS) {
            test(`scaffold validates: ${dir} × ${bucket}`, () => {
                const result = generateExitDescriptionScaffold({ direction: dir, durationBucket: bucket })

                // Determine the return direction for the backward description
                // For cardinal/diagonal, the backward direction is the opposite.
                // For in/out and up/down we don't need direction coherence checks from
                // EL-05/EL-06 on the backward, but we still validate both.
                // Pass 'north' as a safe neutral direction for non-cardinal backward checks;
                // the validator only applies EL-05/EL-06 directionally, and scaffold
                // text is guaranteed not to use road language for in/out.
                const backwardDir: Direction =
                    dir === 'in' ? 'out' : dir === 'out' ? 'in' : dir === 'up' ? 'down' : dir === 'down' ? 'up' : dir

                assertScaffoldPassesValidator(`${dir} × ${bucket}`, result.forward, result.backward, dir, backwardDir)
            })
        }
    }
})

// ---------------------------------------------------------------------------
// direction coherence: in/out — EL-05 (no road language)
// ---------------------------------------------------------------------------

describe('scaffold → validator: in/out EL-05 coherence', () => {
    const THRESHOLD_PATH_KINDS: PathKind[] = ['door', 'gate', 'gap', 'passage']

    for (const pathKind of THRESHOLD_PATH_KINDS) {
        test(`in direction, pathKind=${pathKind}: no road language (EL-05 passes)`, () => {
            const result = generateExitDescriptionScaffold({ direction: 'in', durationBucket: 'threshold', pathKind })
            const fwdResult = validateExitDescription({ text: result.forward, direction: 'in' })
            assert.notEqual(
                fwdResult.failingCheck?.checkId,
                'EL-05',
                `EL-05 should not fire for 'in' scaffold with pathKind=${pathKind}: "${result.forward}"`
            )
        })

        test(`out direction, pathKind=${pathKind}: no road language (EL-05 passes)`, () => {
            const result = generateExitDescriptionScaffold({ direction: 'out', durationBucket: 'threshold', pathKind })
            const fwdResult = validateExitDescription({ text: result.forward, direction: 'out' })
            assert.notEqual(
                fwdResult.failingCheck?.checkId,
                'EL-05',
                `EL-05 should not fire for 'out' scaffold with pathKind=${pathKind}: "${result.forward}"`
            )
        })
    }

    test('in direction, default (no pathKind): no road language (EL-05 passes)', () => {
        const result = generateExitDescriptionScaffold({ direction: 'in', durationBucket: 'threshold' })
        const fwdResult = validateExitDescription({ text: result.forward, direction: 'in' })
        assert.notEqual(fwdResult.failingCheck?.checkId, 'EL-05', `EL-05 should not fire for 'in' scaffold: "${result.forward}"`)
    })
})

// ---------------------------------------------------------------------------
// vertical coherence: up/down — EL-06 (no un-graded climb on cardinal)
// ---------------------------------------------------------------------------

describe('scaffold → validator: up/down vertical coherence (EL-06 not applicable)', () => {
    test('up direction scaffold: climb verbs are permitted (EL-06 skips non-cardinal)', () => {
        const result = generateExitDescriptionScaffold({ direction: 'up', durationBucket: 'threshold' })
        const fwdResult = validateExitDescription({ text: result.forward, direction: 'up' })
        // EL-06 only applies to cardinal/diagonal — up/down should never trigger it
        assert.notEqual(fwdResult.failingCheck?.checkId, 'EL-06', `EL-06 should not fire for 'up' scaffold: "${result.forward}"`)
    })

    test('down direction scaffold: descend verbs are permitted (EL-06 skips non-cardinal)', () => {
        const result = generateExitDescriptionScaffold({ direction: 'down', durationBucket: 'threshold' })
        const fwdResult = validateExitDescription({ text: result.forward, direction: 'down' })
        assert.notEqual(fwdResult.failingCheck?.checkId, 'EL-06', `EL-06 should not fire for 'down' scaffold: "${result.forward}"`)
    })
})

// ---------------------------------------------------------------------------
// grade-based climb verbs on cardinal: EL-06 passes when grade hint present
// ---------------------------------------------------------------------------

describe('scaffold → validator: graded cardinal scaffold EL-06 coherence', () => {
    const CARDINAL_DIRS: Direction[] = ['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest']

    for (const dir of CARDINAL_DIRS) {
        test(`ascending grade, direction=${dir}: climb verb allowed (EL-06 passes)`, () => {
            const result = generateExitDescriptionScaffold({ direction: dir, durationBucket: 'far', grade: 'ascending' })
            const fwdResult = validateExitDescription({ text: result.forward, direction: dir, grade: 'ascending' })
            assert.equal(
                fwdResult.valid,
                true,
                `ascending scaffold for ${dir} failed: ${fwdResult.failingCheck?.reason} — "${result.forward}"`
            )
        })

        test(`descending grade, direction=${dir}: descend verb allowed (EL-06 passes)`, () => {
            const result = generateExitDescriptionScaffold({ direction: dir, durationBucket: 'moderate', grade: 'descending' })
            const fwdResult = validateExitDescription({ text: result.forward, direction: dir, grade: 'descending' })
            assert.equal(
                fwdResult.valid,
                true,
                `descending scaffold for ${dir} failed: ${fwdResult.failingCheck?.reason} — "${result.forward}"`
            )
        })
    }
})

// ---------------------------------------------------------------------------
// Spot checks: scaffold output satisfies length bounds and single-sentence constraint
// ---------------------------------------------------------------------------

describe('scaffold → validator: length and single-sentence spot checks', () => {
    test('distant north scaffold: passes EL-01 (max 120) and EL-02 (min 15)', () => {
        const result = generateExitDescriptionScaffold({ direction: 'north', durationBucket: 'distant' })
        const fwdResult = validateExitDescription({ text: result.forward, direction: 'north' })
        assert.notEqual(fwdResult.failingCheck?.checkId, 'EL-01', `EL-01 (too long) should not fire: "${result.forward}"`)
        assert.notEqual(fwdResult.failingCheck?.checkId, 'EL-02', `EL-02 (too short) should not fire: "${result.forward}"`)
    })

    test('threshold in scaffold: passes EL-03 (single sentence)', () => {
        const result = generateExitDescriptionScaffold({ direction: 'in', durationBucket: 'threshold' })
        const fwdResult = validateExitDescription({ text: result.forward, direction: 'in' })
        assert.notEqual(fwdResult.failingCheck?.checkId, 'EL-03', `EL-03 (multi-sentence) should not fire: "${result.forward}"`)
    })

    test('scaffold output contains no weather or time-of-day terms (EL-09)', () => {
        // Spot check a variety of directions + buckets against EL-09
        const cases: Array<[Direction, DurationBucket]> = [
            ['north', 'moderate'],
            ['south', 'far'],
            ['east', 'near'],
            ['in', 'threshold'],
            ['up', 'threshold'],
            ['down', 'threshold']
        ]
        for (const [dir, bucket] of cases) {
            const result = generateExitDescriptionScaffold({ direction: dir, durationBucket: bucket })
            const fwdResult = validateExitDescription({ text: result.forward, direction: dir })
            assert.notEqual(
                fwdResult.failingCheck?.checkId,
                'EL-09',
                `EL-09 (weather/time) should not fire for ${dir}×${bucket}: "${result.forward}"`
            )
        }
    })
})
