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
})
