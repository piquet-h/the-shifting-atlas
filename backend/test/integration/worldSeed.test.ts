import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'
import { seedTestWorld } from '../helpers/seedTestWorld.js'
import { seedWorld } from '../../src/seeding/seedWorld.js'
import starterLocationsData from '../../src/data/villageLocations.json' with { type: 'json' }
import type { Location } from '@piquet-h/shared'

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
})
