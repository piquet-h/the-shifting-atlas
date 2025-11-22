import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
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
})
