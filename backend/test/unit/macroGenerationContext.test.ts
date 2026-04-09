import assert from 'node:assert/strict'
import test from 'node:test'

import {
    buildAtlasAwarePendingMetadata,
    buildAtlasConstrainedExitAvailability,
    planAtlasAwareFutureLocation,
    resolveAreaTransitionEdge,
    resolveMacroGenerationContext,
    scoreAtlasAwareReconnectionCandidate,
    selectAtlasAwareExpansionDirections,
    selectAtlasAwareTerrain
} from '../../src/services/macroGenerationContext.js'

test('resolveMacroGenerationContext: derives trend, route continuity, water context, and barriers from macro tags', () => {
    const context = resolveMacroGenerationContext(
        [
            'settlement:mosswell',
            'macro:area:lr-area-mosswell-fiordhead',
            'macro:route:mw-route-harbor-to-northgate',
            'macro:water:fjord-sound-head'
        ],
        'north'
    )

    assert.equal(context.expansionDirection, 'north')
    assert.equal(context.areaRef, 'lr-area-mosswell-fiordhead')
    assert.equal(context.waterContext, 'fjord-sound-head')
    assert.ok(context.directionTerrainTrend?.includes('valley'))
    assert.ok(context.routeContinuityHint?.includes('North Road'))
    assert.ok(context.barrierSemantics.some((barrier) => barrier.includes('Fiord Deeps')))
    assert.equal(context.preferredFutureNodePrefix, 'North Road')
})

test('selectAtlasAwareTerrain: biases westward Mosswell expansion toward constrained cliff/fiord terrain', () => {
    const context = resolveMacroGenerationContext(
        [
            'settlement:mosswell',
            'macro:area:lr-area-mosswell-fiordhead',
            'macro:route:mw-route-harbor-to-delta',
            'macro:water:fjord-sound-head'
        ],
        'west'
    )

    const terrain = selectAtlasAwareTerrain('open-plain', context)

    assert.equal(terrain, 'narrow-corridor')
})

test('selectAtlasAwareTerrain: preserves road/valley continuity north of Mosswell when atlas stays broad and traversable', () => {
    const context = resolveMacroGenerationContext(
        [
            'settlement:mosswell',
            'macro:area:lr-area-mosswell-fiordhead',
            'macro:route:mw-route-harbor-to-northgate',
            'macro:water:fjord-sound-head'
        ],
        'north'
    )

    const terrain = selectAtlasAwareTerrain('open-plain', context)

    assert.equal(terrain, 'open-plain')
})

test('selectAtlasAwareExpansionDirections: prioritizes trend-bearing atlas directions over terrain default order', () => {
    const directions = selectAtlasAwareExpansionDirections('open-plain', 'east', 2, [
        'settlement:mosswell',
        'macro:area:lr-area-mosswell-fiordhead',
        'macro:route:mw-route-harbor-to-northgate',
        'macro:water:fjord-sound-head'
    ])

    assert.deepEqual(directions, ['north', 'west'])
})

test('scoreAtlasAwareReconnectionCandidate: prefers route/area-compatible candidate over generic tie', () => {
    const targetContext = resolveMacroGenerationContext(
        [
            'settlement:mosswell',
            'macro:area:lr-area-mosswell-fiordhead',
            'macro:route:mw-route-harbor-to-delta',
            'macro:water:fjord-sound-head'
        ],
        'west'
    )

    const compatibleScore = scoreAtlasAwareReconnectionCandidate(targetContext, 'open-plain', 'narrow-corridor', [
        'settlement:mosswell',
        'macro:area:lr-area-mosswell-fiordhead',
        'macro:route:mw-route-harbor-to-delta',
        'macro:water:fjord-sound-head'
    ])

    const genericScore = scoreAtlasAwareReconnectionCandidate(targetContext, 'open-plain', 'open-plain', ['settlement:mosswell'])

    assert.ok(compatibleScore > genericScore)
})

