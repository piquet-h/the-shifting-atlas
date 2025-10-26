import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { seedWorld } from '../../src/seeding/seedWorld.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

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
        const playerRepository = await fixture.getPlayerRepository()

        const first = await seedWorld({
            locationRepository,
            playerRepository,
            demoPlayerId: '11111111-1111-4111-8111-111111111111'
        })
        const second = await seedWorld({
            locationRepository,
            playerRepository,
            demoPlayerId: '11111111-1111-4111-8111-111111111111'
        })
        assert.equal(second.locationVerticesCreated, 0)
        assert.equal(second.exitsCreated, 0)
        assert.equal(second.playerCreated, false)
        assert.ok(first.locationsProcessed >= 1)
    })
})
