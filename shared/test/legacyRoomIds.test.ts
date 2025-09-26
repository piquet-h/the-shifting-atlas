import {__resetRoomRepositoryForTests, getRoomRepository, SECOND_ROOM_ID, STARTER_ROOM_ID} from '@atlas/shared'
import assert from 'node:assert'
import {beforeEach, test} from 'node:test'

// Basic smoke tests to ensure legacy slug aliases still resolve after UUID migration.
// This protects against accidental removal before frontend/storage caches have expired.

beforeEach(() => {
    __resetRoomRepositoryForTests()
})

test('legacy: starter-room slug resolves to STARTER_ROOM_ID', async () => {
    const repo = getRoomRepository()
    const legacy = await repo.get('starter-room')
    assert.ok(legacy, 'expected legacy starter-room to resolve')
    assert.equal(legacy!.id, STARTER_ROOM_ID)
})

test('legacy: antechamber slug resolves to SECOND_ROOM_ID', async () => {
    const repo = getRoomRepository()
    const legacy = await repo.get('antechamber')
    assert.ok(legacy, 'expected legacy antechamber to resolve')
    assert.equal(legacy!.id, SECOND_ROOM_ID)
})
