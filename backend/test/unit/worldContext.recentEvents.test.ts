import type { WorldEventRecord } from '@piquet-h/shared/types/worldEventRepository'
import { buildLocationScopeKey } from '@piquet-h/shared/types/worldEventRepository'
import { randomUUID } from 'crypto'
import assert from 'node:assert'
import { beforeEach, describe, test } from 'node:test'
import { getRecentEvents } from '../../src/handlers/mcp/world-context/world-context.js'
import { UnitTestFixture } from '../helpers/UnitTestFixture.js'

type LocationRecord = {
    id: string
    name: string
    description: string
    exits: unknown[]
}

type LocationRepoOverride = {
    get: () => Promise<LocationRecord | undefined>
}

type WorldEventRepoOverride = {
    queryByScope: (
        scopeKey: string,
        options?: {
            afterTimestamp?: string
        }
    ) => Promise<{
        events: WorldEventRecord[]
        ruCharge: number
        latencyMs: number
        hasMore: boolean
    }>
}

describe('WorldContext getRecentEvents (unit)', () => {
    let fixture: UnitTestFixture

    beforeEach(async () => {
        fixture = new UnitTestFixture()
        await fixture.setup()
    })

    test('returns recent events with default time window (24 hours)', async () => {
        const locationId = randomUUID()
        const now = new Date()
        const yesterday = new Date(now.getTime() - 23 * 60 * 60 * 1000)

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
                payload: {},
                version: 1
            },
            {
                id: randomUUID(),
                scopeKey: buildLocationScopeKey(locationId),
                eventType: 'Player.Look',
                status: 'processed',
                occurredUtc: yesterday.toISOString(),
                ingestedUtc: yesterday.toISOString(),
                actorKind: 'player',
                correlationId: randomUUID(),
                idempotencyKey: `look-${Date.now()}`,
                payload: {},
                version: 1
            }
        ]

        // Mock location repository to return a location
        const locationRepo = await fixture.getLocationRepository()
        ;(locationRepo as unknown as LocationRepoOverride).get = async () => ({
            id: locationId,
            name: 'Test Location',
            description: 'A test location',
            exits: []
        })

        const eventRepo = await fixture.getWorldEventRepository()
        ;(eventRepo as unknown as WorldEventRepoOverride).queryByScope = async (
            scopeKey: string,
            options?: { afterTimestamp?: string }
        ) => {
            assert.equal(scopeKey, buildLocationScopeKey(locationId))
            assert.ok(options?.afterTimestamp)
            return { events: mockEvents, ruCharge: 2.5, latencyMs: 45, hasMore: false }
        }

        const context = await fixture.createInvocationContext()
        const result = await getRecentEvents({ arguments: { locationId } }, context)
        const parsed = JSON.parse(result)

        assert.equal(parsed.locationId, locationId)
        assert.equal(parsed.timeWindowHours, 24)
        assert.ok(Array.isArray(parsed.events))
        assert.equal(parsed.events.length, 2)
        assert.ok(parsed.events[0].occurredUtc >= parsed.events[1].occurredUtc) // newest first
    })

    test('returns recent events with custom time window', async () => {
        const locationId = randomUUID()
        const timeWindowHours = 6

        const mockEvents: WorldEventRecord[] = [
            {
                id: randomUUID(),
                scopeKey: buildLocationScopeKey(locationId),
                eventType: 'World.Event',
                status: 'processed',
                occurredUtc: new Date().toISOString(),
                ingestedUtc: new Date().toISOString(),
                actorKind: 'system',
                correlationId: randomUUID(),
                idempotencyKey: `evt-${Date.now()}`,
                payload: {},
                version: 1
            }
        ]

        // Mock location repository
        const locationRepo = await fixture.getLocationRepository()
        ;(locationRepo as unknown as LocationRepoOverride).get = async () => ({
            id: locationId,
            name: 'Test Location',
            description: 'A test location',
            exits: []
        })

        const eventRepo = await fixture.getWorldEventRepository()
        ;(eventRepo as unknown as WorldEventRepoOverride).queryByScope = async (
            scopeKey: string,
            options?: { afterTimestamp?: string }
        ) => {
            // Verify time window calculation
            assert.ok(options?.afterTimestamp)
            const afterTime = new Date(options.afterTimestamp)
            const expectedAfter = new Date(Date.now() - timeWindowHours * 60 * 60 * 1000)
            const diff = Math.abs(afterTime.getTime() - expectedAfter.getTime())
            assert.ok(diff < 1000, `Time window should be ${timeWindowHours} hours`)
            return { events: mockEvents, ruCharge: 1.2, latencyMs: 30, hasMore: false }
        }

        const context = await fixture.createInvocationContext()
        const result = await getRecentEvents({ arguments: { locationId, timeWindowHours } }, context)
        const parsed = JSON.parse(result)

        assert.equal(parsed.timeWindowHours, 6)
        assert.equal(parsed.events.length, 1)
    })

    test('returns empty array when no events in time window', async () => {
        const locationId = randomUUID()

        // Mock location repository
        const locationRepo = await fixture.getLocationRepository()
        ;(locationRepo as unknown as LocationRepoOverride).get = async () => ({
            id: locationId,
            name: 'Test Location',
            description: 'A test location',
            exits: []
        })

        const eventRepo = await fixture.getWorldEventRepository()
        ;(eventRepo as unknown as WorldEventRepoOverride).queryByScope = async () => {
            return { events: [], ruCharge: 0.5, latencyMs: 10, hasMore: false }
        }

        const context = await fixture.createInvocationContext()
        const result = await getRecentEvents({ arguments: { locationId } }, context)
        const parsed = JSON.parse(result)

        assert.ok(Array.isArray(parsed.events))
        assert.equal(parsed.events.length, 0)
    })

    test('sorts events chronologically (newest first)', async () => {
        const locationId = randomUUID()
        const now = new Date()

        const mockEvents: WorldEventRecord[] = [
            {
                id: randomUUID(),
                scopeKey: buildLocationScopeKey(locationId),
                eventType: 'Event1',
                status: 'processed',
                occurredUtc: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
                ingestedUtc: now.toISOString(),
                actorKind: 'system',
                correlationId: randomUUID(),
                idempotencyKey: `evt1-${Date.now()}`,
                payload: {},
                version: 1
            },
            {
                id: randomUUID(),
                scopeKey: buildLocationScopeKey(locationId),
                eventType: 'Event2',
                status: 'processed',
                occurredUtc: now.toISOString(), // now
                ingestedUtc: now.toISOString(),
                actorKind: 'system',
                correlationId: randomUUID(),
                idempotencyKey: `evt2-${Date.now()}`,
                payload: {},
                version: 1
            },
            {
                id: randomUUID(),
                scopeKey: buildLocationScopeKey(locationId),
                eventType: 'Event3',
                status: 'processed',
                occurredUtc: new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString(), // 1 hour ago
                ingestedUtc: now.toISOString(),
                actorKind: 'system',
                correlationId: randomUUID(),
                idempotencyKey: `evt3-${Date.now()}`,
                payload: {},
                version: 1
            }
        ]

        // Mock location repository
        const locationRepo = await fixture.getLocationRepository()
        ;(locationRepo as unknown as LocationRepoOverride).get = async () => ({
            id: locationId,
            name: 'Test Location',
            description: 'A test location',
            exits: []
        })

        const eventRepo = await fixture.getWorldEventRepository()
        ;(eventRepo as unknown as WorldEventRepoOverride).queryByScope = async () => {
            // Repository should respect order:'desc' parameter and return sorted events
            const sortedEvents = [...mockEvents].sort((a, b) => {
                return new Date(b.occurredUtc).getTime() - new Date(a.occurredUtc).getTime()
            })
            return { events: sortedEvents, ruCharge: 3.0, latencyMs: 50, hasMore: false }
        }

        const context = await fixture.createInvocationContext()
        const result = await getRecentEvents({ arguments: { locationId } }, context)
        const parsed = JSON.parse(result)

        assert.equal(parsed.events.length, 3)
        // Verify newest first
        assert.equal(parsed.events[0].eventType, 'Event2')
        assert.equal(parsed.events[1].eventType, 'Event3')
        assert.equal(parsed.events[2].eventType, 'Event1')
    })

    test('returns null when location does not exist', async () => {
        const locationId = randomUUID()

        const locationRepo = await fixture.getLocationRepository()
        ;(locationRepo as unknown as LocationRepoOverride).get = async () => undefined

        const context = await fixture.createInvocationContext()
        const result = await getRecentEvents({ arguments: { locationId } }, context)
        const parsed = JSON.parse(result)

        assert.equal(parsed, null)
    })

    test('includes performance metadata', async () => {
        const locationId = randomUUID()

        // Mock location repository
        const locationRepo = await fixture.getLocationRepository()
        ;(locationRepo as unknown as LocationRepoOverride).get = async () => ({
            id: locationId,
            name: 'Test Location',
            description: 'A test location',
            exits: []
        })

        const eventRepo = await fixture.getWorldEventRepository()
        ;(eventRepo as unknown as WorldEventRepoOverride).queryByScope = async () => {
            return { events: [], ruCharge: 1.5, latencyMs: 35, hasMore: false }
        }

        const context = await fixture.createInvocationContext()
        const result = await getRecentEvents({ arguments: { locationId } }, context)
        const parsed = JSON.parse(result)

        assert.ok(parsed.performance)
        assert.equal(typeof parsed.performance.ruCharge, 'number')
        assert.equal(typeof parsed.performance.latencyMs, 'number')
    })
})