test('buildAtlasConstrainedExitAvailability: converts impossible waterfront continuation into forbidden direction before generation', () => {
    const context = resolveMacroGenerationContext(
        [
            'settlement:mosswell',
            'macro:area:lr-area-mosswell-fiordhead',
            'macro:route:mw-route-harbor-to-delta',
            'macro:water:fjord-sound-head'
        ],
        'west'
    )

    const availability = buildAtlasConstrainedExitAvailability('narrow-corridor', context, 'east')

    assert.ok(!availability.pending?.west)
    assert.ok(availability.forbidden?.west)
    assert.ok(availability.forbidden?.west?.reason.includes('fiord') || availability.forbidden?.west?.reason.includes('cliff'))
    assert.ok(availability.pending?.north)
    assert.ok(availability.pending?.south)
})

test('planAtlasAwareFutureLocation: carries frontier depth forward, avoids exact repeated names, and provides fallback prose', () => {
    const plan = planAtlasAwareFutureLocation('narrow-corridor', 'south', [
        'settlement:mosswell',
        'macro:area:lr-area-mosswell-fiordhead',
        'macro:water:fjord-sound-head',
        'frontier:depth:1'
    ])

    assert.equal(plan.tags.includes('frontier:depth:2'), true)
    assert.notEqual(plan.name, 'Soundside Southward Reach')
    assert.ok(plan.description.trim().length > 0)
    assert.ok(plan.description.includes('south') || plan.description.includes('Soundside'))
})

test('buildAtlasAwarePendingMetadata: interior direction ("in") produces interior structural archetype', () => {
    const context = resolveMacroGenerationContext(['settlement:mosswell', 'macro:area:lr-area-mosswell-fiordhead'], 'in')

    const metadata = buildAtlasAwarePendingMetadata(context)

    assert.equal(metadata.structuralArchetype, 'interior')
    assert.equal(metadata.macroAreaRef, 'lr-area-mosswell-fiordhead')
})

test('buildAtlasAwarePendingMetadata: vertical direction ("up") produces vertical structural archetype', () => {
    const context = resolveMacroGenerationContext(['settlement:mosswell', 'macro:area:lr-area-mosswell-fiordhead'], 'up')

    const metadata = buildAtlasAwarePendingMetadata(context)

    assert.equal(metadata.structuralArchetype, 'vertical')
})

test('buildAtlasAwarePendingMetadata: vertical direction ("down") produces vertical structural archetype', () => {
    const context = resolveMacroGenerationContext(['settlement:mosswell'], 'down')

    const metadata = buildAtlasAwarePendingMetadata(context)

    assert.equal(metadata.structuralArchetype, 'vertical')
})

test('buildAtlasAwarePendingMetadata: waterfront direction ("west") with water context produces waterfront archetype', () => {
    const context = resolveMacroGenerationContext(
        [
            'settlement:mosswell',
            'macro:area:lr-area-mosswell-fiordhead',
            'macro:route:mw-route-harbor-to-delta',
            'macro:water:fjord-sound-head'
        ],
        'west'
    )

    const metadata = buildAtlasAwarePendingMetadata(context)

    assert.equal(metadata.structuralArchetype, 'waterfront')
    assert.equal(metadata.waterSemantics, 'fjord-sound-head')
    assert.ok(metadata.barrierSemantics && metadata.barrierSemantics.length > 0)
})

test('buildAtlasAwarePendingMetadata: overland direction ("north") without water context produces overland archetype', () => {
    const context = resolveMacroGenerationContext(
        ['settlement:mosswell', 'macro:area:lr-area-mosswell-fiordhead', 'macro:route:mw-route-harbor-to-northgate'],
        'north'
    )

    const metadata = buildAtlasAwarePendingMetadata(context)

    assert.equal(metadata.structuralArchetype, 'overland')
    assert.equal(metadata.macroAreaRef, 'lr-area-mosswell-fiordhead')
    assert.ok(metadata.routeLineage && metadata.routeLineage.includes('mw-route-harbor-to-northgate'))
    assert.ok(metadata.terrainTrend && metadata.terrainTrend.length > 0)
})

test('buildAtlasAwarePendingMetadata: interior direction with waterContext still produces interior (direction precedence)', () => {
    const context = resolveMacroGenerationContext(
        ['settlement:mosswell', 'macro:area:lr-area-mosswell-fiordhead', 'macro:water:fjord-sound-head'],
        'in'
    )

    const metadata = buildAtlasAwarePendingMetadata(context)

    // Direction-based archetypes (interior/vertical) take precedence over water context
    assert.equal(metadata.structuralArchetype, 'interior')
})

