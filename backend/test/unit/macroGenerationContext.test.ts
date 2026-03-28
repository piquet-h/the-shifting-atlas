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
