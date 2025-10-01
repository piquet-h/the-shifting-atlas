import type { PlayerRecord } from '@atlas/shared'
import { __resetPlayerRepositoryForTests, getPlayerRepository, STARTER_LOCATION_ID } from '@atlas/shared'
import assert from 'node:assert'
import { test } from 'node:test'

test('player repository assigns starting location', async () => {
    __resetPlayerRepositoryForTests()
    const repo = getPlayerRepository()
    const { record, created } = await repo.getOrCreate()
    assert.ok(created, 'expected new record')
    const currentLocationId = (record as PlayerRecord).currentLocationId
    assert.ok(currentLocationId, 'currentLocationId should be set')
    assert.strictEqual(currentLocationId, STARTER_LOCATION_ID)
})
