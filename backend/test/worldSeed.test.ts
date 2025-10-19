/* global process */
import assert from 'node:assert'
import { describe, test } from 'node:test'
import { __resetSeedWorldTestState, seedWorld } from '../src/seeding/seedWorld.js'

process.env.PERSISTENCE_MODE = 'memory'

describe('world seeding', () => {
    test('idempotent seedWorld', async () => {
        __resetSeedWorldTestState()
        const first = await seedWorld({ demoPlayerId: '11111111-1111-4111-8111-111111111111' })
        const second = await seedWorld({ demoPlayerId: '11111111-1111-4111-8111-111111111111' })
        assert.equal(second.locationVerticesCreated, 0)
        assert.equal(second.exitsCreated, 0)
        assert.equal(second.playerCreated, false)
        assert.ok(first.locationsProcessed >= 1)
    })
})
