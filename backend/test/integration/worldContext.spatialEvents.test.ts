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

    test('getRecentEvents returns events within time window', async () => {
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
        const result = await getRecentEvents({ arguments: { locationId } }, context)
        const parsed = JSON.parse(result)

        assert.equal(parsed.locationId, locationId)
        assert.equal(parsed.timeWindowHours, 24)
        assert.ok(Array.isArray(parsed.events))
        assert.ok(parsed.events.length > 0)
        assert.ok(parsed.events.some((e: any) => e.id === recentEvent.id))

        // Verify performance metadata
        assert.ok(parsed.performance)
        assert.ok(typeof parsed.performance.ruCharge === 'number')
        assert.ok(typeof parsed.performance.latencyMs === 'number')
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

        // Query recent events
        const eventsResult = await getRecentEvents({ arguments: { locationId, timeWindowHours: 1 } }, context)
        const events = JSON.parse(eventsResult)

        assert.ok(events.events)
        assert.ok(events.events.length > 0)
        assert.equal(events.events[0].id, evt.id)

        // Verify both queries completed successfully
        assert.equal(spatial.locationId, locationId)
        assert.equal(events.locationId, locationId)
    })
})
