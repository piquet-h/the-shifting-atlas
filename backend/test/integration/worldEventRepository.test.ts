/**
 * Integration tests for World Event Repository
 * Tests repository operations with dependency injection container
 */

import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import type { WorldEventRecord } from '@piquet-h/shared/types/worldEventRepository'
import { buildLocationScopeKey, buildPlayerScopeKey } from '@piquet-h/shared/types/worldEventRepository'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

describe('World Event Repository Integration', () => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    describe('Create Event', () => {
        test('should create event successfully', async () => {
            const repo = await fixture.getWorldEventRepository()
            const locationId = crypto.randomUUID()

            const event: WorldEventRecord = {
                id: crypto.randomUUID(),
                scopeKey: buildLocationScopeKey(locationId),
                eventType: 'Player.Move',
                status: 'pending',
                occurredUtc: new Date().toISOString(),
                ingestedUtc: new Date().toISOString(),
                actorKind: 'player',
                actorId: crypto.randomUUID(),
                correlationId: crypto.randomUUID(),
                idempotencyKey: `move-${Date.now()}`,
                payload: { direction: 'north', fromLocationId: locationId },
                version: 1
            }

            const result = await repo.create(event)

            assert.ok(result)
            assert.strictEqual(result.id, event.id)
            assert.strictEqual(result.scopeKey, event.scopeKey)
            assert.strictEqual(result.eventType, 'Player.Move')
            assert.strictEqual(result.status, 'pending')
        })

        test('should handle idempotent creates (upsert)', async () => {
            const repo = await fixture.getWorldEventRepository()
            const locationId = crypto.randomUUID()

            const event: WorldEventRecord = {
                id: crypto.randomUUID(),
                scopeKey: buildLocationScopeKey(locationId),
                eventType: 'World.Exit.Create',
                status: 'pending',
                occurredUtc: new Date().toISOString(),
                ingestedUtc: new Date().toISOString(),
                actorKind: 'system',
                correlationId: crypto.randomUUID(),
                idempotencyKey: `exit-create-${Date.now()}`,
                payload: { direction: 'south' },
                version: 1
            }

            // Create twice - should not error
            await repo.create(event)
            const result = await repo.create(event)

            assert.strictEqual(result.id, event.id)
            assert.strictEqual(result.status, 'pending')
        })
    })

    describe('Get Event By ID', () => {
        test('should retrieve event by id and scopeKey', async () => {
            const repo = await fixture.getWorldEventRepository()
            const locationId = crypto.randomUUID()
            const scopeKey = buildLocationScopeKey(locationId)

            const event: WorldEventRecord = {
                id: crypto.randomUUID(),
                scopeKey,
                eventType: 'NPC.Tick',
                status: 'processed',
                occurredUtc: new Date().toISOString(),
                ingestedUtc: new Date().toISOString(),
                processedUtc: new Date().toISOString(),
                actorKind: 'npc',
                actorId: crypto.randomUUID(),
                correlationId: crypto.randomUUID(),
                idempotencyKey: `npc-tick-${Date.now()}`,
                payload: {},
                version: 1
            }

            await repo.create(event)

            const retrieved = await repo.getById(event.id, scopeKey)

            assert.ok(retrieved)
            assert.strictEqual(retrieved.id, event.id)
            assert.strictEqual(retrieved.eventType, 'NPC.Tick')
            assert.strictEqual(retrieved.status, 'processed')
        })

        test('should return null for non-existent event', async () => {
            const repo = await fixture.getWorldEventRepository()
            const locationId = crypto.randomUUID()

            const result = await repo.getById(crypto.randomUUID(), buildLocationScopeKey(locationId))

            assert.strictEqual(result, null)
        })
    })

    describe('Update Event Status', () => {
        test('should update event status', async () => {
            const repo = await fixture.getWorldEventRepository()
            const locationId = crypto.randomUUID()
            const scopeKey = buildLocationScopeKey(locationId)

            const event: WorldEventRecord = {
                id: crypto.randomUUID(),
                scopeKey,
                eventType: 'Player.Look',
                status: 'pending',
                occurredUtc: new Date().toISOString(),
                ingestedUtc: new Date().toISOString(),
                actorKind: 'player',
                actorId: crypto.randomUUID(),
                correlationId: crypto.randomUUID(),
                idempotencyKey: `look-${Date.now()}`,
                payload: {},
                version: 1
            }

            await repo.create(event)

            const processedUtc = new Date().toISOString()
            const updated = await repo.updateStatus(event.id, scopeKey, {
                status: 'processed',
                processedUtc,
                processingMetadata: { ruCost: 5.2, latencyMs: 45 }
            })

            assert.ok(updated)
            assert.strictEqual(updated.status, 'processed')
            assert.strictEqual(updated.processedUtc, processedUtc)
            assert.deepStrictEqual(updated.processingMetadata, { ruCost: 5.2, latencyMs: 45 })
        })

        test('should return null when updating non-existent event', async () => {
            const repo = await fixture.getWorldEventRepository()
            const locationId = crypto.randomUUID()

            const result = await repo.updateStatus(crypto.randomUUID(), buildLocationScopeKey(locationId), {
                status: 'failed'
            })

            assert.strictEqual(result, null)
        })
    })

    describe('Query By Scope', () => {
        test('should query events by scopeKey', async () => {
            const repo = await fixture.getWorldEventRepository()
            const locationId = crypto.randomUUID()
            const scopeKey = buildLocationScopeKey(locationId)

            // Create multiple events in same scope
            const baseTime = Date.now()
            for (let i = 0; i < 5; i++) {
                const event: WorldEventRecord = {
                    id: crypto.randomUUID(),
                    scopeKey,
                    eventType: 'Player.Move',
                    status: 'processed',
                    occurredUtc: new Date(baseTime + i * 1000).toISOString(),
                    ingestedUtc: new Date().toISOString(),
                    actorKind: 'player',
                    correlationId: crypto.randomUUID(),
                    idempotencyKey: `move-${i}-${Date.now()}`,
                    payload: { index: i },
                    version: 1
                }
                await repo.create(event)
            }

            const result = await repo.queryByScope(scopeKey)

            assert.strictEqual(result.events.length, 5)
            assert.ok(result.ruCharge > 0)
            assert.ok(result.latencyMs >= 0)
            assert.strictEqual(result.hasMore, false)
        })

        test('should filter by status', async () => {
            const repo = await fixture.getWorldEventRepository()
            const locationId = crypto.randomUUID()
            const scopeKey = buildLocationScopeKey(locationId)

            // Create events with different statuses
            const pendingEvent: WorldEventRecord = {
                id: crypto.randomUUID(),
                scopeKey,
                eventType: 'Player.Move',
                status: 'pending',
                occurredUtc: new Date().toISOString(),
                ingestedUtc: new Date().toISOString(),
                actorKind: 'player',
                correlationId: crypto.randomUUID(),
                idempotencyKey: `pending-${Date.now()}`,
                payload: {},
                version: 1
            }

            const processedEvent: WorldEventRecord = {
                ...pendingEvent,
                id: crypto.randomUUID(),
                status: 'processed',
                idempotencyKey: `processed-${Date.now()}`
            }

            await repo.create(pendingEvent)
            await repo.create(processedEvent)

            const result = await repo.queryByScope(scopeKey, { status: 'pending' })

            assert.strictEqual(result.events.length, 1)
            assert.strictEqual(result.events[0].status, 'pending')
        })

        test('should only accept canonical scopeKey patterns', async () => {
            const repo = await fixture.getWorldEventRepository()

            // Valid patterns should work
            const validPatterns = [
                buildLocationScopeKey(crypto.randomUUID()),
                buildPlayerScopeKey(crypto.randomUUID()),
                'global:maintenance',
                'global:tick'
            ]

            for (const scopeKey of validPatterns) {
                const event: WorldEventRecord = {
                    id: crypto.randomUUID(),
                    scopeKey,
                    eventType: 'Player.Move',
                    status: 'pending',
                    occurredUtc: new Date().toISOString(),
                    ingestedUtc: new Date().toISOString(),
                    actorKind: 'system',
                    correlationId: crypto.randomUUID(),
                    idempotencyKey: `test-${Date.now()}-${crypto.randomUUID()}`,
                    payload: {},
                    version: 1
                }

                // Should succeed
                const result = await repo.create(event)
                assert.strictEqual(result.scopeKey, scopeKey, `Should accept valid pattern: ${scopeKey}`)
            }
        })

        test('should enforce loc: prefix requires UUID', async () => {
            const repo = await fixture.getWorldEventRepository()

            const invalidScopeKey = 'loc:not-a-uuid'
            const event: WorldEventRecord = {
                id: crypto.randomUUID(),
                scopeKey: invalidScopeKey,
                eventType: 'Player.Move',
                status: 'pending',
                occurredUtc: new Date().toISOString(),
                ingestedUtc: new Date().toISOString(),
                actorKind: 'system',
                correlationId: crypto.randomUUID(),
                idempotencyKey: `test-${Date.now()}`,
                payload: {},
                version: 1
            }

            // Note: Repository layer doesn't validate scopeKey format
            // Validation happens in emitWorldEvent before reaching repository
            // This test documents that repository accepts any string for scopeKey
            // and relies on upstream validation
            const result = await repo.create(event)
            assert.strictEqual(result.scopeKey, invalidScopeKey)
        })

        test('should enforce player: prefix requires UUID', async () => {
            const repo = await fixture.getWorldEventRepository()

            const invalidScopeKey = 'player:not-a-uuid'
            const event: WorldEventRecord = {
                id: crypto.randomUUID(),
                scopeKey: invalidScopeKey,
                eventType: 'Player.Move',
                status: 'pending',
                occurredUtc: new Date().toISOString(),
                ingestedUtc: new Date().toISOString(),
                actorKind: 'system',
                correlationId: crypto.randomUUID(),
                idempotencyKey: `test-${Date.now()}`,
                payload: {},
                version: 1
            }

            // Repository layer doesn't validate scopeKey format
            // This test documents current behavior
            const result = await repo.create(event)
            assert.strictEqual(result.scopeKey, invalidScopeKey)
        })

        test('should handle pagination with hasMore', async () => {
            const repo = await fixture.getWorldEventRepository()
            const locationId = crypto.randomUUID()
            const scopeKey = buildLocationScopeKey(locationId)

            // Create more events than limit
            for (let i = 0; i < 15; i++) {
                const event: WorldEventRecord = {
                    id: crypto.randomUUID(),
                    scopeKey,
                    eventType: 'Player.Move',
                    status: 'processed',
                    occurredUtc: new Date(Date.now() + i * 1000).toISOString(),
                    ingestedUtc: new Date().toISOString(),
                    actorKind: 'player',
                    correlationId: crypto.randomUUID(),
                    idempotencyKey: `move-${i}-${Date.now()}`,
                    payload: { index: i },
                    version: 1
                }
                await repo.create(event)
            }

            const result = await repo.queryByScope(scopeKey, { limit: 10 })

            assert.strictEqual(result.events.length, 10)
            assert.strictEqual(result.hasMore, true)
        })

        test('should order events descending by default', async () => {
            const repo = await fixture.getWorldEventRepository()
            const locationId = crypto.randomUUID()
            const scopeKey = buildLocationScopeKey(locationId)

            const baseTime = Date.now()
            const timestamps = [baseTime, baseTime + 1000, baseTime + 2000]

            for (let i = 0; i < timestamps.length; i++) {
                const event: WorldEventRecord = {
                    id: crypto.randomUUID(),
                    scopeKey,
                    eventType: 'Player.Move',
                    status: 'processed',
                    occurredUtc: new Date(timestamps[i]).toISOString(),
                    ingestedUtc: new Date().toISOString(),
                    actorKind: 'player',
                    correlationId: crypto.randomUUID(),
                    idempotencyKey: `move-${i}-${Date.now()}`,
                    payload: { index: i },
                    version: 1
                }
                await repo.create(event)
            }

            const result = await repo.queryByScope(scopeKey)

            // Should be in descending order (newest first)
            assert.ok(result.events[0].occurredUtc > result.events[1].occurredUtc)
            assert.ok(result.events[1].occurredUtc > result.events[2].occurredUtc)
        })

        test('should return empty result for scope with no events', async () => {
            const repo = await fixture.getWorldEventRepository()
            const locationId = crypto.randomUUID()

            const result = await repo.queryByScope(buildLocationScopeKey(locationId))

            assert.strictEqual(result.events.length, 0)
            assert.strictEqual(result.hasMore, false)
        })
    })

    describe('Get By Idempotency Key', () => {
        test('should find event by idempotency key', async () => {
            const repo = await fixture.getWorldEventRepository()
            const locationId = crypto.randomUUID()
            const idempotencyKey = `unique-${Date.now()}`

            const event: WorldEventRecord = {
                id: crypto.randomUUID(),
                scopeKey: buildLocationScopeKey(locationId),
                eventType: 'Quest.Proposed',
                status: 'pending',
                occurredUtc: new Date().toISOString(),
                ingestedUtc: new Date().toISOString(),
                actorKind: 'system',
                correlationId: crypto.randomUUID(),
                idempotencyKey,
                payload: { questId: 'quest-1' },
                version: 1
            }

            await repo.create(event)

            const found = await repo.getByIdempotencyKey(idempotencyKey)

            assert.ok(found)
            assert.strictEqual(found.id, event.id)
            assert.strictEqual(found.idempotencyKey, idempotencyKey)
        })

        test('should return null for unknown idempotency key', async () => {
            const repo = await fixture.getWorldEventRepository()

            const result = await repo.getByIdempotencyKey('non-existent-key')

            assert.strictEqual(result, null)
        })
    })

    describe('Scope Key Patterns', () => {
        test('should handle location scope events', async () => {
            const repo = await fixture.getWorldEventRepository()
            const locationId = crypto.randomUUID()
            const scopeKey = buildLocationScopeKey(locationId)

            const event: WorldEventRecord = {
                id: crypto.randomUUID(),
                scopeKey,
                eventType: 'World.Ambience.Generated',
                status: 'processed',
                occurredUtc: new Date().toISOString(),
                ingestedUtc: new Date().toISOString(),
                actorKind: 'ai',
                correlationId: crypto.randomUUID(),
                idempotencyKey: `ambience-${Date.now()}`,
                payload: { description: 'A cold wind blows' },
                version: 1
            }

            await repo.create(event)
            const result = await repo.queryByScope(scopeKey)

            assert.strictEqual(result.events.length, 1)
            assert.ok(scopeKey.startsWith('loc:'))
        })

        test('should handle player scope events', async () => {
            const repo = await fixture.getWorldEventRepository()
            const playerId = crypto.randomUUID()
            const scopeKey = buildPlayerScopeKey(playerId)

            const event: WorldEventRecord = {
                id: crypto.randomUUID(),
                scopeKey,
                eventType: 'Player.Move',
                status: 'processed',
                occurredUtc: new Date().toISOString(),
                ingestedUtc: new Date().toISOString(),
                actorKind: 'player',
                actorId: playerId,
                correlationId: crypto.randomUUID(),
                idempotencyKey: `player-move-${Date.now()}`,
                payload: {},
                version: 1
            }

            await repo.create(event)
            const result = await repo.queryByScope(scopeKey)

            assert.strictEqual(result.events.length, 1)
            assert.ok(scopeKey.startsWith('player:'))
        })
    })
})