test('planAtlasAwareFutureLocation: includes pendingExitContext with structured metadata when exits are available', () => {
    const plan = planAtlasAwareFutureLocation('open-plain', 'north', [
        'settlement:mosswell',
        'macro:area:lr-area-mosswell-fiordhead',
        'macro:route:mw-route-harbor-to-northgate',
        'macro:water:fjord-sound-head'
    ])

    // Plan must carry structured context alongside the legacy string reason
    assert.ok(plan.pendingExitContext, 'pendingExitContext should be populated')
    const directions = Object.keys(plan.pendingExitContext!)
    assert.ok(directions.length > 0, 'at least one pending direction must have structured context')

    // Each structured entry must have a valid archetype
    for (const [, meta] of Object.entries(plan.pendingExitContext!)) {
        assert.ok(
            ['overland', 'waterfront', 'interior', 'vertical', 'portal'].includes(meta.structuralArchetype),
            `unexpected archetype: ${meta.structuralArchetype}`
        )
    }
})

// ---------------------------------------------------------------------------
// resolveAreaTransitionEdge — destination readiness tests (#892 / #903)
// ---------------------------------------------------------------------------

test('resolveAreaTransitionEdge: returns "ready" destination for northward Mosswell Fiordhead transition', () => {
    const edge = resolveAreaTransitionEdge('lr-area-mosswell-fiordhead', 'north')

    assert.ok(edge, 'Expected a macro-transition edge for north from Mosswell Fiordhead')
    assert.equal(edge.transition.destinationReadiness, 'ready')
    assert.equal(edge.transition.destinationAreaRef, 'lr-corridor-northgate-valley')
    assert.equal(edge.traversal, 'open')
})

test('resolveAreaTransitionEdge: returns "blocked" destination for westward Mosswell Fiordhead transition', () => {
    const edge = resolveAreaTransitionEdge('lr-area-mosswell-fiordhead', 'west')

    assert.ok(edge, 'Expected a macro-transition edge for west from Mosswell Fiordhead')
    assert.equal(edge.transition.destinationReadiness, 'blocked')
    assert.equal(edge.transition.destinationAreaRef, 'lr-area-fiordmarch-west')
    assert.equal(edge.traversal, 'constrained')
    // Blocked transition should include barrier refs from the atlas edge
    assert.ok(edge.barrierRefs && edge.barrierRefs.length > 0, 'Blocked transition should carry barrier refs')
})

test('resolveAreaTransitionEdge: returns "partial" destination for eastward Mosswell Fiordhead transition', () => {
    const edge = resolveAreaTransitionEdge('lr-area-mosswell-fiordhead', 'east')

    assert.ok(edge, 'Expected a macro-transition edge for east from Mosswell Fiordhead')
    assert.equal(edge.transition.destinationReadiness, 'partial')
    assert.equal(edge.transition.destinationAreaRef, 'lr-area-eastfall-foothills')
})

test('resolveAreaTransitionEdge: returns undefined for direction with no authored transition', () => {
    // No transition edge exists for southeast from Mosswell Fiordhead
    const edge = resolveAreaTransitionEdge('lr-area-mosswell-fiordhead', 'southeast')

    assert.equal(edge, undefined, 'No macro-transition edge should exist for southeast')
})

test('resolveAreaTransitionEdge: returns undefined for undefined areaRef', () => {
    const edge = resolveAreaTransitionEdge(undefined, 'north')

    assert.equal(edge, undefined, 'Should return undefined when areaRef is absent')
})

test('resolveAreaTransitionEdge: ready vs blocked destinations are distinguishable in the same area', () => {
    // Mosswell Fiordhead has both ready (north) and blocked (west) transition edges
    const readyEdge = resolveAreaTransitionEdge('lr-area-mosswell-fiordhead', 'north')
    const blockedEdge = resolveAreaTransitionEdge('lr-area-mosswell-fiordhead', 'west')

    assert.ok(readyEdge, 'ready edge must be present')
    assert.ok(blockedEdge, 'blocked edge must be present')
    assert.equal(readyEdge.transition.destinationReadiness, 'ready')
    assert.equal(blockedEdge.transition.destinationReadiness, 'blocked')
    // Runtime can distinguish and branch on readiness without parsing threshold strings
    assert.notEqual(readyEdge.transition.destinationReadiness, blockedEdge.transition.destinationReadiness)
})

