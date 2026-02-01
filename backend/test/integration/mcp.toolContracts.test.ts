/**
 * MCP Tool Contract Integration Tests
 *
 * Validates:
 * - Tool registration and handler wiring
 * - Stable JSON output contracts
 * - Argument parsing (required/optional)
 * - Not-found/empty cases
 *
 * Boundary behavior (auth/throttle) tested in separate mcp.boundary.test.ts
 */

import type { PlayerDoc } from '@piquet-h/shared'
import { STARTER_LOCATION_ID } from '@piquet-h/shared'
import type { InventoryItem } from '@piquet-h/shared/types/inventoryRepository'
import type { WorldEventRecord } from '@piquet-h/shared/types/worldEventRepository'
import { buildLocationScopeKey } from '@piquet-h/shared/types/worldEventRepository'
import { randomUUID } from 'crypto'
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

// Import MCP tool handlers directly for integration testing
import { getCanonicalFact, searchLore } from '../../src/handlers/mcp/lore-memory/lore-memory.js'
import {
    getAtmosphere,
    getLocationContext,
    getPlayerContext,
    getRecentEvents,
    getSpatialContext,
    health
} from '../../src/handlers/mcp/world-context/world-context.js'

describe('MCP Tool Contracts (WorldContext-*)', () => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    test('WorldContext-health returns parsable JSON with expected shape', async () => {
        const context = await fixture.createInvocationContext()
        const result = await health({}, context)

        // Should be parsable JSON
        assert.doesNotThrow(() => JSON.parse(result), 'Result should be valid JSON')

        const parsed = JSON.parse(result)
        assert.strictEqual(typeof parsed, 'object', 'Should return object')
        assert.strictEqual(parsed.ok, true, 'Should have ok field set to true')
        assert.strictEqual(parsed.service, 'world-context', 'Should identify service as world-context')
    })

    test('WorldContext-getLocationContext with valid locationId returns expected shape', async () => {
        const locationRepo = await fixture.getLocationRepository()
        const locationId = STARTER_LOCATION_ID

        // Seed test location
        await locationRepo.upsert({
            id: locationId,
            name: 'Test Location',
            description: 'Test description',
            exits: []
        })

        const context = await fixture.createInvocationContext()
        const result = await getLocationContext({ arguments: { locationId } }, context)

        // Should be parsable JSON
        assert.doesNotThrow(() => JSON.parse(result), 'Result should be valid JSON')

        const parsed = JSON.parse(result)
        assert.ok(parsed.tick !== undefined, 'Should have tick field')
        assert.ok(parsed.location, 'Should have location field')
        assert.strictEqual(parsed.location.id, locationId, 'Location ID should match')

        // MCP location payload should be prompt-safe: exits are returned separately.
        // Avoid including cached human-readable summaries that can confuse the model.
        assert.strictEqual(parsed.location.exits, undefined, 'Location should not embed exits array')
        assert.strictEqual(parsed.location.exitsSummaryCache, undefined, 'Location should not embed exitsSummaryCache')

        assert.ok(Array.isArray(parsed.exits), 'Should have exits array')
        assert.ok(Array.isArray(parsed.nearbyPlayers), 'Should have nearbyPlayers array')
        assert.ok(Array.isArray(parsed.recentEvents), 'Should have recentEvents array')
        assert.ok(parsed.realms, 'Should have realms field')
        assert.ok(parsed.narrativeTags, 'Should have narrativeTags field')
        assert.ok(parsed.ambient, 'Should have ambient field')
    })

    test('WorldContext-getLocationContext with omitted locationId defaults to starter', async () => {
        const locationRepo = await fixture.getLocationRepository()

        // Seed starter location
        await locationRepo.upsert({
            id: STARTER_LOCATION_ID,
            name: 'Starter',
            description: 'Starter location',
            exits: []
        })

        const context = await fixture.createInvocationContext()
        const result = await getLocationContext({ arguments: {} }, context)

        const parsed = JSON.parse(result)
        assert.strictEqual(parsed.location.id, STARTER_LOCATION_ID, 'Should default to starter location')
    })

    test('WorldContext-getLocationContext with optional tick parameter', async () => {
        const locationRepo = await fixture.getLocationRepository()
        const locationId = STARTER_LOCATION_ID

        await locationRepo.upsert({
            id: locationId,
            name: 'Test',
            description: 'Test',
            exits: []
        })

        const context = await fixture.createInvocationContext()
        const customTick = 12345
        const result = await getLocationContext({ arguments: { locationId, tick: customTick } }, context)

        const parsed = JSON.parse(result)
        assert.strictEqual(parsed.tick, customTick, 'Should use provided tick')
    })

    test('WorldContext-getPlayerContext with valid playerId returns expected shape', async () => {
        const locationRepo = await fixture.getLocationRepository()
        const playerRepo = await fixture.getPlayerDocRepository()
        const inventoryRepo = await fixture.getInventoryRepository()

        const locationId = STARTER_LOCATION_ID
        const playerId = randomUUID()

        // Seed location and player
        await locationRepo.upsert({
            id: locationId,
            name: 'Test',
            description: 'Test',
            exits: []
        })

        const player: PlayerDoc = {
            id: playerId,
            createdUtc: new Date().toISOString(),
            updatedUtc: new Date().toISOString(),
            currentLocationId: locationId,
            clockTick: 0
        }
        await playerRepo.upsertPlayer(player)

        // Add inventory item
        const item: InventoryItem = {
            id: randomUUID(),
            playerId,
            itemType: 'test-item',
            quantity: 1,
            acquiredAt: new Date().toISOString()
        }
        await inventoryRepo.addItem(item)

        const context = await fixture.createInvocationContext()
        const result = await getPlayerContext({ arguments: { playerId } }, context)

        assert.doesNotThrow(() => JSON.parse(result), 'Result should be valid JSON')

        const parsed = JSON.parse(result)
        assert.ok(parsed.tick !== undefined, 'Should have tick field')
        assert.ok(parsed.player, 'Should have player field')
        assert.strictEqual(parsed.player.id, playerId, 'Player ID should match')
        assert.ok(parsed.location, 'Should have location field')

        // MCP location payload should be prompt-safe (no embedded exits or cached exit summaries).
        assert.strictEqual(parsed.location.exits, undefined, 'PlayerContext location should not embed exits array')
        assert.strictEqual(parsed.location.exitsSummaryCache, undefined, 'PlayerContext location should not embed exitsSummaryCache')

        assert.ok(Array.isArray(parsed.inventory), 'Should have inventory array')
        assert.strictEqual(parsed.inventory.length, 1, 'Should have 1 item')
        assert.ok(Array.isArray(parsed.recentEvents), 'Should have recentEvents array')
        assert.ok(Array.isArray(parsed.warnings), 'Should have warnings array')
    })

    test('WorldContext-getPlayerContext with missing playerId returns null', async () => {
        const context = await fixture.createInvocationContext()
        const result = await getPlayerContext({ arguments: {} }, context)

        const parsed = JSON.parse(result)
        assert.strictEqual(parsed, null, 'Should return null for missing playerId')
    })

    test('WorldContext-getPlayerContext with non-existent playerId returns null', async () => {
        const context = await fixture.createInvocationContext()
        const playerId = randomUUID()
        const result = await getPlayerContext({ arguments: { playerId } }, context)

        const parsed = JSON.parse(result)
        assert.strictEqual(parsed, null, 'Should return null for non-existent player')
    })

    test('WorldContext-getAtmosphere returns expected shape with defaults', async () => {
        const context = await fixture.createInvocationContext()
        const locationId = STARTER_LOCATION_ID

        const result = await getAtmosphere({ arguments: { locationId } }, context)

        assert.doesNotThrow(() => JSON.parse(result), 'Result should be valid JSON')

        const parsed = JSON.parse(result)
        assert.ok(parsed.tick !== undefined, 'Should have tick field')
        assert.strictEqual(parsed.locationId, locationId, 'Location ID should match')
        assert.ok(typeof parsed.timeOfDay === 'string', 'Should have timeOfDay string')
        assert.ok(parsed.weather, 'Should have weather layer')
        assert.ok(parsed.ambient, 'Should have ambient layer')
        assert.ok(parsed.lighting, 'Should have lighting layer')

        // Verify default values are applied when layers missing
        assert.strictEqual(parsed.weather.value, 'clear', 'Should default to clear weather')
        assert.strictEqual(parsed.ambient.value, 'calm', 'Should default to calm ambient')
        assert.strictEqual(parsed.lighting.value, 'daylight', 'Should default to daylight')
    })

    test('WorldContext-getSpatialContext returns expected shape', async () => {
        const locationRepo = await fixture.getLocationRepository()
        const locationId = STARTER_LOCATION_ID

        // Seed location
        await locationRepo.upsert({
            id: locationId,
            name: 'Test',
            description: 'Test',
            exits: []
        })

        const context = await fixture.createInvocationContext()
        const result = await getSpatialContext({ arguments: { locationId } }, context)

        assert.doesNotThrow(() => JSON.parse(result), 'Result should be valid JSON')

        const parsed = JSON.parse(result)
        assert.strictEqual(parsed.locationId, locationId, 'Location ID should match')
        assert.ok(typeof parsed.depth === 'number', 'Should have depth number')
        assert.ok(Array.isArray(parsed.neighbors), 'Should have neighbors array')
        // warnings field is optional (only present if there are warnings)
    })

    test('WorldContext-getSpatialContext with custom depth parameter', async () => {
        const locationRepo = await fixture.getLocationRepository()
        const locationId = STARTER_LOCATION_ID

        await locationRepo.upsert({
            id: locationId,
            name: 'Test',
            description: 'Test',
            exits: []
        })

        const context = await fixture.createInvocationContext()
        const customDepth = 3
        const result = await getSpatialContext({ arguments: { locationId, depth: customDepth } }, context)

        const parsed = JSON.parse(result)
        assert.strictEqual(parsed.depth, customDepth, 'Should use provided depth')
    })

    test('WorldContext-getSpatialContext clamps depth to max of 5', async () => {
        const locationRepo = await fixture.getLocationRepository()
        const locationId = STARTER_LOCATION_ID

        await locationRepo.upsert({
            id: locationId,
            name: 'Test',
            description: 'Test',
            exits: []
        })

        const context = await fixture.createInvocationContext()
        const result = await getSpatialContext({ arguments: { locationId, depth: 10 } }, context)

        const parsed = JSON.parse(result)
        assert.strictEqual(parsed.depth, 5, 'Should clamp depth to 5')
        assert.ok(
            parsed.warnings.some((w: string) => w.includes('clamped')),
            'Should have warning about clamping'
        )
    })

    test('WorldContext-getRecentEvents returns expected shape', async () => {
        const eventRepo = await fixture.getWorldEventRepository()
        const locationId = STARTER_LOCATION_ID

        // Seed event
        const evt: WorldEventRecord = {
            id: randomUUID(),
            scopeKey: buildLocationScopeKey(locationId),
            eventType: 'Player.Look',
            status: 'processed',
            occurredUtc: new Date().toISOString(),
            ingestedUtc: new Date().toISOString(),
            actorKind: 'player',
            actorId: randomUUID(),
            correlationId: randomUUID(),
            idempotencyKey: `test-${Date.now()}`,
            payload: { locationId },
            version: 1
        }
        await eventRepo.create(evt)

        const context = await fixture.createInvocationContext()
        const result = await getRecentEvents({ arguments: { scope: 'location', scopeId: locationId } }, context)

        assert.doesNotThrow(() => JSON.parse(result), 'Result should be valid JSON')

        const parsed = JSON.parse(result)
        assert.ok(Array.isArray(parsed), 'Should return array directly')
        assert.strictEqual(parsed.length, 1, 'Should have 1 event')
        assert.strictEqual(parsed[0].id, evt.id, 'Event ID should match')
        assert.strictEqual(parsed[0].eventType, evt.eventType, 'Event type should match')
        assert.ok(parsed[0].occurredUtc, 'Should have occurredUtc')
        assert.ok(parsed[0].actorKind, 'Should have actorKind')
        assert.ok(parsed[0].status, 'Should have status')
    })

    test('WorldContext-getRecentEvents with empty scope returns empty array', async () => {
        const context = await fixture.createInvocationContext()
        const locationId = randomUUID()

        const result = await getRecentEvents({ arguments: { scope: 'location', scopeId: locationId } }, context)

        const parsed = JSON.parse(result)
        assert.ok(Array.isArray(parsed), 'Should return array')
        assert.strictEqual(parsed.length, 0, 'Should have empty array')
    })
})

