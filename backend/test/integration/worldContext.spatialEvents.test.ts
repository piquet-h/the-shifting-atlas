import { STARTER_LOCATION_ID } from '@piquet-h/shared'
import type { WorldEventRecord } from '@piquet-h/shared/types/worldEventRepository'
import { buildLocationScopeKey } from '@piquet-h/shared/types/worldEventRepository'
import { randomUUID } from 'crypto'
import assert from 'node:assert'
import { afterEach, beforeEach, test } from 'node:test'
import { getRecentEvents, getSpatialContext } from '../../src/handlers/mcp/world-context/world-context.js'
import { describeForBothModes } from '../helpers/describeForBothModes.js'
import type { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

describeForBothModes('WorldContext spatial & events (integration)', (mode) => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        const { IntegrationTestFixture: Fixture } = await import('../helpers/IntegrationTestFixture.js')
        fixture = new Fixture(mode)
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    test('getSpatialContext returns neighboring locations via Gremlin traversal', async () => {
        const locationRepo = await fixture.getLocationRepository()

        // Create a small graph: A -> B -> C
        const locationA = randomUUID()
        const locationB = randomUUID()
        const locationC = randomUUID()

        await locationRepo.upsert({
            id: locationA,
            name: 'Location A',
            description: 'Starting point',
            exits: []
        })

        await locationRepo.upsert({
            id: locationB,
            name: 'Location B',
            description: 'One hop away',
            exits: []
        })

        await locationRepo.upsert({
            id: locationC,
            name: 'Location C',
            description: 'Two hops away',
            exits: []
        })

        // Create exits
        await locationRepo.ensureExit(locationA, 'north', locationB)
        await locationRepo.ensureExit(locationB, 'east', locationC)

        const context = await fixture.createInvocationContext()
        const result = await getSpatialContext({ arguments: { locationId: locationA, depth: 2 } }, context)
        const parsed = JSON.parse(result)

        assert.equal(parsed.locationId, locationA)
        assert.equal(parsed.depth, 2)
        assert.ok(Array.isArray(parsed.neighbors))
        // Should find B (depth 1) and C (depth 2)
        assert.ok(parsed.neighbors.length >= 1, 'Should find at least one neighbor')

        // Verify neighbor structure
        const neighbor = parsed.neighbors[0]
        assert.ok(neighbor.id)
        assert.ok(neighbor.name)
        assert.ok(typeof neighbor.depth === 'number')
    })

    test('getSpatialContext with depth 1 returns only immediate neighbors', async () => {
        const locationRepo = await fixture.getLocationRepository()

        const locationA = randomUUID()
        const locationB = randomUUID()
        const locationC = randomUUID()

        await locationRepo.upsert({
            id: locationA,
            name: 'Location A',
            description: 'Starting point',
            exits: []
        })

        await locationRepo.upsert({
            id: locationB,
            name: 'Location B',
            description: 'Adjacent',
            exits: []
        })

        await locationRepo.upsert({
            id: locationC,
            name: 'Location C',
            description: 'Two hops away',
            exits: []
        })

        await locationRepo.ensureExit(locationA, 'north', locationB)
        await locationRepo.ensureExit(locationB, 'east', locationC)

        const context = await fixture.createInvocationContext()
        const result = await getSpatialContext({ arguments: { locationId: locationA, depth: 1 } }, context)
        const parsed = JSON.parse(result)

        assert.equal(parsed.depth, 1)
        // With depth 1, should only find B, not C
        assert.ok(parsed.neighbors.every((n: any) => n.depth === 1))
    })

    test('getRecentEvents with scope=location returns event summaries', async () => {
        const locationRepo = await fixture.getLocationRepository()
        const eventRepo = await fixture.getWorldEventRepository()

        const locationId = STARTER_LOCATION_ID

        await locationRepo.upsert({
            id: locationId,
            name: 'Test Location',
            description: 'A location',
            exits: []
        })

        // Create some events
        const now = new Date()
        const recentEvent: WorldEventRecord = {
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
        }

        await eventRepo.create(recentEvent)

        const context = await fixture.createInvocationContext()
        const result = await getRecentEvents({ arguments: { scope: 'location', scopeId: locationId } }, context)
        const parsed = JSON.parse(result)

        // Verify structure per issue spec
        assert.ok(Array.isArray(parsed))
        assert.ok(parsed.length > 0)
        
        // Verify event summary shape (only required fields per spec)
        const eventSummary = parsed.find((e: any) => e.id === recentEvent.id)
        assert.ok(eventSummary)
        assert.equal(eventSummary.id, recentEvent.id)
        assert.equal(eventSummary.eventType, recentEvent.eventType)
        assert.equal(eventSummary.occurredUtc, recentEvent.occurredUtc)
        assert.equal(eventSummary.actorKind, recentEvent.actorKind)
        assert.equal(eventSummary.status, recentEvent.status)
        
        // Verify no extra fields from full event record
        assert.strictEqual(eventSummary.payload, undefined)
        assert.strictEqual(eventSummary.correlationId, undefined)
    })

    test('getRecentEvents with scope=player returns player events', async () => {
        const eventRepo = await fixture.getWorldEventRepository()
        const playerRepo = await fixture.getPlayerDocRepository()

        const playerId = randomUUID()

        await playerRepo.upsertPlayer({
            id: playerId,
            createdUtc: new Date().toISOString(),
            updatedUtc: new Date().toISOString(),
            currentLocationId: STARTER_LOCATION_ID,
            clockTick: 0
        })

        // Create player-scoped event
        const playerEvent: WorldEventRecord = {
            id: randomUUID(),
            scopeKey: `player:${playerId}`,
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

        await eventRepo.create(playerEvent)

        const context = await fixture.createInvocationContext()
        const result = await getRecentEvents({ arguments: { scope: 'player', scopeId: playerId } }, context)
        const parsed = JSON.parse(result)

        assert.ok(Array.isArray(parsed))
        assert.ok(parsed.length > 0)
        assert.ok(parsed.some((e: any) => e.id === playerEvent.id))
    })

    test('getRecentEvents respects limit parameter (default 20, max 100)', async () => {
        const eventRepo = await fixture.getWorldEventRepository()
        const locationId = STARTER_LOCATION_ID

        // Create 30 events
        for (let i = 0; i < 30; i++) {
            await eventRepo.create({
                id: randomUUID(),
                scopeKey: buildLocationScopeKey(locationId),
                eventType: 'Test.Event',
                status: 'processed',
                occurredUtc: new Date().toISOString(),
                ingestedUtc: new Date().toISOString(),
                actorKind: 'system',
                correlationId: randomUUID(),
                idempotencyKey: `test-${Date.now()}-${i}`,
                payload: {},
                version: 1
            })
        }

        const context = await fixture.createInvocationContext()

        // Test default limit (20)
        const defaultResult = await getRecentEvents({ arguments: { scope: 'location', scopeId: locationId } }, context)
        const defaultParsed = JSON.parse(defaultResult)
        assert.ok(defaultParsed.length <= 20, 'Default should return max 20 events')

        // Test explicit limit
        const limitResult = await getRecentEvents({ arguments: { scope: 'location', scopeId: locationId, limit: 10 } }, context)
        const limitParsed = JSON.parse(limitResult)
        assert.ok(limitParsed.length <= 10, 'Should respect explicit limit')

        // Test max clamp (request 200, should clamp to 100)
        const clampResult = await getRecentEvents({ arguments: { scope: 'location', scopeId: locationId, limit: 200 } }, context)
        const clampParsed = JSON.parse(clampResult)
        assert.ok(clampParsed.length <= 100, 'Should clamp to max 100 events')
    })

    test('getRecentEvents returns empty array when no events exist', async () => {
        const locationRepo = await fixture.getLocationRepository()
        const locationId = randomUUID()

        await locationRepo.upsert({
            id: locationId,
            name: 'Empty Location',
            description: 'No events here',
            exits: []
        })

        const context = await fixture.createInvocationContext()
        const result = await getRecentEvents({ arguments: { scope: 'location', scopeId: locationId } }, context)
        const parsed = JSON.parse(result)

        assert.ok(Array.isArray(parsed))
        assert.equal(parsed.length, 0, 'Should return empty array when no events')
    })

    test('getSpatialContext clamps depth to max 5', async () => {
        const locationRepo = await fixture.getLocationRepository()
        const locationId = randomUUID()

        await locationRepo.upsert({
            id: locationId,
            name: 'Start',
            description: 'Starting location',
            exits: []
        })

        const context = await fixture.createInvocationContext()
        
        // Request depth > 5, should clamp to 5
        const result = await getSpatialContext({ arguments: { locationId, depth: 10 } }, context)
        const parsed = JSON.parse(result)

        assert.equal(parsed.depth, 5, 'Depth should be clamped to 5')
        assert.equal(parsed.requestedDepth, 10, 'Should track requested depth')
        assert.ok(parsed.warnings)
        assert.ok(parsed.warnings.some((w: string) => w.includes('clamped')))
    })

    test('getSpatialContext returns null when location not found', async () => {
        const nonExistentId = randomUUID()
        const context = await fixture.createInvocationContext()
        
        const result = await getSpatialContext({ arguments: { locationId: nonExistentId } }, context)
        const parsed = JSON.parse(result)

        assert.strictEqual(parsed, null, 'Should return null for non-existent location')
    })

    test('full context query chain: location + spatial + events', async () => {
        const locationRepo = await fixture.getLocationRepository()
        const eventRepo = await fixture.getWorldEventRepository()

        const locationId = randomUUID()
        const neighborId = randomUUID()

        // Setup location with neighbor
        await locationRepo.upsert({
            id: locationId,
            name: 'Main Location',
            description: 'Central hub',
            exits: []
        })

        await locationRepo.upsert({
            id: neighborId,
            name: 'Neighbor Location',
            description: 'Adjacent area',
            exits: []
        })

        await locationRepo.ensureExit(locationId, 'west', neighborId)

        // Add event
        const evt: WorldEventRecord = {
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

        await eventRepo.create(evt)

        const context = await fixture.createInvocationContext()

        // Query spatial context
        const spatialResult = await getSpatialContext({ arguments: { locationId, depth: 1 } }, context)
        const spatial = JSON.parse(spatialResult)

        assert.ok(spatial.neighbors)
        assert.ok(spatial.neighbors.length > 0)

        // Query recent events using new API
        const eventsResult = await getRecentEvents({ arguments: { scope: 'location', scopeId: locationId, limit: 10 } }, context)
        const events = JSON.parse(eventsResult)

        assert.ok(Array.isArray(events))
        assert.ok(events.length > 0)
        assert.ok(events.some((e: any) => e.id === evt.id))

        // Verify both queries completed successfully
        assert.equal(spatial.locationId, locationId)
    })
})
