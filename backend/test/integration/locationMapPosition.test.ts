import type { HttpRequest, InvocationContext } from '@azure/functions'
import {
    LONG_REACH_HEIGHT_METERS,
    LONG_REACH_WIDTH_METERS,
    STARTER_LOCATION_ID,
    distanceBetweenMapPositionsMeters,
    type MapPosition
} from '@piquet-h/shared'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import starterLocationsData from '../../src/data/villageLocations.json' with { type: 'json' }
import { WorldGraphHandler } from '../../src/handlers/worldGraph.js'
import { describeForBothModes } from '../helpers/describeForBothModes.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'
import { TestMocks } from '../helpers/TestFixture.js'

const REPO_ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)))

describeForBothModes('Location mapPosition persistence and WorldGraph exposure', (mode) => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture(mode)
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    test('persists and hydrates mapPosition on locations while allowing unanchored locations to omit it', async () => {
        const repo = await fixture.getLocationRepository()
        const anchoredId = '99990000-0000-4000-8000-000000000101'
        const unanchoredId = '99990000-0000-4000-8000-000000000102'
        const pos: MapPosition = { x: 0.19012, y: 0.56194 }

        await repo.upsert({
            id: anchoredId,
            name: 'Anchored River Bend',
            description: 'Gravel bar beside the cold fiord river.',
            mapPosition: pos,
            exits: [],
            version: 1
        })
        await repo.upsert({
            id: unanchoredId,
            name: 'Unanchored Test Room',
            description: 'Legacy room without coordinates.',
            exits: [],
            version: 1
        })

        const storedAnchored = await repo.get(anchoredId)
        const storedUnanchored = await repo.get(unanchoredId)

        assert.deepEqual(storedAnchored?.mapPosition, pos)
        assert.strictEqual(storedUnanchored?.mapPosition, undefined)

        const container = await fixture.getContainer()
        const handler = container.get(WorldGraphHandler)
        const req = TestMocks.createHttpRequest({ method: 'GET', url: 'http://localhost/api/world/graph' }) as HttpRequest
        const ctx = TestMocks.createInvocationContext({ invocationId: 'test-wg-mapposition' }) as unknown as InvocationContext
        ;(ctx.extraInputs as unknown as Map<string, unknown>).set('container', container)

        const res = await handler.handle(req, ctx)
        assert.equal(res.status, 200)
        const payload = res.jsonBody as {
            success: boolean
            data?: { nodes: Array<{ id: string; mapPosition?: MapPosition }> }
        }
        const graphAnchored = payload.data?.nodes.find((n) => n.id === anchoredId)
        const graphUnanchored = payload.data?.nodes.find((n) => n.id === unanchoredId)

        assert.deepEqual(graphAnchored?.mapPosition, pos)
        assert.strictEqual(graphUnanchored?.mapPosition, undefined)
    })
})

describe('Mosswell seed hamlet footprint and 1:50k Milford Sound Topo50 calibration', () => {
    test('anchors all 35 Mosswell seed locations within a realistic ~300-550m hamlet footprint at Milford Sound river mouth', () => {
        const locations = starterLocationsData as Array<{
            id: string
            name: string
            tags?: string[]
            mapPosition?: MapPosition
        }>
        assert.equal(locations.length, 35)

        for (const loc of locations) {
            assert.ok(loc.mapPosition, `Location "${loc.name}" must define mapPosition`)
            assert.ok(loc.mapPosition.x >= 0 && loc.mapPosition.x <= 1)
            assert.ok(loc.mapPosition.y >= 0 && loc.mapPosition.y <= 1)
        }

        const jetty = locations.find((loc) => loc.id === STARTER_LOCATION_ID)!
        assert.ok(Math.abs(jetty.mapPosition!.x - 0.19) < 0.002, 'Jetty must sit at Milford Sound river mouth x~0.190')
        assert.ok(Math.abs(jetty.mapPosition!.y - 0.562) < 0.002, 'Jetty must sit at Milford Sound river mouth y~0.562')

        const xs = locations.map((loc) => loc.mapPosition!.x)
        const ys = locations.map((loc) => loc.mapPosition!.y)
        const widthMeters = (Math.max(...xs) - Math.min(...xs)) * LONG_REACH_WIDTH_METERS
        const heightMeters = (Math.max(...ys) - Math.min(...ys)) * LONG_REACH_HEIGHT_METERS

        assert.ok(widthMeters >= 150 && widthMeters <= 550, `Village east-west span ${widthMeters.toFixed(1)}m should be hamlet scale`)
        assert.ok(heightMeters >= 180 && heightMeters <= 550, `Village north-south span ${heightMeters.toFixed(1)}m should be hamlet scale`)

        // Tavern interior rooms must remain within 25m of The Lantern & Ladle exterior entrance
        const tavernOut = locations.find((loc) => loc.tags?.includes('structureArea:outside'))!
        const tavernCommon = locations.find((loc) => loc.tags?.includes('structureArea:common-room'))!
        const tavernRooms = locations.find((loc) => loc.tags?.includes('structureArea:guest-rooms'))!
        assert.ok(distanceBetweenMapPositionsMeters(tavernOut.mapPosition!, tavernCommon.mapPosition!) <= 25)
        assert.ok(distanceBetweenMapPositionsMeters(tavernOut.mapPosition!, tavernRooms.mapPosition!) <= 25)
    })

    test('includes calibrated CC-BY 4.0 LINZ 1:50,000 Milford Sound base map enclosing all Mosswell rooms', () => {
        const calibrationPath = resolve(REPO_ROOT, 'docs/architecture/mosswell-fiordhead-topo50.calibration.json')
        assert.ok(existsSync(calibrationPath), 'Expected 1:50k Topo50 calibration file')

        const calibration = JSON.parse(readFileSync(calibrationPath, 'utf8')) as {
            image: string
            scale: string
            license: string
            attribution: string
            pixelSize: { width: number; height: number }
            longReachBounds: { left: number; top: number; right: number; bottom: number }
            groundSpanMeters: { width: number; height: number }
        }

        const imagePath = resolve(REPO_ROOT, calibration.image)
        assert.ok(existsSync(imagePath), `Expected 1:50k Topo50 base image at ${calibration.image}`)
        assert.equal(calibration.scale, '1:50,000')
        assert.match(calibration.license, /CC BY 4\.0/i)
        assert.match(calibration.attribution, /LINZ|Land Information New Zealand/i)
        assert.ok(calibration.groundSpanMeters.width >= 6000 && calibration.groundSpanMeters.width <= 15000)

        const { left, top, right, bottom } = calibration.longReachBounds
        const locations = starterLocationsData as Array<{ name: string; mapPosition?: MapPosition }>
        for (const loc of locations) {
            assert.ok(
                loc.mapPosition!.x > left && loc.mapPosition!.x < right && loc.mapPosition!.y > top && loc.mapPosition!.y < bottom,
                `Mosswell location "${loc.name}" must lie inside 1:50k district map bounds`
            )
        }
    })
})
