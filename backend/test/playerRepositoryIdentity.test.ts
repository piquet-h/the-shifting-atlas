import { __resetPlayerRepositoryForTests, getPlayerRepository } from '@atlas/shared'
import assert from 'node:assert'
import { test } from 'node:test'

test('player repository stable identity upsert semantics', async () => {
    __resetPlayerRepositoryForTests()
    const repo = await getPlayerRepository()
    const fixedId = '11111111-1111-4111-8111-111111111111'
    const first = await repo.getOrCreate(fixedId)
    assert.ok(first.created, 'expected first creation to report created=true')
    assert.strictEqual(first.record.id, fixedId, 'id should match supplied fixed id')
    // updatedUtc should be absent or equal to createdUtc on initial creation (implementation-dependent),
    // but MUST NOT change on idempotent subsequent getOrCreate without mutations.
    const initialUpdated = first.record.updatedUtc
    const second = await repo.getOrCreate(fixedId)
    assert.ok(!second.created, 'expected second call with same id to not create new record')
    assert.strictEqual(second.record.id, fixedId, 'second retrieval should preserve id')
    assert.strictEqual(second.record.updatedUtc, initialUpdated, 'updatedUtc should remain stable on idempotent retrieval')
})

test('linkExternalId updates guest flag and sets updatedUtc', async () => {
    __resetPlayerRepositoryForTests()
    const repo = await getPlayerRepository()
    const { record } = await repo.getOrCreate()
    const ext = 'external-sub-123'
    const result = await repo.linkExternalId(record.id, ext)
    assert.ok(result.updated, 'expected update to succeed')
    assert.ok(result.record, 'expected updated record returned')
    assert.strictEqual(result.record!.externalId, ext, 'externalId should be set')
    assert.strictEqual(result.record!.guest, false, 'guest should be false after linking external identity')
    assert.ok(result.record!.updatedUtc, 'updatedUtc should be populated after mutation')
})

test('linkExternalId detects conflict when externalId already linked to different player', async () => {
    __resetPlayerRepositoryForTests()
    const repo = await getPlayerRepository()
    const { record: player1 } = await repo.getOrCreate()
    const { record: player2 } = await repo.getOrCreate()
    const ext = 'external-shared-id'
    // Link first player successfully
    const first = await repo.linkExternalId(player1.id, ext)
    assert.ok(first.updated, 'first link should succeed')
    assert.strictEqual(first.record?.externalId, ext)
    // Attempt to link second player to same externalId should conflict
    const second = await repo.linkExternalId(player2.id, ext)
    assert.ok(!second.updated, 'second link should not update')
    assert.ok(second.conflict, 'should report conflict')
    assert.strictEqual(second.existingPlayerId, player1.id, 'should report existing player id')
})

test('linkExternalId idempotent re-link does not update updatedUtc', async () => {
    __resetPlayerRepositoryForTests()
    const repo = await getPlayerRepository()
    const { record } = await repo.getOrCreate()
    const ext = 'external-idempotent-test'
    // First link
    const first = await repo.linkExternalId(record.id, ext)
    assert.ok(first.updated, 'first link should succeed')
    const firstUpdated = first.record!.updatedUtc
    // Small delay to ensure timestamp would differ if updated
    await new Promise((resolve) => setTimeout(resolve, 10))
    // Re-link same player to same externalId
    const second = await repo.linkExternalId(record.id, ext)
    assert.ok(!second.updated, 'idempotent re-link should return updated=false')
    assert.ok(second.record, 'should still return record')
    assert.strictEqual(second.record!.externalId, ext, 'externalId should remain')
    assert.strictEqual(second.record!.updatedUtc, firstUpdated, 'updatedUtc should not change on idempotent re-link')
})
