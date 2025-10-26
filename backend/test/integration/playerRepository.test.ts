import { STARTER_LOCATION_ID } from '@piquet-h/shared'
import type { PlayerRecord } from '@piquet-h/shared/types/playerRepository'
import assert from 'node:assert'
import { test } from 'node:test'
import { __resetPlayerRepositoryForTests, getPlayerRepository } from '../helpers/testContainer.js'

test('player repository assigns starting location', async () => {
    const repo = await getPlayerRepositoryForTest()
    const { record, created } = await repo.getOrCreate()
    assert.ok(created, 'expected new record')
    const currentLocationId = (record as PlayerRecord).currentLocationId
    assert.ok(currentLocationId, 'currentLocationId should be set')
    // Accept either STARTER_LOCATION_ID or process.env.START_LOCATION_ID
    const expectedLocationId = process.env.START_LOCATION_ID || STARTER_LOCATION_ID
    assert.strictEqual(currentLocationId, expectedLocationId)
})
