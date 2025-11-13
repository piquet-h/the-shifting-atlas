/**
 * Integration tests for durable processed event registry
 *
 * Tests that the Cosmos SQL-backed registry persists idempotency keys
 * across processor restarts, ensuring ≥99.9% duplicate suppression.
 */
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { v4 as uuidv4 } from 'uuid'
import { loadPersistenceConfigAsync, resolvePersistenceMode } from '../../src/persistenceConfig.js'
import { CosmosProcessedEventRepository } from '../../src/repos/processedEventRepository.cosmos.js'
import { MemoryProcessedEventRepository } from '../../src/repos/processedEventRepository.memory.js'
import type { IProcessedEventRepository, ProcessedEventRecord } from '../../src/repos/processedEventRepository.js'

describe('Processed Event Repository Integration', () => {
    let repo: IProcessedEventRepository
    let mode: string

    beforeEach(async () => {
        mode = resolvePersistenceMode()
        if (mode === 'cosmos') {
            const config = await loadPersistenceConfigAsync()
            if (config.cosmosSql) {
                repo = new CosmosProcessedEventRepository(
                    config.cosmosSql.endpoint,
                    config.cosmosSql.database,
                    config.cosmosSql.containers.processedEvents
                )
            } else {
                // Fallback to memory if Cosmos not available
                repo = new MemoryProcessedEventRepository(604800) // 7 days
                mode = 'memory'
            }
        } else {
            repo = new MemoryProcessedEventRepository(604800) // 7 days
        }
    })

    afterEach(async () => {
        // Cleanup: for memory mode, clear the store
        if (mode === 'memory' && repo instanceof MemoryProcessedEventRepository) {
            repo.clear()
        }
    })

    describe('markProcessed and checkProcessed', () => {
        test('should mark event as processed and detect duplicates', async () => {
            const idempotencyKey = `test-idem-${uuidv4()}`
            const record: ProcessedEventRecord = {
                id: uuidv4(),
                idempotencyKey,
                eventId: uuidv4(),
                eventType: 'Player.Move',
                correlationId: uuidv4(),
                processedUtc: new Date().toISOString(),
                actorKind: 'player',
                actorId: uuidv4(),
                version: 1
            }

            // Mark as processed
            const stored = await repo.markProcessed(record)
            assert.ok(stored, 'Should return stored record')
            assert.strictEqual(stored.idempotencyKey, idempotencyKey)

            // Check for duplicate
            const existing = await repo.checkProcessed(idempotencyKey)
            assert.ok(existing, 'Should find existing processed event')
            assert.strictEqual(existing.idempotencyKey, idempotencyKey)
            assert.strictEqual(existing.eventId, record.eventId)
        })

        test('should return null for non-existent idempotency key', async () => {
            const idempotencyKey = `nonexistent-${uuidv4()}`
            const existing = await repo.checkProcessed(idempotencyKey)
            assert.strictEqual(existing, null, 'Should not find non-existent key')
        })

        test('should handle multiple different events', async () => {
            const records: ProcessedEventRecord[] = [
                {
                    id: uuidv4(),
                    idempotencyKey: `test-multi-1-${uuidv4()}`,
                    eventId: uuidv4(),
                    eventType: 'Player.Move',
                    correlationId: uuidv4(),
                    processedUtc: new Date().toISOString(),
                    actorKind: 'player',
                    version: 1
                },
                {
                    id: uuidv4(),
                    idempotencyKey: `test-multi-2-${uuidv4()}`,
                    eventId: uuidv4(),
                    eventType: 'Player.Look',
                    correlationId: uuidv4(),
                    processedUtc: new Date().toISOString(),
                    actorKind: 'player',
                    version: 1
                },
                {
                    id: uuidv4(),
                    idempotencyKey: `test-multi-3-${uuidv4()}`,
                    eventId: uuidv4(),
                    eventType: 'World.Exit.Create',
                    correlationId: uuidv4(),
                    processedUtc: new Date().toISOString(),
                    actorKind: 'system',
                    version: 1
                }
            ]

            // Mark all as processed
            for (const record of records) {
                await repo.markProcessed(record)
            }

            // Verify all can be found
            for (const record of records) {
                const existing = await repo.checkProcessed(record.idempotencyKey)
                assert.ok(existing, `Should find record for ${record.idempotencyKey}`)
                assert.strictEqual(existing.eventId, record.eventId)
            }
        })
    })

    describe('getById', () => {
        test('should retrieve processed event by ID', async () => {
            const record: ProcessedEventRecord = {
                id: uuidv4(),
                idempotencyKey: `test-getbyid-${uuidv4()}`,
                eventId: uuidv4(),
                eventType: 'Player.Move',
                correlationId: uuidv4(),
                processedUtc: new Date().toISOString(),
                actorKind: 'player',
                version: 1
            }

            await repo.markProcessed(record)

            const retrieved = await repo.getById(record.id, record.idempotencyKey)
            assert.ok(retrieved, 'Should retrieve record by ID')
            assert.strictEqual(retrieved.id, record.id)
            assert.strictEqual(retrieved.eventId, record.eventId)
        })

        test('should return null for non-existent ID', async () => {
            const retrieved = await repo.getById(uuidv4(), `nonexistent-${uuidv4()}`)
            assert.strictEqual(retrieved, null, 'Should return null for non-existent ID')
        })
    })

    describe('TTL behavior (memory mode only)', () => {
        test('should auto-expire events after TTL in memory mode', async function () {
            if (mode !== 'memory') {
                this.skip()
                return
            }

            const shortTtlRepo = new MemoryProcessedEventRepository(1) // 1 second TTL
            const idempotencyKey = `test-ttl-${uuidv4()}`
            const record: ProcessedEventRecord = {
                id: uuidv4(),
                idempotencyKey,
                eventId: uuidv4(),
                eventType: 'Player.Move',
                correlationId: uuidv4(),
                processedUtc: new Date().toISOString(),
                actorKind: 'player',
                version: 1
            }

            await shortTtlRepo.markProcessed(record)

            // Immediately should find it
            const existing1 = await shortTtlRepo.checkProcessed(idempotencyKey)
            assert.ok(existing1, 'Should find event immediately after marking')

            // Wait for TTL to expire (1 second + buffer)
            await new Promise((resolve) => setTimeout(resolve, 1500))

            // Should not find it after TTL
            const existing2 = await shortTtlRepo.checkProcessed(idempotencyKey)
            assert.strictEqual(existing2, null, 'Should not find event after TTL expiration')
        })
    })

    describe('Cosmos persistence (cosmos mode only)', () => {
        test('should persist across simulated processor restarts', async function () {
            if (mode !== 'cosmos') {
                this.skip()
                return
            }

            const idempotencyKey = `test-restart-${uuidv4()}`
            const record: ProcessedEventRecord = {
                id: uuidv4(),
                idempotencyKey,
                eventId: uuidv4(),
                eventType: 'Player.Move',
                correlationId: uuidv4(),
                processedUtc: new Date().toISOString(),
                actorKind: 'player',
                version: 1
            }

            // Mark with first repo instance (simulating first processor instance)
            await repo.markProcessed(record)

            // Create new repo instance (simulating processor restart)
            const config = await loadPersistenceConfigAsync()
            const newRepo = new CosmosProcessedEventRepository(
                config.cosmosSql!.endpoint,
                config.cosmosSql!.database,
                config.cosmosSql!.containers.processedEvents
            )

            // Should still find the event with new instance
            const existing = await newRepo.checkProcessed(idempotencyKey)
            assert.ok(existing, 'Should find event after simulated restart')
            assert.strictEqual(existing.idempotencyKey, idempotencyKey)
            assert.strictEqual(existing.eventId, record.eventId)
        })
    })
})
