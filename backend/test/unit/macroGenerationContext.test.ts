import assert from 'node:assert/strict'
import test from 'node:test'

import {
    buildAtlasConstrainedExitAvailability,
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