// ---------------------------------------------------------------------------
// planAtlasAwareFutureLocation — interior and vertical cases (#ISSUE)
// ---------------------------------------------------------------------------

test('planAtlasAwareFutureLocation: cottage/tavern-style interior stub (in) has archetype-aware name and tag', () => {
    // Source: a sparse-tagged exterior location with a doorway leading inside.
    // Simulates the common cottage/tavern pattern where only settlement context is present.
    const plan = planAtlasAwareFutureLocation('open-plain', 'in', ['settlement:mosswell'])

    assert.equal(plan.name, 'Unexplored Interior', 'in-direction stub must be named Unexplored Interior')
    assert.ok(plan.tags.includes('interior:generated'), 'in-direction stub must carry interior:generated tag')
    assert.ok(!plan.description.includes('lies in,'), 'description must not use overland "lies {direction}" framing')
    assert.ok(plan.description.includes('threshold'), 'description must mention threshold for interior context')
    // Structural archetype in macroContext must reflect interior expansion direction
    assert.equal(plan.macroContext.expansionDirection, 'in')
})

test('planAtlasAwareFutureLocation: cottage/tavern-style interior stub (in) with macro area tags carries area ref in pendingExitContext', () => {
    // When source has a macro area ref, the generated interior stub inherits it
    // so downstream narration can honour the settlement context even for interior spaces.
    const plan = planAtlasAwareFutureLocation('open-plain', 'in', ['settlement:mosswell', 'macro:area:lr-area-mosswell-fiordhead'])

    assert.equal(plan.name, 'Unexplored Interior')
    assert.ok(plan.tags.includes('interior:generated'))
    // Pending exit context for any outward directions must still use the inherited area ref
    if (plan.pendingExitContext) {
        for (const meta of Object.values(plan.pendingExitContext)) {
            assert.equal(meta.macroAreaRef, 'lr-area-mosswell-fiordhead', 'pendingExitContext must carry inherited area ref')
        }
    }
})

test('planAtlasAwareFutureLocation: out-direction stub has Exterior Approach name and interior:generated tag', () => {
    const plan = planAtlasAwareFutureLocation('open-plain', 'out', ['settlement:mosswell'])

    assert.equal(plan.name, 'Unexplored Exterior Approach', 'out-direction stub must be named Unexplored Exterior Approach')
    assert.ok(plan.tags.includes('interior:generated'), 'out-direction stub must carry interior:generated tag')
    assert.ok(!plan.description.includes('lies out,'), 'description must not use overland "lies {direction}" framing')
})

test('planAtlasAwareFutureLocation: vertical stub (up) has Upper Level name and vertical:generated tag', () => {
    // Source: a ground-floor location with stairs visible (sparse tags)
    const plan = planAtlasAwareFutureLocation('open-plain', 'up', [])

    assert.equal(plan.name, 'Unexplored Upper Level', 'up-direction stub must be named Unexplored Upper Level')
    assert.ok(plan.tags.includes('vertical:generated'), 'up-direction stub must carry vertical:generated tag')
    assert.ok(!plan.description.includes('lies up,'), 'description must not use overland "lies {direction}" framing')
    assert.ok(plan.description.includes('above'), 'description must reference elevation for vertical context')
    assert.ok(plan.description.includes('ascends') || plan.description.includes('passage'), 'description must describe ascent')
})

test('planAtlasAwareFutureLocation: vertical stub (down) has Lower Level name and vertical:generated tag', () => {
    // Source: a hilltop or tower with a hatch leading down (sparse tags)
    const plan = planAtlasAwareFutureLocation('hilltop', 'down', [])

    assert.equal(plan.name, 'Unexplored Lower Level', 'down-direction stub must be named Unexplored Lower Level')
    assert.ok(plan.tags.includes('vertical:generated'), 'down-direction stub must carry vertical:generated tag')
    assert.ok(!plan.description.includes('lies down,'), 'description must not use overland "lies {direction}" framing')
    assert.ok(plan.description.includes('below'), 'description must reference elevation for vertical context')
    assert.ok(plan.description.includes('descends') || plan.description.includes('passage'), 'description must describe descent')
})

