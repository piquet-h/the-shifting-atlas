import { STARTER_LOCATION_ID } from '@piquet-h/shared'
import type { PlayerRecord } from '@piquet-h/shared/types/playerRepository'
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

describe('Player Repository', () => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    test('assigns starting location', async () => {
        const repo = await fixture.getPlayerRepository()
        const { record, created } = await repo.getOrCreate()
        assert.ok(created, 'expected new record')
        const currentLocationId = (record as PlayerRecord).currentLocationId
        assert.ok(currentLocationId, 'currentLocationId should be set')
        // Accept either STARTER_LOCATION_ID or process.env.START_LOCATION_ID
        const expectedLocationId = process.env.START_LOCATION_ID || STARTER_LOCATION_ID
        assert.strictEqual(currentLocationId, expectedLocationId)
    })
})
