/**
 * Unit tests for CosmosDbSqlRepository base class.
 * Uses mock implementation to avoid Azure dependencies.
 */

import assert from 'node:assert'
import { describe, test, beforeEach } from 'node:test'
import { MockSqlRepository } from '../mocks/mockSqlRepository.js'
import { NotFoundException, ConcurrencyException } from '@piquet-h/shared'

interface TestEntity {
    id: string
    name: string
    value: number
}

describe('CosmosDbSqlRepository Base Class', () => {
    let repo: MockSqlRepository<TestEntity>

    beforeEach(() => {
        repo = new MockSqlRepository<TestEntity>('testcontainer')
    })

    describe('getById', () => {
        test('should return entity when it exists', async () => {
            const entity: TestEntity = { id: 'test-1', name: 'Test Entity', value: 42 }
            await repo.create(entity, 'partition1')

            const result = await repo.getById('test-1', 'partition1')

            assert.ok(result)
            assert.strictEqual(result.id, 'test-1')
            assert.strictEqual(result.name, 'Test Entity')
            assert.strictEqual(result.value, 42)
        })

        test('should return null when entity does not exist', async () => {
            const result = await repo.getById('nonexistent', 'partition1')

            assert.strictEqual(result, null)
        })

        test('should emit telemetry for successful retrieval', async () => {
            const entity: TestEntity = { id: 'test-1', name: 'Test', value: 1 }
            await repo.create(entity, 'partition1')
            repo.telemetryEvents = [] // Clear creation events

            await repo.getById('test-1', 'partition1')

            const events = repo.telemetryEvents.filter((e) => e.event === 'SQL.Query.Executed')
            assert.strictEqual(events.length, 1)
            assert.strictEqual(events[0].data.operationName, 'testcontainer.GetById')
            assert.strictEqual(events[0].data.resultCount, 1)
        })

        test('should emit telemetry for not found', async () => {
            await repo.getById('nonexistent', 'partition1')

            const events = repo.telemetryEvents.filter((e) => e.event === 'SQL.Query.Executed')
            assert.strictEqual(events.length, 1)
            assert.strictEqual(events[0].data.resultCount, 0)
        })
    })

    describe('create', () => {
        test('should create new entity', async () => {
            const entity: TestEntity = { id: 'test-1', name: 'New Entity', value: 100 }

            const result = await repo.create(entity, 'partition1')

            assert.ok(result.resource)
            assert.strictEqual(result.resource.id, 'test-1')
            assert.ok(result.ruCharge > 0)
        })

        test('should fail when entity already exists', async () => {
            const entity: TestEntity = { id: 'test-1', name: 'Entity', value: 1 }
            await repo.create(entity, 'partition1')

            await assert.rejects(async () => {
                await repo.create(entity, 'partition1')
            }, ConcurrencyException)
        })

        test('should emit telemetry for successful creation', async () => {
            const entity: TestEntity = { id: 'test-1', name: 'Test', value: 1 }

            await repo.create(entity, 'partition1')

            const events = repo.telemetryEvents.filter((e) => e.event === 'SQL.Query.Executed')
            assert.strictEqual(events.length, 1)
            assert.strictEqual(events[0].data.operationName, 'testcontainer.Create')
        })

        test('should emit telemetry for conflict', async () => {
            const entity: TestEntity = { id: 'test-1', name: 'Test', value: 1 }
            await repo.create(entity, 'partition1')

            try {
                await repo.create(entity, 'partition1')
            } catch {
                // Expected
            }

            const events = repo.telemetryEvents.filter((e) => e.event === 'SQL.Query.Failed')
            assert.strictEqual(events.length, 1)
            assert.strictEqual(events[0].data.httpStatusCode, 409)
        })
    })

    describe('upsert', () => {
        test('should create entity when it does not exist', async () => {
            const entity: TestEntity = { id: 'test-1', name: 'New', value: 50 }

            const result = await repo.upsert(entity, 'partition1')

            assert.ok(result.resource)
            assert.strictEqual(result.resource.id, 'test-1')
        })

        test('should update entity when it exists', async () => {
            const entity: TestEntity = { id: 'test-1', name: 'Original', value: 10 }
            await repo.create(entity, 'partition1')

            const updated: TestEntity = { id: 'test-1', name: 'Updated', value: 20 }
            const result = await repo.upsert(updated, 'partition1')

            assert.strictEqual(result.resource.name, 'Updated')
            assert.strictEqual(result.resource.value, 20)
        })

        test('should emit telemetry', async () => {
            const entity: TestEntity = { id: 'test-1', name: 'Test', value: 1 }

            await repo.upsert(entity, 'partition1')

            const events = repo.telemetryEvents.filter((e) => e.event === 'SQL.Query.Executed')
            const upsertEvent = events.find((e) => e.data.operationName === 'testcontainer.Upsert')
            assert.ok(upsertEvent)
        })
    })

    describe('replace', () => {
        test('should update existing entity', async () => {
            const entity: TestEntity = { id: 'test-1', name: 'Original', value: 10 }
            await repo.create(entity, 'partition1')

            const updated: TestEntity = { id: 'test-1', name: 'Replaced', value: 30 }
            const result = await repo.replace('test-1', updated, 'partition1')

            assert.strictEqual(result.resource.name, 'Replaced')
            assert.strictEqual(result.resource.value, 30)
        })

        test('should fail when entity does not exist', async () => {
            const entity: TestEntity = { id: 'test-1', name: 'Entity', value: 1 }

            await assert.rejects(async () => {
                await repo.replace('test-1', entity, 'partition1')
            }, NotFoundException)
        })

        test('should emit telemetry for successful replacement', async () => {
            const entity: TestEntity = { id: 'test-1', name: 'Test', value: 1 }
            await repo.create(entity, 'partition1')
            repo.telemetryEvents = [] // Clear creation events

            await repo.replace('test-1', entity, 'partition1')

            const events = repo.telemetryEvents.filter((e) => e.event === 'SQL.Query.Executed')
            assert.strictEqual(events.length, 1)
            assert.strictEqual(events[0].data.operationName, 'testcontainer.Replace')
        })
    })

    describe('delete', () => {
        test('should delete existing entity', async () => {
            const entity: TestEntity = { id: 'test-1', name: 'Entity', value: 1 }
            await repo.create(entity, 'partition1')

            const deleted = await repo.delete('test-1', 'partition1')

            assert.strictEqual(deleted, true)

            const retrieved = await repo.getById('test-1', 'partition1')
            assert.strictEqual(retrieved, null)
        })

        test('should return false when entity does not exist', async () => {
            const deleted = await repo.delete('nonexistent', 'partition1')

            assert.strictEqual(deleted, false)
        })

        test('should emit telemetry', async () => {
            const entity: TestEntity = { id: 'test-1', name: 'Test', value: 1 }
            await repo.create(entity, 'partition1')
            repo.telemetryEvents = [] // Clear creation events

            await repo.delete('test-1', 'partition1')

            const events = repo.telemetryEvents.filter((e) => e.event === 'SQL.Query.Executed')
            const deleteEvent = events.find((e) => e.data.operationName === 'testcontainer.Delete')
            assert.ok(deleteEvent)
        })
    })

    describe('query', () => {
        test('should query entities by partition key', async () => {
            const entity1: TestEntity = { id: 'test-1', name: 'Entity 1', value: 10 }
            const entity2: TestEntity = { id: 'test-2', name: 'Entity 2', value: 20 }
            await repo.create(entity1, 'partition1')
            await repo.create(entity2, 'partition1')

            const result = await repo.query('SELECT * FROM c', [{ name: '@pk', value: 'partition1' }])

            assert.strictEqual(result.items.length, 2)
            assert.ok(result.ruCharge > 0)
        })

        test('should respect maxResults parameter', async () => {
            const entity1: TestEntity = { id: 'test-1', name: 'Entity 1', value: 10 }
            const entity2: TestEntity = { id: 'test-2', name: 'Entity 2', value: 20 }
            const entity3: TestEntity = { id: 'test-3', name: 'Entity 3', value: 30 }
            await repo.create(entity1, 'partition1')
            await repo.create(entity2, 'partition1')
            await repo.create(entity3, 'partition1')

            const result = await repo.query('SELECT * FROM c', [{ name: '@pk', value: 'partition1' }], 2)

            assert.strictEqual(result.items.length, 2)
        })

        test('should emit telemetry', async () => {
            const entity: TestEntity = { id: 'test-1', name: 'Test', value: 1 }
            await repo.create(entity, 'partition1')
            repo.telemetryEvents = [] // Clear creation events

            await repo.query('SELECT * FROM c', [{ name: '@pk', value: 'partition1' }])

            const events = repo.telemetryEvents.filter((e) => e.event === 'SQL.Query.Executed')
            const queryEvent = events.find((e) => e.data.operationName === 'testcontainer.Query')
            assert.ok(queryEvent)
            assert.ok((queryEvent!.data.ruCharge as number) > 0)
        })
    })

    describe('Edge Cases', () => {
        test('should handle empty query results', async () => {
            const result = await repo.query('SELECT * FROM c', [{ name: '@pk', value: 'empty-partition' }])

            assert.strictEqual(result.items.length, 0)
            assert.ok(result.ruCharge > 0) // Still charges for query
        })

        test('should isolate entities by partition key', async () => {
            const entity1: TestEntity = { id: 'test-1', name: 'Partition 1', value: 10 }
            const entity2: TestEntity = { id: 'test-1', name: 'Partition 2', value: 20 }
            await repo.create(entity1, 'partition1')
            await repo.create(entity2, 'partition2')

            const result1 = await repo.getById('test-1', 'partition1')
            const result2 = await repo.getById('test-1', 'partition2')

            assert.ok(result1)
            assert.ok(result2)
            assert.strictEqual(result1.name, 'Partition 1')
            assert.strictEqual(result2.name, 'Partition 2')
        })
    })
})
