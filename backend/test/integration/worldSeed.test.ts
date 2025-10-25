import assert from 'node:assert'
import { describe, test } from 'node:test'
import { seedWorld } from '../../src/seeding/seedWorld.js'
import { getLocationRepositoryForTest, getPlayerRepositoryForTest } from '../helpers/testContainer.js'

describe('world seeding', () => {
    test('idempotent seedWorld', async () => {
        const first = await seedWorld({
            locationRepository: await getLocationRepositoryForTest(),
            playerRepository: await getPlayerRepositoryForTest(),
            demoPlayerId: '11111111-1111-4111-8111-111111111111'
        })
        const second = await seedWorld({
            locationRepository: await getLocationRepositoryForTest(),
            playerRepository: await getPlayerRepositoryForTest(),
            demoPlayerId: '11111111-1111-4111-8111-111111111111'
        })
        assert.equal(second.locationVerticesCreated, 0)
        assert.equal(second.exitsCreated, 0)
        assert.equal(second.playerCreated, false)
        assert.ok(first.locationsProcessed >= 1)
    })
})