test('planAtlasAwareFutureLocation: interior and vertical stubs do NOT carry interior/vertical tags when expanding overland', () => {
    // Guard: overland expansions must not accidentally gain structural archetype tags
    const northPlan = planAtlasAwareFutureLocation('open-plain', 'north', ['settlement:mosswell'])
    const westPlan = planAtlasAwareFutureLocation('open-plain', 'west', ['settlement:mosswell'])

    assert.ok(!northPlan.tags.includes('interior:generated'), 'overland stub must not carry interior:generated')
    assert.ok(!northPlan.tags.includes('vertical:generated'), 'overland stub must not carry vertical:generated')
    assert.ok(!westPlan.tags.includes('interior:generated'), 'overland stub must not carry interior:generated')
    assert.ok(!westPlan.tags.includes('vertical:generated'), 'overland stub must not carry vertical:generated')
})

test('planAtlasAwareFutureLocation: existing overland behavior unchanged (north from Mosswell)', () => {
    // Guard: verify existing overland expansion still produces the same contract as before.
    // Note: north from lr-area-mosswell-fiordhead has a ready macro-transition, so this also
    // verifies that route-continuity naming is preserved after the destination area tag is applied.
    const plan = planAtlasAwareFutureLocation('open-plain', 'north', [
        'settlement:mosswell',
        'macro:area:lr-area-mosswell-fiordhead',
        'macro:route:mw-route-harbor-to-northgate',
        'macro:water:fjord-sound-head'
    ])

    assert.ok(plan.name.includes('North Road'), 'Route-continuity name must still use preferred prefix for overland')
    assert.ok(plan.description.includes('north'), 'Overland description must still reference direction')
    assert.ok(!plan.tags.includes('interior:generated'), 'Overland stub must not carry interior:generated')
    assert.ok(!plan.tags.includes('vertical:generated'), 'Overland stub must not carry vertical:generated')
    assert.ok(plan.pendingExitContext, 'Overland plan must still carry pendingExitContext')
})

// ---------------------------------------------------------------------------
// planAtlasAwareFutureLocation — transition-aware boundary behavior (#904)
// ---------------------------------------------------------------------------

test('planAtlasAwareFutureLocation: ready transition (north from Mosswell Fiordhead) replaces area tag with destination area', () => {
    // North from lr-area-mosswell-fiordhead has a ready macro-transition to lr-corridor-northgate-valley.
    // The generated stub must carry the destination area ref, not the source area ref.
    const plan = planAtlasAwareFutureLocation('open-plain', 'north', [
        'settlement:mosswell',
        'macro:area:lr-area-mosswell-fiordhead',
        'macro:route:mw-route-harbor-to-northgate',
        'macro:water:fjord-sound-head'
    ])

    assert.ok(
        plan.tags.includes('macro:area:lr-corridor-northgate-valley'),
        'Ready transition stub must carry destination area tag'
    )
    assert.ok(
        !plan.tags.includes('macro:area:lr-area-mosswell-fiordhead'),
        'Source area tag must be replaced for ready transition'
    )
    // Route lineage must be preserved (ready transition, no routeHandoff for north)
    assert.ok(plan.tags.includes('macro:route:mw-route-harbor-to-northgate'), 'Route lineage must be preserved')
    // Pending exits must still be present (node is traversable, not a dead end)
    assert.ok(plan.pendingExitContext, 'Ready transition stub must still carry pendingExitContext')
})

test('planAtlasAwareFutureLocation: partial transition (east from Mosswell Fiordhead) replaces area tag with destination area', () => {
    // East from lr-area-mosswell-fiordhead has a partial macro-transition to lr-area-eastfall-foothills.
    // Partial destinations are treated like ready for tag propagation — runtime may enter but degrades gracefully.
    const plan = planAtlasAwareFutureLocation('open-plain', 'east', [
        'settlement:mosswell',
        'macro:area:lr-area-mosswell-fiordhead',
        'macro:water:fjord-sound-head'
    ])

    assert.ok(
        plan.tags.includes('macro:area:lr-area-eastfall-foothills'),
        'Partial transition stub must carry destination area tag'
    )
    assert.ok(
        !plan.tags.includes('macro:area:lr-area-mosswell-fiordhead'),
        'Source area tag must be replaced for partial transition'
    )
    assert.ok(plan.pendingExitContext, 'Partial transition stub must carry pendingExitContext')
})

