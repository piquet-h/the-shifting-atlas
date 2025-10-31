/**
 * Tests for Dead-Letter Repository (Memory Implementation)
 */
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { MemoryDeadLetterRepository } from '../../src/repos/deadLetterRepository.memory.js'
import { createDeadLetterRecord } from '@piquet-h/shared/deadLetter'

describe('Dead-Letter Repository', () => {
    let repo: MemoryDeadLetterRepository

    beforeEach(() => {
        repo = new MemoryDeadLetterRepository()
    })

    afterEach(() => {
        repo.clear()
    })

    describe('store', () => {
        test('should store dead-letter record', async () => {
            const record = createDeadLetterRecord(
                { eventId: 'test-1', type: 'Player.Move' },
                {
                    category: 'schema-validation',
                    message: 'Invalid event'
                }
            )

            await repo.store(record)

            const retrieved = await repo.getById(record.id)
            assert.ok(retrieved)
            assert.strictEqual(retrieved.id, record.id)
            assert.strictEqual(retrieved.error.category, 'schema-validation')
        })

        test('should be idempotent (upsert)', async () => {
            const record1 = createDeadLetterRecord(
                { eventId: 'test-1' },
                {
                    category: 'schema-validation',
                    message: 'First error'
                }
            )

            const record2 = {
                ...record1,
                error: {
                    category: 'schema-validation',
                    message: 'Updated error'
                }
            }

            await repo.store(record1)
            await repo.store(record2)

            const all = repo.getAll()
            assert.strictEqual(all.length, 1)
            assert.strictEqual(all[0].error.message, 'Updated error')
        })
    })

    describe('queryByTimeRange', () => {
        test('should query records within time range', async () => {
            const baseTime = new Date('2025-10-31T12:00:00Z')

            // Create records with different timestamps
            const record1 = createDeadLetterRecord({ eventId: 'test-1' }, { category: 'test', message: 'Error 1' })
            record1.deadLetteredUtc = new Date(baseTime.getTime()).toISOString()

            const record2 = createDeadLetterRecord({ eventId: 'test-2' }, { category: 'test', message: 'Error 2' })
            record2.deadLetteredUtc = new Date(baseTime.getTime() + 3600000).toISOString() // +1 hour

            const record3 = createDeadLetterRecord({ eventId: 'test-3' }, { category: 'test', message: 'Error 3' })
            record3.deadLetteredUtc = new Date(baseTime.getTime() + 7200000).toISOString() // +2 hours

            await repo.store(record1)
            await repo.store(record2)
            await repo.store(record3)

            // Query middle hour
            const results = await repo.queryByTimeRange(
                new Date(baseTime.getTime() + 1800000).toISOString(), // +30 min
                new Date(baseTime.getTime() + 5400000).toISOString() // +1.5 hours
            )

            assert.strictEqual(results.length, 1)
            assert.strictEqual(results[0].id, record2.id)
        })

        test('should respect maxResults parameter', async () => {
            const baseTime = new Date('2025-10-31T12:00:00Z')

            // Create multiple records
            for (let i = 0; i < 10; i++) {
                const record = createDeadLetterRecord({ eventId: `test-${i}` }, { category: 'test', message: `Error ${i}` })
                record.deadLetteredUtc = new Date(baseTime.getTime() + i * 1000).toISOString()
                await repo.store(record)
            }

            const results = await repo.queryByTimeRange(baseTime.toISOString(), new Date(baseTime.getTime() + 20000).toISOString(), 5)

            assert.strictEqual(results.length, 5)
        })

        test('should return empty array when no records match', async () => {
            const record = createDeadLetterRecord({ eventId: 'test-1' }, { category: 'test', message: 'Error' })
            record.deadLetteredUtc = '2025-10-31T12:00:00Z'

            await repo.store(record)

            // Query different time range
            const results = await repo.queryByTimeRange('2025-11-01T00:00:00Z', '2025-11-01T23:59:59Z')

            assert.strictEqual(results.length, 0)
        })

        test('should sort results by timestamp descending', async () => {
            const baseTime = new Date('2025-10-31T12:00:00Z')

            const record1 = createDeadLetterRecord({ eventId: 'test-1' }, { category: 'test', message: 'Error 1' })
            record1.deadLetteredUtc = new Date(baseTime.getTime()).toISOString()

            const record2 = createDeadLetterRecord({ eventId: 'test-2' }, { category: 'test', message: 'Error 2' })
            record2.deadLetteredUtc = new Date(baseTime.getTime() + 1000).toISOString()

            const record3 = createDeadLetterRecord({ eventId: 'test-3' }, { category: 'test', message: 'Error 3' })
            record3.deadLetteredUtc = new Date(baseTime.getTime() + 2000).toISOString()

            await repo.store(record1)
            await repo.store(record2)
            await repo.store(record3)

            const results = await repo.queryByTimeRange(baseTime.toISOString(), new Date(baseTime.getTime() + 3000).toISOString())

            assert.strictEqual(results.length, 3)
            // Most recent first
            assert.strictEqual(results[0].id, record3.id)
            assert.strictEqual(results[1].id, record2.id)
            assert.strictEqual(results[2].id, record1.id)
        })
    })

    describe('getById', () => {
        test('should retrieve record by ID', async () => {
            const record = createDeadLetterRecord({ eventId: 'test-1' }, { category: 'test', message: 'Error' })

            await repo.store(record)

            const retrieved = await repo.getById(record.id)
            assert.ok(retrieved)
            assert.strictEqual(retrieved.id, record.id)
            assert.strictEqual(retrieved.error.message, 'Error')
        })

        test('should return null for non-existent ID', async () => {
            const retrieved = await repo.getById('non-existent-id')
            assert.strictEqual(retrieved, null)
        })
    })
})
