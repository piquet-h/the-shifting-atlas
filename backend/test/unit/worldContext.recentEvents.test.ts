import { randomUUID } from 'crypto'
import assert from 'node:assert'
import { beforeEach, describe, test } from 'node:test'
import type { WorldEventRecord } from '@piquet-h/shared/types/worldEventRepository'
import { buildLocationScopeKey, buildPlayerScopeKey } from '@piquet-h/shared/types/worldEventRepository'
import { getRecentEvents } from '../../src/handlers/mcp/world-context/world-context.js'
import { UnitTestFixture } from '../helpers/UnitTestFixture.js'

describe('WorldContext getRecentEvents (unit)', () => {
    let fixture: UnitTestFixture

    beforeEach(async () => {
        fixture = new UnitTestFixture()
        await fixture.setup()
    })

    test('returns event summaries for location scope with default limit (20)', async () => {
        const locationId = randomUUID()
        const now = new Date()

        const mockEvents: WorldEventRecord[] = [
            {
                id: randomUUID(),
                scopeKey: buildLocationScopeKey(locationId),
                eventType: 'Player.Move',
                status: 'processed',
                occurredUtc: now.toISOString(),
                ingestedUtc: now.toISOString(),
                actorKind: 'player',
                correlationId: randomUUID(),
                idempotencyKey: `move-${Date.now()}`,
                payload: { some: 'data' },
                version: 1
            }
        ]

        const eventRepo = await fixture.getWorldEventRepository()
        ;(eventRepo as any).queryByScope = async (scopeKey: string, options: any) => {
            assert.equal(scopeKey, buildLocationScopeKey(locationId))
            assert.equal(options.limit, 20, 'Should use default limit of 20')
            assert.equal(options.order, 'desc')
            return { events: mockEvents, ruCharge: 2.5, latencyMs: 45, hasMore: false }
        }

        const context = await fixture.createInvocationContext()
        const result = await getRecentEvents({ arguments: { scope: 'location', scopeId: locationId } }, context)
        const parsed = JSON.parse(result)

        assert.ok(Array.isArray(parsed), 'Should return array')
        assert.equal(parsed.length, 1)

        // Verify event summary shape (only specified fields)
        const summary = parsed[0]
        assert.equal(summary.id, mockEvents[0].id)
        assert.equal(summary.eventType, mockEvents[0].eventType)
        assert.equal(summary.occurredUtc, mockEvents[0].occurredUtc)
        assert.equal(summary.actorKind, mockEvents[0].actorKind)
        assert.equal(summary.status, mockEvents[0].status)

        // Verify no extra fields
        assert.strictEqual(summary.payload, undefined)
        assert.strictEqual(summary.correlationId, undefined)
        assert.strictEqual(summary.ingestedUtc, undefined)
    })

    test('returns event summaries for player scope', async () => {
        const playerId = randomUUID()

        const mockEvents: WorldEventRecord[] = [
            {
                id: randomUUID(),
                scopeKey: buildPlayerScopeKey(playerId),
                eventType: 'Player.Look',
                status: 'processed',
                occurredUtc: new Date().toISOString(),
                ingestedUtc: new Date().toISOString(),
                actorKind: 'player',
                actorId: playerId,
                correlationId: randomUUID(),
                idempotencyKey: `look-${Date.now()}`,
                payload: {},
                version: 1
            }
        ]

        const eventRepo = await fixture.getWorldEventRepository()
        ;(eventRepo as any).queryByScope = async (scopeKey: string, options: any) => {
            assert.equal(scopeKey, buildPlayerScopeKey(playerId))
            assert.equal(options.limit, 20)
            return { events: mockEvents, ruCharge: 1.2, latencyMs: 30, hasMore: false }
        }

        const context = await fixture.createInvocationContext()
        const result = await getRecentEvents({ arguments: { scope: 'player', scopeId: playerId } }, context)
        const parsed = JSON.parse(result)

        assert.ok(Array.isArray(parsed))
        assert.equal(parsed.length, 1)
        assert.equal(parsed[0].id, mockEvents[0].id)
    })

    test('respects custom limit parameter', async () => {
        const locationId = randomUUID()
        const customLimit = 10

        const eventRepo = await fixture.getWorldEventRepository()
        ;(eventRepo as any).queryByScope = async (scopeKey: string, options: any) => {
            assert.equal(options.limit, customLimit, 'Should use custom limit')
            return { events: [], ruCharge: 0.5, latencyMs: 10, hasMore: false }
        }

        const context = await fixture.createInvocationContext()
        await getRecentEvents({ arguments: { scope: 'location', scopeId: locationId, limit: customLimit } }, context)
    })

    test('clamps limit to maximum of 100', async () => {
        const locationId = randomUUID()
        const requestedLimit = 200

        const eventRepo = await fixture.getWorldEventRepository()
        ;(eventRepo as any).queryByScope = async (scopeKey: string, options: any) => {
            assert.equal(options.limit, 100, 'Should clamp to max 100')
            return { events: [], ruCharge: 0.5, latencyMs: 10, hasMore: false }
        }

        const context = await fixture.createInvocationContext()
        await getRecentEvents({ arguments: { scope: 'location', scopeId: locationId, limit: requestedLimit } }, context)
    })

    test('returns empty array when no events exist', async () => {
        const locationId = randomUUID()

        const eventRepo = await fixture.getWorldEventRepository()
        ;(eventRepo as any).queryByScope = async () => {
            return { events: [], ruCharge: 0.5, latencyMs: 10, hasMore: false }
        }

        const context = await fixture.createInvocationContext()
        const result = await getRecentEvents({ arguments: { scope: 'location', scopeId: locationId } }, context)
        const parsed = JSON.parse(result)

        assert.ok(Array.isArray(parsed))
        assert.equal(parsed.length, 0)
    })

    test('returns empty array when scope parameter is missing', async () => {
        const context = await fixture.createInvocationContext()
        const result = await getRecentEvents({ arguments: { scopeId: randomUUID() } }, context)
        const parsed = JSON.parse(result)

        assert.ok(Array.isArray(parsed))
        assert.equal(parsed.length, 0)
    })

    test('returns empty array when scopeId parameter is missing', async () => {
        const context = await fixture.createInvocationContext()
        const result = await getRecentEvents({ arguments: { scope: 'location' } }, context)
        const parsed = JSON.parse(result)

        assert.ok(Array.isArray(parsed))
        assert.equal(parsed.length, 0)
    })

    test('returns empty array when scope type is invalid', async () => {
        const context = await fixture.createInvocationContext()
        const result = await getRecentEvents({ arguments: { scope: 'invalid', scopeId: randomUUID() } }, context)
        const parsed = JSON.parse(result)

        assert.ok(Array.isArray(parsed))
        assert.equal(parsed.length, 0)
    })

    test('sorts events chronologically (newest first) - repository responsibility', async () => {
        const locationId = randomUUID()
        const now = new Date()

        const mockEvents: WorldEventRecord[] = [
            {
                id: 'event2',
                scopeKey: buildLocationScopeKey(locationId),
                eventType: 'Event2',
                status: 'processed',
                occurredUtc: now.toISOString(), // newest
                ingestedUtc: now.toISOString(),
                actorKind: 'system',
                correlationId: randomUUID(),
                idempotencyKey: 'evt2',
                payload: {},
                version: 1
            },
            {
                id: 'event1',
                scopeKey: buildLocationScopeKey(locationId),
                eventType: 'Event1',
                status: 'processed',
                occurredUtc: new Date(now.getTime() - 60000).toISOString(), // older
                ingestedUtc: now.toISOString(),
                actorKind: 'system',
                correlationId: randomUUID(),
                idempotencyKey: 'evt1',
                payload: {},
                version: 1
            }
        ]

        const eventRepo = await fixture.getWorldEventRepository()
        ;(eventRepo as any).queryByScope = async (scopeKey: string, options: any) => {
            assert.equal(options.order, 'desc', 'Should request descending order')
            // Repository returns pre-sorted events (newest first)
            return { events: mockEvents, ruCharge: 3.0, latencyMs: 50, hasMore: false }
        }

        const context = await fixture.createInvocationContext()
        const result = await getRecentEvents({ arguments: { scope: 'location', scopeId: locationId } }, context)
        const parsed = JSON.parse(result)

        assert.equal(parsed.length, 2)
        // Verify order is preserved from repository
        assert.equal(parsed[0].id, 'event2')
        assert.equal(parsed[1].id, 'event1')
    })
})
