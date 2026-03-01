import type { Location } from '@piquet-h/shared'
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import starterLocationsData from '../../src/data/villageLocations.json' with { type: 'json' }
import { seedWorld } from '../../src/seeding/seedWorld.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'
import { seedTestWorld } from '../helpers/seedTestWorld.js'

describe('World Seeding', () => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    test('idempotent seedWorld', async () => {
        const locationRepository = await fixture.getLocationRepository()

        const first = await seedTestWorld({
            locationRepository
        })
        const second = await seedTestWorld({
            locationRepository
        })
        assert.equal(second.locationVerticesCreated, 0)
        assert.equal(second.exitsCreated, 0)
        assert.ok(first.locationsProcessed >= 1)
    })

    test('North Road is frontier-expandable with pending exits at North Gate', async () => {
        const locationRepository = await fixture.getLocationRepository()

        // Seed the production world data
        await seedWorld({
            locationRepository,
            blueprint: starterLocationsData as Location[],
            bulkMode: true
        })

        // North Gate ID from villageLocations.json
        const northGateId = 'd0b2a7ea-9f4c-41d5-9b2d-7b4a0e6f1c3a'
        const northGate = await locationRepository.get(northGateId)

        assert.ok(northGate, 'North Gate location should exist')

        // Verify North Gate has pending exit availability (frontier-expandable)
        assert.ok(northGate.exitAvailability?.pending, 'North Gate should have pending exit availability')

        // Verify North Gate has multiple pending directions for unbounded expansion
        const pendingDirections = Object.keys(northGate.exitAvailability.pending)
        assert.ok(pendingDirections.length >= 3, 'North Gate should have at least 3 pending directions')
        assert.ok(pendingDirections.includes('north'), 'North Gate should have pending north direction')
        assert.ok(pendingDirections.includes('northeast'), 'North Gate should have pending northeast direction')
        assert.ok(pendingDirections.includes('northwest'), 'North Gate should have pending northwest direction')

        // Verify North Gate does NOT have hard exits to non-existent frontier stubs
        const hardExitDirections = (northGate.exits || []).map((e) => e.direction)
        assert.ok(!hardExitDirections.includes('north'), 'North Gate should NOT have hard north exit (should be pending only)')
        assert.ok(!hardExitDirections.includes('northeast'), 'North Gate should NOT have hard northeast exit (should be pending only)')
        assert.ok(!hardExitDirections.includes('northwest'), 'North Gate should NOT have hard northwest exit (should be pending only)')

        // Verify no pre-created frontier stub locations exist
        const allLocations = await locationRepository.listAll()
        const frontierStubs = allLocations.filter((loc) => loc.tags?.includes('frontier:stub'))
        assert.equal(frontierStubs.length, 0, 'No pre-created frontier stub locations should exist')

        // Verify North Road is not bounded at North Gate
        // (pending exits allow unbounded expansion via batch generation)
        assert.ok(northGate.exitAvailability.pending, 'North Gate should have pending exits to enable unbounded expansion')
    })

    test('reseeding preserves exitAvailability metadata', async () => {
        const locationRepository = await fixture.getLocationRepository()

        // First seed
        await seedWorld({
            locationRepository,
            blueprint: starterLocationsData as Location[],
            bulkMode: true
        })

        const northGateId = 'd0b2a7ea-9f4c-41d5-9b2d-7b4a0e6f1c3a'
        const northGateBefore = await locationRepository.get(northGateId)
        assert.ok(northGateBefore?.exitAvailability?.pending, 'North Gate should have pending exits before reseed')

        // Second seed (should be idempotent)
        await seedWorld({
            locationRepository,
            blueprint: starterLocationsData as Location[],
            bulkMode: true
        })

        // Verify exitAvailability is preserved
        const northGateAfter = await locationRepository.get(northGateId)
        assert.ok(northGateAfter?.exitAvailability?.pending, 'North Gate should still have pending exits after reseed')
        assert.deepEqual(
            Object.keys(northGateAfter.exitAvailability.pending).sort(),
            Object.keys(northGateBefore.exitAvailability.pending).sort(),
            'Pending directions should be identical after reseed'
        )
    })

    test('Mosswell seed has coherent gate/road/shrine directions', async () => {
        const locationRepository = await fixture.getLocationRepository()

        await seedWorld({
            locationRepository,
            blueprint: starterLocationsData as Location[],
            bulkMode: true
        })

        const northRoadId = 'f7c9b2ad-1e34-4c6f-8d5a-2b7e9c4f1a53'
        const northGateId = 'd0b2a7ea-9f4c-41d5-9b2d-7b4a0e6f1c3a'
        const shrineId = 'ac0f5ad1-5d5d-4b24-8e24-18e9cf52d4d7'

        const northRoad = await locationRepository.get(northRoadId)
        const northGate = await locationRepository.get(northGateId)
        const shrine = await locationRepository.get(shrineId)

        assert.ok(northRoad)
        assert.ok(northGate)
        assert.ok(shrine)

        // Road → Gate is north (already relied on by traversal UX)
        assert.ok(
            (northRoad.exits || []).some((e) => e.direction === 'north' && e.to === northGateId),
            'North Road should have hard north exit to North Gate'
        )
        assert.ok(
            (northGate.exits || []).some((e) => e.direction === 'south' && e.to === northRoadId),
            'North Gate should have hard south exit back to North Road'
        )

        // Road → Shrine is west, so Gate (north of road) → Shrine should be southwest
        assert.ok(
            (northRoad.exits || []).some((e) => e.direction === 'west' && e.to === shrineId),
            'North Road should have hard west exit to Stone Circle Shrine'
        )
        assert.ok(
            (shrine.exits || []).some((e) => e.direction === 'east' && e.to === northRoadId),
            'Stone Circle Shrine should have hard east exit back to North Road'
        )

        assert.ok(
            (northGate.exits || []).some((e) => e.direction === 'southwest' && e.to === shrineId),
            'North Gate should have hard southwest exit to Stone Circle Shrine'
        )
        assert.ok(
            (shrine.exits || []).some((e) => e.direction === 'northeast' && e.to === northGateId),
            'Stone Circle Shrine should have hard northeast exit back to North Gate'
        )
    })

    test('Lantern & Ladle seed splits outside vs common room, with guest rooms upstairs', async () => {
        const locationRepository = await fixture.getLocationRepository()

        await seedWorld({
            locationRepository,
            blueprint: starterLocationsData as Location[],
            bulkMode: true
        })

        const TAVERN_OUTSIDE_ID = '9c4b1f2e-5d6a-4e3b-8a7c-1d2f3e4a5b6c'
        const TAVERN_COMMON_ROOM_ID = 'c6fd8e59-3d3f-4eaf-9d0c-7ef3f4d2a8c1'
        const TAVERN_GUEST_ROOMS_ID = 'f62cb3bc-5521-4c63-9ef4-0cdf7e33a360'

        const outside = await locationRepository.get(TAVERN_OUTSIDE_ID)
        const commonRoom = await locationRepository.get(TAVERN_COMMON_ROOM_ID)
        const guestRooms = await locationRepository.get(TAVERN_GUEST_ROOMS_ID)

        assert.ok(outside, 'Tavern outside location should exist')
        assert.ok(commonRoom, 'Tavern common room location should exist')
        assert.ok(guestRooms, 'Tavern guest rooms location should exist')

        assert.ok(
            (outside.exits || []).some((e) => e.direction === 'in' && e.to === TAVERN_COMMON_ROOM_ID),
            'Tavern outside should have an in-exit to the common room'
        )

        assert.ok(!(outside.exits || []).some((e) => e.direction === 'up'), 'Tavern outside should not have an up-exit (stairs are inside)')

        assert.ok(
            (commonRoom.exits || []).some((e) => e.direction === 'out' && e.to === TAVERN_OUTSIDE_ID),
            'Tavern common room should have an out-exit back to outside'
        )

        assert.ok(
            (commonRoom.exits || []).some((e) => e.direction === 'up' && e.to === TAVERN_GUEST_ROOMS_ID),
            'Tavern common room should have an up-exit to guest rooms'
        )

        assert.ok(
            (guestRooms.exits || []).some((e) => e.direction === 'down' && e.to === TAVERN_COMMON_ROOM_ID),
            'Tavern guest rooms should lead down to the common room'
        )
    })

    test('seed has at least 6 frontier:boundary locations covering road, farm, and harbor expansion vectors', async () => {
        const locationRepository = await fixture.getLocationRepository()

        await seedWorld({
            locationRepository,
            blueprint: starterLocationsData as Location[],
            bulkMode: true
        })

        const allLocations = await locationRepository.listAll()
        const frontierLocations = allLocations.filter((loc) => loc.tags?.includes('frontier:boundary'))

        assert.ok(frontierLocations.length >= 6, 'At least 6 frontier:boundary locations should exist')

        const NORTH_GATE_ID = 'd0b2a7ea-9f4c-41d5-9b2d-7b4a0e6f1c3a'
        const RIVER_MOUTH_DUNES_ID = '2b3c4d5e-6f70-4821-9c8b-1a2b3c4d5e6f'
        const FIELD_EDGE_TRACK_ID = 'e82c9f17-ffc0-4b27-bcfe-5b8e3b2ea5f3'
        const SOUTH_FARMS_ID = 'ec88e970-9d2b-4a34-9804-6b2afd5adb9e'
        const HARBOR_WAREHOUSE_ID = '3c4d5e6f-7081-4932-8d7c-2b3c4d5e6f70'
        const FISH_MARKET_WHARF_ID = '4d5e6f70-8192-4a43-9e8d-3c4d5e6f7081'

        // North Gate: overland wilderness expansion
        const northGate = frontierLocations.find((l) => l.id === NORTH_GATE_ID)
        assert.ok(northGate, 'North Gate should be a frontier:boundary location')
        assert.ok(northGate.exitAvailability?.pending, 'North Gate should have pending exits')

        // River Mouth Dunes: coastal expansion (dunes boundary)
        const dunes = frontierLocations.find((l) => l.id === RIVER_MOUTH_DUNES_ID)
        assert.ok(dunes, 'River Mouth Dunes should be a frontier:boundary location')
        assert.ok(dunes.exitAvailability?.pending, 'River Mouth Dunes should have pending exits')
        const dunesPendingDirs = Object.keys(dunes.exitAvailability!.pending!)
        assert.ok(dunesPendingDirs.length >= 2, 'River Mouth Dunes should have at least 2 pending directions')
        // Forbidden south (open sea) — coastal hard boundary
        assert.ok(dunes.exitAvailability?.forbidden?.south, 'River Mouth Dunes should have forbidden south (open sea)')

        // Field Edge Track: plains expansion (farmland boundary)
        const fieldEdge = frontierLocations.find((l) => l.id === FIELD_EDGE_TRACK_ID)
        assert.ok(fieldEdge, 'Field Edge Track should be a frontier:boundary location')
        assert.ok(fieldEdge.exitAvailability?.pending, 'Field Edge Track should have pending exits')
        const fieldPendingDirs = Object.keys(fieldEdge.exitAvailability!.pending!)
        assert.ok(fieldPendingDirs.length >= 2, 'Field Edge Track should have at least 2 pending directions')

        // South Farms: southern overland expansion
        const southFarms = frontierLocations.find((l) => l.id === SOUTH_FARMS_ID)
        assert.ok(southFarms, 'South Farms should be a frontier:boundary location')
        assert.ok(southFarms.exitAvailability?.pending, 'South Farms should have pending exits')
        const southFarmsPendingDirs = Object.keys(southFarms.exitAvailability!.pending!)
        assert.ok(southFarmsPendingDirs.includes('south'), 'South Farms should include pending south expansion')

        // Harbor Warehouse: quay and trade-lane expansion
        const harborWarehouse = frontierLocations.find((l) => l.id === HARBOR_WAREHOUSE_ID)
        assert.ok(harborWarehouse, 'Harbor Warehouse should be a frontier:boundary location')
        assert.ok(harborWarehouse.exitAvailability?.pending, 'Harbor Warehouse should have pending exits')

        // Fish Market Wharf: coastal edge with explicit water boundary rules
        const fishWharf = frontierLocations.find((l) => l.id === FISH_MARKET_WHARF_ID)
        assert.ok(fishWharf, 'Fish Market Wharf should be a frontier:boundary location')
        assert.ok(fishWharf.exitAvailability?.pending, 'Fish Market Wharf should have pending exits')
        assert.ok(fishWharf.exitAvailability?.forbidden?.south, 'Fish Market Wharf should have forbidden south (open water)')
    })

    test('frontier locations carry no pre-created stub destinations', async () => {
        const locationRepository = await fixture.getLocationRepository()

        await seedWorld({
            locationRepository,
            blueprint: starterLocationsData as Location[],
            bulkMode: true
        })

        const allLocations = await locationRepository.listAll()
        const frontierLocations = allLocations.filter((loc) => loc.tags?.includes('frontier:boundary'))

        // For each frontier location, verify pending exits have no matching hard exit to a real location
        for (const frontier of frontierLocations) {
            const pendingDirs = Object.keys(frontier.exitAvailability?.pending ?? {})
            for (const dir of pendingDirs) {
                const hardExit = (frontier.exits || []).find((e) => e.direction === dir)
                assert.ok(!hardExit, `Frontier location "${frontier.name}" should not have hard exit in pending direction "${dir}"`)
            }
        }
    })
})