test('planAtlasAwareFutureLocation: ready transition with routeHandoff (northeast from Mosswell Fiordhead) adds handoff route tag', () => {
    // Northeast from lr-area-mosswell-fiordhead has a ready transition with requiresRouteHandoff=true
    // and handoffRouteRef='mw-route-harbor-to-northgate'. The stub must gain that route tag.
    const plan = planAtlasAwareFutureLocation('open-plain', 'northeast', [
        'settlement:mosswell',
        'macro:area:lr-area-mosswell-fiordhead'
    ])

    assert.ok(
        plan.tags.includes('macro:area:lr-corridor-northgate-valley'),
        'Route-handoff ready transition stub must carry destination area tag'
    )
    assert.ok(
        plan.tags.includes('macro:route:mw-route-harbor-to-northgate'),
        'Route-handoff ready transition stub must carry the handoff route tag'
    )
})

test('planAtlasAwareFutureLocation: blocked transition (west from Mosswell Fiordhead) produces boundary name distinct from generic overland', () => {
    // West from lr-area-mosswell-fiordhead has a blocked macro-transition to lr-area-fiordmarch-west.
    // Runtime must not generate a generic "Unexplored Open Plain" or "North Road" style node.
    // The name must be coherent and reference the authoring boundary rather than regular continuation.
    const plan = planAtlasAwareFutureLocation('open-plain', 'west', [
        'settlement:mosswell',
        'macro:area:lr-area-mosswell-fiordhead',
        'macro:water:fjord-sound-head'
    ])

    // Name must NOT be a generic overland name
    assert.ok(!plan.name.includes('Unexplored Open Plain'), 'Blocked boundary stub must not use generic overland name')
    // Name should reference the boundary context (destination area or barrier)
    assert.ok(plan.name.length > 0, 'Blocked boundary stub must have a non-empty name')
    // Description must reference barriers or threshold context, not generic continuation
    assert.ok(
        plan.description.includes('barrier') ||
            plan.description.includes('constrain') ||
            plan.description.includes('barr') ||
            plan.description.includes('wall') ||
            plan.description.includes('fiord') ||
            plan.description.includes('Fiordmarch') ||
            plan.description.includes('boundary') ||
            plan.description.includes('edge'),
        `Blocked boundary description must reference boundary context, got: "${plan.description}"`
    )
    // Blocked boundary nodes must NOT have pending exits — prevents endless filler node spawning
    assert.equal(plan.pendingExitContext, undefined, 'Blocked transition stub must not carry pendingExitContext')
    assert.equal(
        plan.exitAvailability?.pending,
        undefined,
        'Blocked transition stub must not have pending exit availability'
    )
    // Source area tag must still be present (node is inside the source area, not the destination)
    assert.ok(plan.tags.includes('macro:area:lr-area-mosswell-fiordhead'), 'Blocked stub must retain source area tag')
    assert.ok(
        !plan.tags.includes('macro:area:lr-area-fiordmarch-west'),
        'Blocked stub must NOT carry blocked destination area tag'
    )
})

test('planAtlasAwareFutureLocation: direction with no transition edge leaves existing overland behavior unchanged', () => {
    // Southeast from lr-area-mosswell-fiordhead has no authored transition edge.
    // Should produce a regular overland stub with source area tags preserved.
    const plan = planAtlasAwareFutureLocation('open-plain', 'southeast', [
        'settlement:mosswell',
        'macro:area:lr-area-mosswell-fiordhead',
        'macro:water:fjord-sound-head'
    ])

    // Source area tag must be preserved (no transition to replace it)
    assert.ok(plan.tags.includes('macro:area:lr-area-mosswell-fiordhead'), 'No-transition stub must carry source area tag')
    // Regular pending exits must still be generated
    assert.ok(plan.pendingExitContext, 'No-transition stub must carry pendingExitContext for regular expansion')
})
