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

    test('North Road is frontier-expandable beyond North Gate', async () => {
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

        // Verify North Gate has frontier-expandable metadata
        assert.ok(northGate.exitAvailability?.pending, 'North Gate should have pending exit availability')
        assert.ok(northGate.exitAvailability.pending.north, 'North Gate should have pending north direction for frontier expansion')

        // Verify frontier stub locations exist and are properly marked
        const stub1 = await locationRepository.get('frontier-north-road-01')
        const stub2 = await locationRepository.get('frontier-north-road-02')
        const stub3 = await locationRepository.get('frontier-north-road-03')

        assert.ok(stub1, 'First frontier stub should exist')
        assert.ok(stub2, 'Second frontier stub should exist')
        assert.ok(stub3, 'Third frontier stub should exist')

        // Verify stubs are marked with frontier tag
        assert.ok(stub1.tags?.includes('frontier:stub'), 'First stub should have frontier:stub tag')
        assert.ok(stub2.tags?.includes('frontier:stub'), 'Second stub should have frontier:stub tag')
        assert.ok(stub3.tags?.includes('frontier:stub'), 'Third stub should have frontier:stub tag')

        // Verify stubs have terrain type (required for spatial generation)
        assert.equal(stub1.terrain, 'open-plain', 'First stub should have terrain type')
        assert.equal(stub2.terrain, 'open-plain', 'Second stub should have terrain type')
        assert.equal(stub3.terrain, 'open-plain', 'Third stub should have terrain type')

        // Verify stub chain connectivity (each points back and forward)
        assert.ok(
            stub1.exits?.some((e) => e.to === northGateId),
            'First stub should link back to North Gate'
        )
        assert.ok(
            stub1.exits?.some((e) => e.to === 'frontier-north-road-02'),
            'First stub should link to second stub'
        )
        assert.ok(
            stub2.exits?.some((e) => e.to === 'frontier-north-road-01'),
            'Second stub should link back to first stub'
        )
        assert.ok(
            stub2.exits?.some((e) => e.to === 'frontier-north-road-03'),
            'Second stub should link to third stub'
        )
        assert.ok(
            stub3.exits?.some((e) => e.to === 'frontier-north-road-02'),
            'Third stub should link back to second stub'
        )

        // Verify stubs have pending exits for further expansion
        assert.ok(stub3.exitAvailability?.pending, 'Final stub should have pending exits for further expansion')
        assert.ok(Object.keys(stub3.exitAvailability.pending).length > 0, 'Final stub should have at least one pending direction')
    })

    test('reseeding is idempotent and does not overwrite frontier stubs', async () => {
        const locationRepository = await fixture.getLocationRepository()

        // First seed
        const first = await seedWorld({
            locationRepository,
            blueprint: starterLocationsData as Location[],
            bulkMode: true
        })

        // Verify frontier stubs were created
        assert.ok(first.locationVerticesCreated > 0, 'First seed should create locations')

        // Modify a frontier stub to simulate player discovery/generation
        const stub1 = await locationRepository.get('frontier-north-road-01')
        assert.ok(stub1, 'Stub should exist before modification')

        const modifiedStub = {
            ...stub1,
            description: 'PLAYER DISCOVERED: A well-worn path through grasslands.',
            version: (stub1.version || 1) + 1
        }
        await locationRepository.upsert(modifiedStub)

        // Second seed (should be idempotent)
        const second = await seedWorld({
            locationRepository,
            blueprint: starterLocationsData as Location[],
            bulkMode: true
        })

        // Verify no new vertices were created (idempotency)
        assert.equal(second.locationVerticesCreated, 0, 'Second seed should create no new locations')

        // Verify the modified stub was NOT overwritten
        const stubAfterReseed = await locationRepository.get('frontier-north-road-01')
        assert.ok(stubAfterReseed, 'Stub should still exist after reseed')
        assert.equal(
            stubAfterReseed.description,
            'PLAYER DISCOVERED: A well-worn path through grasslands.',
            'Stub description should not be overwritten by reseeding'
        )
        assert.ok(stubAfterReseed.version && stubAfterReseed.version > 1, 'Stub version should reflect player modification')
    })
})
