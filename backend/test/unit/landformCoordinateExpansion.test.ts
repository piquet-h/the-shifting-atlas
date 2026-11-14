import { distanceBetweenMapPositionsMeters, type MapPosition } from '@piquet-h/shared'
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { projectMapPosition, sampleLongReachLandform } from '../../src/services/longReachLandformSampler.js'
import { planAtlasAwareFutureLocation, resolveMacroGenerationContext } from '../../src/services/macroGenerationContext.js'

describe('Travel-scaled coordinate projection (projectMapPosition)', () => {
    const origin: MapPosition = { x: 0.19, y: 0.562 }

    test('scales ground step distance linearly with travelDurationMs and preserves equal diagonal distance', () => {
        const oneMinNorth = projectMapPosition(origin, 'north', 60_000)
        const fiveMinNorth = projectMapPosition(origin, 'north', 300_000)
        const fiveMinNortheast = projectMapPosition(origin, 'northeast', 300_000)

        const dist1m = distanceBetweenMapPositionsMeters(origin, oneMinNorth)
        const dist5m = distanceBetweenMapPositionsMeters(origin, fiveMinNorth)
        const distDiag = distanceBetweenMapPositionsMeters(origin, fiveMinNortheast)

        assert.ok(dist1m >= 55 && dist1m <= 75, `1-min walk (${dist1m.toFixed(1)}m) should be ~65m`)
        assert.ok(Math.abs(dist5m - dist1m * 5) < 1.5, '5-min walk should cover 5x the 1-min ground distance')
        assert.ok(Math.abs(distDiag - dist5m) < 1.5, 'Diagonal 5-min walk should match cardinal Euclidean distance')
        assert.ok(fiveMinNorth.y < origin.y, 'Northward travel decreases normalized y')
        assert.ok(fiveMinNortheast.x > origin.x && fiveMinNortheast.y < origin.y)
    })

    test('anchors horizontal coordinates for interior (in/out) and vertical (up/down) transitions and clamps [0, 1] bounds', () => {
        for (const dir of ['in', 'out', 'up', 'down'] as const) {
            assert.deepEqual(projectMapPosition(origin, dir, 120_000), origin)
        }

        const clampedWest = projectMapPosition({ x: 0.0001, y: 0.5 }, 'west', 3_600_000 * 10)
        const clampedSouth = projectMapPosition({ x: 0.5, y: 0.9999 }, 'south', 3_600_000 * 10)
        assert.equal(clampedWest.x, 0)
        assert.equal(clampedSouth.y, 1)
    })
})

describe('South Island & Milford Sound offline landform sampler (sampleLongReachLandform)', () => {
    test('resolves 1:50,000 Milford Fiordhead district grid distinguishing fiord water, valley floor, and steep walls', () => {
        const fiordWater = sampleLongReachLandform({ x: 0.1891, y: 0.5608 })
        const valleyFloor = sampleLongReachLandform({ x: 0.1903, y: 0.5623 })
        const steepFiordWall = sampleLongReachLandform({ x: 0.1855, y: 0.5635 })

        assert.equal(fiordWater.resolution, 'milford-topo50')
        assert.equal(fiordWater.isWater, true)
        assert.equal(fiordWater.band, 'fiord-water')

        assert.equal(valleyFloor.resolution, 'milford-topo50')
        assert.equal(valleyFloor.isWater, false)
        assert.ok(['valley-floor', 'coastal-lowland', 'foothill-bench'].includes(valleyFloor.band))

        assert.equal(steepFiordWall.resolution, 'milford-topo50')
        assert.equal(steepFiordWall.isWater, false)
        assert.ok(steepFiordWall.elevationMeters > valleyFloor.elevationMeters)
    })

    test('resolves 1:1,000,000 Long Reach grid distinguishing sea, alpine spine, inland basins, and eastern plains without Earth names', () => {
        const tasmanSea = sampleLongReachLandform({ x: 0.08, y: 0.4 })
        const alpineDivide = sampleLongReachLandform({ x: 0.49, y: 0.39 })
        const easternPlains = sampleLongReachLandform({ x: 0.67, y: 0.42 })

        assert.equal(tasmanSea.resolution, 'long-reach-1m')
        assert.equal(tasmanSea.isWater, true)
        assert.equal(tasmanSea.band, 'open-water')

        assert.equal(alpineDivide.isWater, false)
        assert.ok(alpineDivide.elevationMeters >= 1000, `Expected high alpine elevation, got ${alpineDivide.elevationMeters}m`)
        assert.ok(['alpine-ridge', 'steep-escarpment', 'upland-basin'].includes(alpineDivide.band))

        assert.equal(easternPlains.isWater, false)
        assert.ok(
            easternPlains.elevationMeters < alpineDivide.elevationMeters - 500,
            `Eastern plains (${easternPlains.elevationMeters}m) must sit far below alpine spine (${alpineDivide.elevationMeters}m)`
        )

        for (const cue of [tasmanSea, alpineDivide, easternPlains]) {
            assert.doesNotMatch(cue.promptSummary, /New Zealand|Milford|Canterbury|Otago|South Island|Christchurch/i)
        }
    })
})

describe('Frontier coordinate propagation and landform-guided constraints', () => {
    test('planAtlasAwareFutureLocation projects mapPosition, attaches geographicCue, and forbids overland steps into deep fiord water', () => {
        // River-mouth edge right beside Deepwater/Freshwater Basin where stepping northwest enters open fiord water
        const shoreOrigin: MapPosition = { x: 0.1897, y: 0.5618 }
        const planNorthEast = planAtlasAwareFutureLocation(
            'open-plain',
            'northeast',
            ['settlement:mosswell', 'macro:area:mw-area-north-valley-mouth', 'macro:area:lr-area-mosswell-fiordhead'],
            undefined,
            { originMapPosition: { x: 0.19, y: 0.56185 }, travelDurationMs: 300_000 }
        )

        assert.ok(planNorthEast.mapPosition, 'Expected projected mapPosition on generated plan')
        assert.ok(planNorthEast.macroContext.geographicCue, 'Expected sampled geographicCue on macroContext')
        assert.ok(planNorthEast.macroContext.geographicCue!.promptSummary.length > 10)

        // Stepping northwest from the shoreline toward [0.1891, 0.5608] where onward northwest is deep fiord water:
        const waterEdgePlan = planAtlasAwareFutureLocation(
            'riverbank',
            'northwest',
            ['settlement:mosswell', 'macro:area:mw-area-river-delta-edge', 'macro:water:fjord-sound-head'],
            undefined,
            { originMapPosition: shoreOrigin, travelDurationMs: 180_000 }
        )
        assert.ok(waterEdgePlan.mapPosition)
        assert.ok(
            waterEdgePlan.exitAvailability?.forbidden?.northwest,
            'Onward direction into deep fiord water must be marked forbidden for overland travel'
        )
        assert.equal(waterEdgePlan.exitAvailability?.forbidden?.northwest?.motif, 'water')
    })

    test('degrades cleanly when originMapPosition is omitted', () => {
        const plan = planAtlasAwareFutureLocation('open-plain', 'north', ['settlement:mosswell', 'macro:area:lr-area-mosswell-fiordhead'])
        assert.equal(plan.mapPosition, undefined)
        const ctx = resolveMacroGenerationContext(['macro:area:lr-area-mosswell-fiordhead'], 'north')
        assert.equal(ctx.geographicCue, undefined)
    })
})
