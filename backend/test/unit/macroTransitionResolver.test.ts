import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveTransitionOutcome } from '../../src/services/macroTransitionResolver.js'

// ---------------------------------------------------------------------------
// macroTransitionResolver — three-way outcome: stay / transition / blocked
// ---------------------------------------------------------------------------
// Test data anchored to real atlas entries in:
//   backend/src/data/theLongReachMacroAtlas.json
//   backend/src/data/mosswellMacroAtlas.json
// ---------------------------------------------------------------------------

test('resolveTransitionOutcome: stay — no authored edge in attempted direction', () => {
    // southeast has no macro-transition edge authored for lr-area-mosswell-fiordhead
    const result = resolveTransitionOutcome(['macro:area:lr-area-mosswell-fiordhead', 'settlement:mosswell'], 'southeast')

    assert.equal(result.outcome, 'stay')
})

test('resolveTransitionOutcome: transition — ready destination, north from Mosswell Fiordhead', () => {
    const result = resolveTransitionOutcome(['macro:area:lr-area-mosswell-fiordhead', 'settlement:mosswell'], 'north')

    assert.equal(result.outcome, 'transition')
    if (result.outcome !== 'transition') return

    assert.equal(result.destinationAreaRef, 'lr-corridor-northgate-valley')
    assert.equal(result.requiresRouteHandoff, false)
    assert.equal(result.entrySegmentRef, 'lr-area-northwatch-ranges')
    assert.ok(result.threshold.length > 0, 'threshold prose must be non-empty')
    assert.equal(result.handoffRouteRef, undefined)
})

test('resolveTransitionOutcome: blocked — blocked destination, west from Mosswell Fiordhead', () => {
    const result = resolveTransitionOutcome(['macro:area:lr-area-mosswell-fiordhead', 'settlement:mosswell'], 'west')

    assert.equal(result.outcome, 'blocked')
    if (result.outcome !== 'blocked') return

    assert.equal(result.destinationAreaRef, 'lr-area-fiordmarch-west')
    assert.equal(result.reason, 'blocked')
    assert.ok(result.barrierRefs && result.barrierRefs.length > 0, 'blocked transition must carry barrier refs')
})

test('resolveTransitionOutcome: blocked — partial destination, east from Mosswell Fiordhead', () => {
    const result = resolveTransitionOutcome(['macro:area:lr-area-mosswell-fiordhead', 'settlement:mosswell'], 'east')

    assert.equal(result.outcome, 'blocked')
    if (result.outcome !== 'blocked') return

    assert.equal(result.destinationAreaRef, 'lr-area-eastfall-foothills')
    assert.equal(result.reason, 'partial')
})

test('resolveTransitionOutcome: stay — sourceTags is undefined', () => {
    const result = resolveTransitionOutcome(undefined, 'north')

    assert.equal(result.outcome, 'stay')
})

test('resolveTransitionOutcome: stay — sourceTags carry no macro:area: tag', () => {
    const result = resolveTransitionOutcome(['settlement:mosswell', 'shore:dunes'], 'north')

    assert.equal(result.outcome, 'stay')
})

test('resolveTransitionOutcome: transition — requiresRouteHandoff:true, northeast from Mosswell Fiordhead', () => {
    // northeast edge is authored with ready + requiresRouteHandoff:true + handoffRouteRef
    const result = resolveTransitionOutcome(['macro:area:lr-area-mosswell-fiordhead', 'settlement:mosswell'], 'northeast')

    assert.equal(result.outcome, 'transition')
    if (result.outcome !== 'transition') return

    assert.equal(result.destinationAreaRef, 'lr-corridor-northgate-valley')
    assert.equal(result.requiresRouteHandoff, true)
    assert.equal(result.handoffRouteRef, 'mw-route-harbor-to-northgate')
    assert.equal(result.entrySegmentRef, 'lr-area-northwatch-ranges')
})

test('resolveTransitionOutcome: stay — already in destination area, no outbound macro-transition edge', () => {
    // lr-corridor-northgate-valley has no outbound macro-transition edge going north
    const result = resolveTransitionOutcome(['macro:area:lr-corridor-northgate-valley', 'frontier:depth:2'], 'north')

    assert.equal(result.outcome, 'stay')
})

// ---------------------------------------------------------------------------
// Additional coverage: threshold content, directional asymmetry, traversal
// ---------------------------------------------------------------------------

test('resolveTransitionOutcome: transition threshold content identifies the atlas area crossing condition', () => {
    // The threshold must be meaningful prose naming the geographic boundary crossed —
    // not merely a non-empty string.  The north edge from Mosswell Fiordhead references
    // both the source basin and the Northgate Valley corridor.
    const result = resolveTransitionOutcome(['macro:area:lr-area-mosswell-fiordhead', 'settlement:mosswell'], 'north')

    assert.equal(result.outcome, 'transition')
    if (result.outcome !== 'transition') return

    assert.ok(
        result.threshold.includes('Northgate') || result.threshold.includes('Mosswell') || result.threshold.includes('north-road'),
        `Threshold must reference the atlas crossing point, got: "${result.threshold}"`
    )
})

test('resolveTransitionOutcome: same area yields ready in one direction and blocked in another (directional asymmetry)', () => {
    // Edge case: a destination may be ready in one direction and blocked in another.
    // Both outcomes must be resolved from the same source area without interference.
    const northResult = resolveTransitionOutcome(['macro:area:lr-area-mosswell-fiordhead', 'settlement:mosswell'], 'north')
    const westResult = resolveTransitionOutcome(['macro:area:lr-area-mosswell-fiordhead', 'settlement:mosswell'], 'west')

    assert.equal(northResult.outcome, 'transition', 'North from Mosswell Fiordhead must resolve to ready transition')
    assert.equal(westResult.outcome, 'blocked', 'West from Mosswell Fiordhead must resolve to blocked')
})

test('resolveTransitionOutcome: blocked outcome carries traversal classification from atlas edge', () => {
    // The traversal field on a blocked outcome allows callers to inspect the edge type
    // (open, constrained, blocked) for diagnostic and narration purposes.
    const result = resolveTransitionOutcome(['macro:area:lr-area-mosswell-fiordhead', 'settlement:mosswell'], 'west')

    assert.equal(result.outcome, 'blocked')
    if (result.outcome !== 'blocked') return

    assert.equal(result.traversal, 'constrained', 'Blocked outcome must carry the traversal classification from the atlas edge')
})