describe('MCP Tool Contracts (Lore-*)', () => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    test('Lore-getCanonicalFact with valid factId returns parsable JSON', async () => {
        const context = await fixture.createInvocationContext()
        const factId = 'test_fact_001'

        const result = await getCanonicalFact({ arguments: { factId } }, context)

        assert.doesNotThrow(() => JSON.parse(result), 'Result should be valid JSON')

        // For now, lore repository is empty in tests, so should return null
        const parsed = JSON.parse(result)
        assert.strictEqual(parsed, null, 'Should return null for non-existent fact')
    })

    test('Lore-getCanonicalFact with missing factId returns null', async () => {
        const context = await fixture.createInvocationContext()
        const result = await getCanonicalFact({ arguments: {} }, context)

        const parsed = JSON.parse(result)
        assert.strictEqual(parsed, null, 'Should return null for missing factId')
    })

    test('Lore-searchLore returns parsable JSON with expected shape', async () => {
        const context = await fixture.createInvocationContext()
        const query = 'test query'

        const result = await searchLore({ arguments: { query } }, context)

        assert.doesNotThrow(() => JSON.parse(result), 'Result should be valid JSON')

        const parsed = JSON.parse(result)
        assert.ok(Array.isArray(parsed), 'Should return array')
        // Currently returns empty array as semantic search not implemented
        assert.strictEqual(parsed.length, 0, 'Should return empty array')
    })

    test('Lore-searchLore with optional k parameter', async () => {
        const context = await fixture.createInvocationContext()
        const query = 'test query'
        const k = 10

        const result = await searchLore({ arguments: { query, k } }, context)

        assert.doesNotThrow(() => JSON.parse(result), 'Result should be valid JSON')

        const parsed = JSON.parse(result)
        assert.ok(Array.isArray(parsed), 'Should return array')
    })
})
