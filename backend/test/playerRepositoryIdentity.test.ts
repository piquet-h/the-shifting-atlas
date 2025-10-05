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
    const second = await repo.getOrCreate(fixedId)
    assert.ok(!second.created, 'expected second call with same id to not create new record')
    assert.strictEqual(second.record.id, fixedId, 'second retrieval should preserve id')
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
