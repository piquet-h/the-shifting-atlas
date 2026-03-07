import assert from 'node:assert/strict'
import test from 'node:test'

import {
    resolveMacroGenerationContext,
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
