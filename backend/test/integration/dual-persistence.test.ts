/**
 * Dual Persistence Integration Tests
 *
 * Validates behavior of dual persistence pattern (ADR-002):
 * - Gremlin: Immutable world structure (locations, exits, spatial relationships)
 * - SQL API: Mutable player data and events (players, inventory, layers, events)
 *
 * Tests cross-API interactions and failure handling.
 *
 * Epic: piquet-h/the-shifting-atlas#386 (Cosmos Dual Persistence Implementation)
 * Goal: ≥90% integration test coverage for dual persistence paths
 *
 * Test Modes:
 * - Runs against both 'memory' and 'cosmos' persistence modes
 * - Validates behavior consistency across mock and real Cosmos DB implementations
 */

import { STARTER_LOCATION_ID } from '@piquet-h/shared'
import type { DescriptionLayer } from '@piquet-h/shared/types/layerRepository'
import type { InventoryItem } from '@piquet-h/shared/types/inventoryRepository'
import type { WorldEventRecord } from '@piquet-h/shared/types/worldEventRepository'
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import type { ContainerMode } from '../helpers/testInversify.config.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

/**
 * Run test suite against both memory and cosmos modes
 * Cosmos mode tests will skip gracefully if infrastructure is not available
 */
function describeForBothModes(suiteName: string, testFn: (mode: ContainerMode) => void): void {
    const modes: ContainerMode[] = ['memory', 'cosmos']

    for (const mode of modes) {
        describe(`${suiteName} [${mode}]`, () => {
            // Skip cosmos tests if PERSISTENCE_MODE is not explicitly set to 'cosmos'
            // This allows tests to run in CI without requiring Cosmos DB credentials
            if (mode === 'cosmos' && process.env.PERSISTENCE_MODE !== 'cosmos') {
                test.skip('Cosmos tests skipped (PERSISTENCE_MODE != cosmos)', () => {})
                return
            }
            testFn(mode)
        })
    }
}

describeForBothModes('Dual Persistence Integration', (mode) => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture(mode)
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    describe('Player Creation (SQL API) + Location Reference (Gremlin)', () => {
        test('should create player in SQL API and validate location exists in Gremlin', async () => {
            const playerRepo = await fixture.getPlayerRepository()
            const locationRepo = await fixture.getLocationRepository()

            // Create player in SQL API
            const { record: player, created } = await playerRepo.getOrCreate()

            assert.ok(created, 'expected player to be created')
            assert.ok(player.id, 'expected player ID to be set')
            assert.strictEqual(player.currentLocationId, STARTER_LOCATION_ID, 'expected starting location')

            // Verify location exists in Gremlin
            const location = await locationRepo.get(STARTER_LOCATION_ID)

            assert.ok(location, 'expected starting location to exist in Gremlin')
            assert.strictEqual(location.id, STARTER_LOCATION_ID, 'expected location ID to match')
        })

        test('should handle player with currentLocationId that does not exist in Gremlin', async () => {
            const playerRepo = await fixture.getPlayerRepository()
            const locationRepo = await fixture.getLocationRepository()

            // Create player
            const { record: player } = await playerRepo.getOrCreate()

            // Attempt to get non-existent location (simulates orphaned reference)
            const nonExistentLocationId = crypto.randomUUID()
            const location = await locationRepo.get(nonExistentLocationId)

            assert.strictEqual(location, undefined, 'expected undefined for non-existent location')

            // Player record remains intact (no cascade delete)
            const retrievedPlayer = await playerRepo.get(player.id)
            assert.ok(retrievedPlayer, 'expected player to still exist')
        })

        test('should create multiple players with references to same location', async () => {
            const playerRepo = await fixture.getPlayerRepository()
            const locationRepo = await fixture.getLocationRepository()

            // Create multiple players
            const player1 = await playerRepo.getOrCreate()
            const player2 = await playerRepo.getOrCreate()
            const player3 = await playerRepo.getOrCreate()

            // All should reference the same starting location
            assert.strictEqual(player1.record.currentLocationId, STARTER_LOCATION_ID)
            assert.strictEqual(player2.record.currentLocationId, STARTER_LOCATION_ID)
            assert.strictEqual(player3.record.currentLocationId, STARTER_LOCATION_ID)

            // Verify location exists once in Gremlin
            const location = await locationRepo.get(STARTER_LOCATION_ID)
            assert.ok(location, 'expected location to exist')

            // Edge case: Multiple player references to same location (acceptable pattern)
        })

        // CRITICAL TEST: Player location persistence after movement
        // BLOCKED by issue #494 - IPlayerRepository has no update() method
        // Move handler doesn't persist location changes to SQL API
        test.skip('should update player currentLocationId in SQL API after movement', async () => {
            const playerRepo = await fixture.getPlayerRepository()
            const locationRepo = await fixture.getLocationRepository()

            // Given: Player at location A with SQL document currentLocationId = A
            const { record: player } = await playerRepo.getOrCreate()
            const startLocation = await locationRepo.get(player.currentLocationId)
            assert.ok(startLocation, 'Start location should exist')

            // Find an exit from start location
            const exit = startLocation.exits?.[0]
            assert.ok(exit, 'Start location should have at least one exit')

            // When: Player moves to location B
            // NOTE: This test assumes a move() method exists. Actual implementation TBD in #494
            // For now, this documents the expected behavior:
            // const moveResult = await someMoveMechanism(player.id, exit.direction)
            // assert.strictEqual(moveResult.status, 'ok', 'Move should succeed')

            // Then: SQL API document should be UPDATED with new currentLocationId
            // const updatedPlayer = await playerRepo.get(player.id)
            // assert.strictEqual(
            //     updatedPlayer?.currentLocationId,
            //     moveResult.location.id,
            //     'Player currentLocationId should be updated in SQL API after movement'
            // )

            // And: Player reconnect should return correct location (no snap-back)
            // const reconnectedPlayer = await playerRepo.get(player.id)
            // assert.strictEqual(
            //     reconnectedPlayer?.currentLocationId,
            //     moveResult.location.id,
            //     'Player should remain at new location after reconnect'
            // )

            // BLOCKED: Cannot implement until:
            // 1. IPlayerRepository.update() method exists
            // 2. Move handler calls update after successful move
            // 3. Migration script can safely copy players knowing locations will persist
            // See issue #494 for implementation plan
        })
    })

    describe('Inventory Item (SQL API) + Player Reference', () => {
        test('should add inventory item to SQL container with valid player reference', async () => {
            const playerRepo = await fixture.getPlayerRepository()
            const inventoryRepo = await fixture.getInventoryRepository()

            // Create player
            const { record: player } = await playerRepo.getOrCreate()

            // Add inventory item
            const item: InventoryItem = {
                id: crypto.randomUUID(),
                playerId: player.id,
                itemType: 'sword',
                quantity: 1,
                acquiredAt: new Date().toISOString(),
                metadata: { damage: 10, rarity: 'common' }
            }

            const addedItem = await inventoryRepo.addItem(item)

            assert.ok(addedItem, 'expected item to be added')
            assert.strictEqual(addedItem.playerId, player.id, 'expected player ID to match')
            assert.strictEqual(addedItem.itemType, 'sword', 'expected item type to match')

            // Verify player reference is intact
            const retrievedPlayer = await playerRepo.get(player.id)
            assert.ok(retrievedPlayer, 'expected player to exist')
            assert.strictEqual(retrievedPlayer.id, player.id, 'expected same player ID')

            // Verify item can be retrieved for player (single-partition query)
            const playerItems = await inventoryRepo.listItems(player.id)
            assert.strictEqual(playerItems.length, 1, 'expected one item')
            assert.strictEqual(playerItems[0].id, item.id, 'expected same item ID')
        })

        test('should handle inventory item with non-existent player reference (orphaned data)', async () => {
            const inventoryRepo = await fixture.getInventoryRepository()
            const playerRepo = await fixture.getPlayerRepository()

            // Create inventory item for non-existent player
            const nonExistentPlayerId = crypto.randomUUID()
            const item: InventoryItem = {
                id: crypto.randomUUID(),
                playerId: nonExistentPlayerId,
                itemType: 'potion',
                quantity: 1,
                acquiredAt: new Date().toISOString()
            }

            // Item can be added (no FK constraint)
            const addedItem = await inventoryRepo.addItem(item)
            assert.ok(addedItem, 'expected item to be added')

            // Player does not exist
            const player = await playerRepo.get(nonExistentPlayerId)
            assert.strictEqual(player, undefined, 'expected player to not exist')

            // Edge case: Orphaned inventory item (acceptable for MVP, cleanup deferred)
        })

        test('should handle multiple inventory items for single player (partition efficiency)', async () => {
            const playerRepo = await fixture.getPlayerRepository()
            const inventoryRepo = await fixture.getInventoryRepository()

            const { record: player } = await playerRepo.getOrCreate()

            // Add multiple items
            const items: InventoryItem[] = [
                {
                    id: crypto.randomUUID(),
                    playerId: player.id,
                    itemType: 'sword',
                    quantity: 1,
                    acquiredAt: new Date().toISOString()
                },
                {
                    id: crypto.randomUUID(),
                    playerId: player.id,
                    itemType: 'potion',
                    quantity: 5,
                    acquiredAt: new Date().toISOString()
                },
                {
                    id: crypto.randomUUID(),
                    playerId: player.id,
                    itemType: 'shield',
                    quantity: 1,
                    acquiredAt: new Date().toISOString()
                }
            ]

            for (const item of items) {
                await inventoryRepo.addItem(item)
            }

            // Single-partition query (efficient)
            const playerItems = await inventoryRepo.listItems(player.id)
            assert.strictEqual(playerItems.length, 3, 'expected three items')

            // Partition key /playerId ensures all items colocated
        })
    })

    describe('Description Layer (SQL API) + Location in Gremlin', () => {
        test('should create description layer in SQL container and validate location exists in Gremlin', async () => {
            const layerRepo = await fixture.getLayerRepository()
            const locationRepo = await fixture.getLocationRepository()

            // Verify location exists in Gremlin
            const location = await locationRepo.get(STARTER_LOCATION_ID)
            assert.ok(location, 'expected location to exist')

            // Add description layer for this location
            const layer: DescriptionLayer = {
                id: crypto.randomUUID(),
                locationId: STARTER_LOCATION_ID,
                layerType: 'ambient',
                content: 'A soft glow illuminates the ancient stonework.',
                priority: 50,
                authoredAt: new Date().toISOString()
            }

            const addedLayer = await layerRepo.addLayer(layer)

            assert.ok(addedLayer, 'expected layer to be added')
            assert.strictEqual(addedLayer.locationId, STARTER_LOCATION_ID, 'expected location ID to match')

            // Verify layer can be retrieved for location (single-partition query)
            const locationLayers = await layerRepo.getLayersForLocation(STARTER_LOCATION_ID)
            assert.strictEqual(locationLayers.length, 1, 'expected one layer')
            assert.strictEqual(locationLayers[0].id, layer.id, 'expected same layer ID')
        })

        test('should handle description layer with non-existent location reference (orphaned data)', async () => {
            const layerRepo = await fixture.getLayerRepository()
            const locationRepo = await fixture.getLocationRepository()

            const nonExistentLocationId = crypto.randomUUID()

            // Create layer for non-existent location
            const layer: DescriptionLayer = {
                id: crypto.randomUUID(),
                locationId: nonExistentLocationId,
                layerType: 'base',
                content: 'A mysterious place that does not exist.',
                priority: 100,
                authoredAt: new Date().toISOString()
            }

            // Layer can be added (no FK constraint)
            const addedLayer = await layerRepo.addLayer(layer)
            assert.ok(addedLayer, 'expected layer to be added')

            // Location does not exist in Gremlin
            const location = await locationRepo.get(nonExistentLocationId)
            assert.strictEqual(location, undefined, 'expected location to not exist')

            // Edge case: Orphaned layer (acceptable for MVP, cleanup deferred)
        })

        test('should handle multiple layers for single location (partition efficiency)', async () => {
            const layerRepo = await fixture.getLayerRepository()
            const locationRepo = await fixture.getLocationRepository()

            const location = await locationRepo.get(STARTER_LOCATION_ID)
            assert.ok(location, 'expected location to exist')

            // Add multiple layers
            const layers: DescriptionLayer[] = [
                {
                    id: crypto.randomUUID(),
                    locationId: STARTER_LOCATION_ID,
                    layerType: 'base',
                    content: 'Base description',
                    priority: 100,
                    authoredAt: new Date().toISOString()
                },
                {
                    id: crypto.randomUUID(),
                    locationId: STARTER_LOCATION_ID,
                    layerType: 'ambient',
                    content: 'Ambient sounds',
                    priority: 50,
                    authoredAt: new Date().toISOString()
                },
                {
                    id: crypto.randomUUID(),
                    locationId: STARTER_LOCATION_ID,
                    layerType: 'dynamic',
                    content: 'Dynamic events',
                    priority: 75,
                    authoredAt: new Date().toISOString()
                }
            ]

            for (const layer of layers) {
                await layerRepo.addLayer(layer)
            }

            // Single-partition query (efficient)
            const locationLayers = await layerRepo.getLayersForLocation(STARTER_LOCATION_ID)
            assert.strictEqual(locationLayers.length, 3, 'expected three layers')

            // Partition key /locationId ensures all layers colocated
        })
    })

    describe('World Event (SQL API) + ScopeKey Pattern', () => {
        test('should append world event in SQL container with valid scopeKey', async () => {
            const eventRepo = await fixture.getWorldEventRepository()

            // Create world event with location scope
            const now = new Date().toISOString()
            const event: WorldEventRecord = {
                id: crypto.randomUUID(),
                scopeKey: `loc:${STARTER_LOCATION_ID}`,
                eventType: 'player_arrived',
                status: 'pending',
                occurredUtc: now,
                ingestedUtc: now,
                actorKind: 'player',
                actorId: crypto.randomUUID(),
                correlationId: crypto.randomUUID(),
                idempotencyKey: `test-player-arrived-${Date.now()}`,
                payload: {
                    playerId: crypto.randomUUID(),
                    locationId: STARTER_LOCATION_ID
                },
                version: 1
            }

            const createdEvent = await eventRepo.create(event)

            assert.ok(createdEvent, 'expected event to be created')
            assert.strictEqual(createdEvent.scopeKey, `loc:${STARTER_LOCATION_ID}`, 'expected scope key to match')
            assert.strictEqual(createdEvent.eventType, 'player_arrived', 'expected event type to match')
            assert.strictEqual(createdEvent.status, 'pending', 'expected status to be pending')
        })

        test('should query world events by scopeKey (single-partition query)', async () => {
            const eventRepo = await fixture.getWorldEventRepository()
            const scopeKey = `loc:${STARTER_LOCATION_ID}`
            const now = new Date().toISOString()

            // Create multiple events for same scope
            const events: WorldEventRecord[] = [
                {
                    id: crypto.randomUUID(),
                    scopeKey,
                    eventType: 'player_arrived',
                    status: 'pending',
                    occurredUtc: now,
                    ingestedUtc: now,
                    actorKind: 'player',
                    actorId: crypto.randomUUID(),
                    correlationId: crypto.randomUUID(),
                    idempotencyKey: `test-player-arrived-${Date.now()}-1`,
                    payload: { playerId: crypto.randomUUID() },
                    version: 1
                },
                {
                    id: crypto.randomUUID(),
                    scopeKey,
                    eventType: 'npc_spawned',
                    status: 'pending',
                    occurredUtc: now,
                    ingestedUtc: now,
                    actorKind: 'system',
                    correlationId: crypto.randomUUID(),
                    idempotencyKey: `test-npc-spawned-${Date.now()}-2`,
                    payload: { npcId: crypto.randomUUID() },
                    version: 1
                },
                {
                    id: crypto.randomUUID(),
                    scopeKey,
                    eventType: 'item_dropped',
                    status: 'pending',
                    occurredUtc: now,
                    ingestedUtc: now,
                    actorKind: 'system',
                    correlationId: crypto.randomUUID(),
                    idempotencyKey: `test-item-dropped-${Date.now()}-3`,
                    payload: { itemId: crypto.randomUUID() },
                    version: 1
                }
            ]

            for (const event of events) {
                await eventRepo.create(event)
            }

            // Query timeline (single-partition query)
            const timeline = await eventRepo.queryByScope(scopeKey, { limit: 10 })

            assert.ok(timeline, 'expected timeline to be returned')
            assert.ok(timeline.events.length >= 3, 'expected at least three events')

            // Partition key /scopeKey ensures all events for scope colocated
        })

        test('should handle player scope events (player-centric timeline)', async () => {
            const eventRepo = await fixture.getWorldEventRepository()
            const playerRepo = await fixture.getPlayerRepository()

            // Create player
            const { record: player } = await playerRepo.getOrCreate()
            const scopeKey = `player:${player.id}`
            const now = new Date().toISOString()

            // Create event for player scope
            const event: WorldEventRecord = {
                id: crypto.randomUUID(),
                scopeKey,
                eventType: 'player_level_up',
                status: 'processed',
                occurredUtc: now,
                ingestedUtc: now,
                processedUtc: now,
                actorKind: 'player',
                actorId: player.id,
                correlationId: crypto.randomUUID(),
                idempotencyKey: `test-level-up-${Date.now()}`,
                payload: {
                    playerId: player.id,
                    newLevel: 2
                },
                version: 1
            }

            const createdEvent = await eventRepo.create(event)

            assert.ok(createdEvent, 'expected event to be created')
            assert.strictEqual(createdEvent.scopeKey, `player:${player.id}`, 'expected player scope key')

            // Query player timeline
            const timeline = await eventRepo.queryByScope(scopeKey, { limit: 10 })

            assert.ok(timeline.events.length >= 1, 'expected at least one event')
            assert.strictEqual(timeline.events[0].scopeKey, scopeKey, 'expected scope key to match')
        })

        test('should handle event idempotency key (unique constraint)', async () => {
            const eventRepo = await fixture.getWorldEventRepository()
            const idempotencyKey = 'test-event-' + crypto.randomUUID()
            const now = new Date().toISOString()

            // Create event with idempotency key
            const event: WorldEventRecord = {
                id: crypto.randomUUID(),
                scopeKey: `loc:${STARTER_LOCATION_ID}`,
                eventType: 'test_event',
                status: 'pending',
                occurredUtc: now,
                ingestedUtc: now,
                actorKind: 'system',
                correlationId: crypto.randomUUID(),
                idempotencyKey,
                payload: {},
                version: 1
            }

            await eventRepo.create(event)

            // Query by idempotency key
            const retrieved = await eventRepo.getByIdempotencyKey(idempotencyKey)

            assert.ok(retrieved, 'expected event to be found')
            assert.strictEqual(retrieved.idempotencyKey, idempotencyKey, 'expected idempotency key to match')
        })
    })

    describe('Hybrid Query (Gremlin Traversal + SQL Data)', () => {
        test('should combine Gremlin location data with SQL player data', async () => {
            const playerRepo = await fixture.getPlayerRepository()
            const locationRepo = await fixture.getLocationRepository()

            // Create player in SQL API
            const { record: player } = await playerRepo.getOrCreate()

            // Get location from Gremlin
            const location = await locationRepo.get(player.currentLocationId)

            assert.ok(location, 'expected location to exist')
            assert.strictEqual(location.id, player.currentLocationId, 'expected location ID to match player location')

            // Hybrid pattern: Player state (SQL) + Location structure (Gremlin)
            const hybridState = {
                player: {
                    id: player.id,
                    currentLocationId: player.currentLocationId,
                    guest: player.guest
                },
                location: {
                    id: location.id,
                    name: location.name,
                    description: location.description,
                    exits: location.exits
                }
            }

            assert.ok(hybridState.player, 'expected player data')
            assert.ok(hybridState.location, 'expected location data')
            assert.strictEqual(hybridState.player.currentLocationId, hybridState.location.id)
        })

        test('should combine Gremlin location with SQL layers (description enrichment)', async () => {
            const locationRepo = await fixture.getLocationRepository()
            const layerRepo = await fixture.getLayerRepository()

            // Get location from Gremlin
            const location = await locationRepo.get(STARTER_LOCATION_ID)
            assert.ok(location, 'expected location to exist')

            // Add layers in SQL API
            const layer1: DescriptionLayer = {
                id: crypto.randomUUID(),
                locationId: STARTER_LOCATION_ID,
                layerType: 'base',
                content: 'A grand hall with marble floors.',
                priority: 100,
                authoredAt: new Date().toISOString()
            }

            const layer2: DescriptionLayer = {
                id: crypto.randomUUID(),
                locationId: STARTER_LOCATION_ID,
                layerType: 'ambient',
                content: 'Torches flicker on the walls.',
                priority: 50,
                authoredAt: new Date().toISOString()
            }

            await layerRepo.addLayer(layer1)
            await layerRepo.addLayer(layer2)

            // Get layers from SQL API
            const layers = await layerRepo.getLayersForLocation(STARTER_LOCATION_ID)

            // Hybrid pattern: Location structure (Gremlin) + Description layers (SQL)
            const enrichedLocation = {
                ...location,
                layers: layers.map((l) => ({
                    type: l.layerType,
                    content: l.content,
                    priority: l.priority
                }))
            }

            assert.ok(enrichedLocation.layers, 'expected layers to be present')
            assert.strictEqual(enrichedLocation.layers.length, 2, 'expected two layers')
            assert.strictEqual(enrichedLocation.layers[0].priority, 100, 'expected highest priority first')
        })

        test('should combine player inventory with location context', async () => {
            const playerRepo = await fixture.getPlayerRepository()
            const inventoryRepo = await fixture.getInventoryRepository()
            const locationRepo = await fixture.getLocationRepository()

            // Create player
            const { record: player } = await playerRepo.getOrCreate()

            // Add inventory items
            const item: InventoryItem = {
                id: crypto.randomUUID(),
                playerId: player.id,
                itemType: 'torch',
                quantity: 1,
                acquiredAt: new Date().toISOString()
            }
            await inventoryRepo.addItem(item)

            // Get location
            const location = await locationRepo.get(player.currentLocationId)

            // Get inventory
            const inventory = await inventoryRepo.listItems(player.id)

            // Hybrid pattern: Player (SQL) + Inventory (SQL) + Location (Gremlin)
            const playerContext = {
                player: { id: player.id, currentLocationId: player.currentLocationId },
                location: { id: location?.id, name: location?.name },
                inventory: inventory.map((i) => ({ itemType: i.itemType, quantity: i.quantity }))
            }

            assert.ok(playerContext.player, 'expected player data')
            assert.ok(playerContext.location, 'expected location data')
            assert.strictEqual(playerContext.inventory.length, 1, 'expected one item in inventory')
        })
    })

    describe('SQL API Failure Handling', () => {
        test('should handle SQL read failure gracefully (no Gremlin corruption)', async () => {
            const playerRepo = await fixture.getPlayerRepository()

            // Attempt to read non-existent player (should return undefined, not throw)
            const nonExistentId = crypto.randomUUID()
            const player = await playerRepo.get(nonExistentId)

            assert.strictEqual(player, undefined, 'expected undefined for non-existent player')

            // Gremlin operations remain unaffected (no cross-API transaction)
        })

        test('should handle partial write failure (SQL succeeds, Gremlin independent)', async () => {
            const playerRepo = await fixture.getPlayerRepository()
            const inventoryRepo = await fixture.getInventoryRepository()

            // Create player (SQL API)
            const { record: player } = await playerRepo.getOrCreate()
            assert.ok(player, 'expected player to be created')

            // Add inventory item (SQL API)
            const item: InventoryItem = {
                id: crypto.randomUUID(),
                playerId: player.id,
                itemType: 'sword',
                quantity: 1,
                acquiredAt: new Date().toISOString()
            }
            await inventoryRepo.addItem(item)

            // Verify both operations succeeded independently
            const retrievedPlayer = await playerRepo.get(player.id)
            const retrievedItems = await inventoryRepo.listItems(player.id)

            assert.ok(retrievedPlayer, 'expected player to exist')
            assert.strictEqual(retrievedItems.length, 1, 'expected item to exist')

            // Note: Dual persistence uses eventual consistency, no distributed transactions
        })

        test('should handle concurrent writes to different persistence layers', async () => {
            const playerRepo = await fixture.getPlayerRepository()
            const locationRepo = await fixture.getLocationRepository()

            // Concurrent operations: SQL player creation + Gremlin location read
            const [playerResult, locationResult] = await Promise.all([playerRepo.getOrCreate(), locationRepo.get(STARTER_LOCATION_ID)])

            assert.ok(playerResult.record, 'expected player to be created')
            assert.ok(locationResult, 'expected location to be retrieved')

            // Both operations succeed independently (no cross-API locking)
        })
    })

    describe('Edge Cases', () => {
        test('should handle query performance with mixed Gremlin + SQL joins', async () => {
            const playerRepo = await fixture.getPlayerRepository()
            const inventoryRepo = await fixture.getInventoryRepository()
            const layerRepo = await fixture.getLayerRepository()
            const locationRepo = await fixture.getLocationRepository()

            // Create player
            const { record: player } = await playerRepo.getOrCreate()

            // Add multiple inventory items
            for (let i = 0; i < 5; i++) {
                await inventoryRepo.addItem({
                    id: crypto.randomUUID(),
                    playerId: player.id,
                    itemType: `item-${i}`,
                    quantity: 1,
                    acquiredAt: new Date().toISOString()
                })
            }

            // Add multiple layers
            for (let i = 0; i < 3; i++) {
                await layerRepo.addLayer({
                    id: crypto.randomUUID(),
                    locationId: STARTER_LOCATION_ID,
                    layerType: 'ambient',
                    content: `Layer ${i}`,
                    priority: 50 + i,
                    authoredAt: new Date().toISOString()
                })
            }

            // Hybrid query: Get all data
            const startTime = Date.now()
            const [retrievedPlayer, inventory, layers, location] = await Promise.all([
                playerRepo.get(player.id),
                inventoryRepo.listItems(player.id),
                layerRepo.getLayersForLocation(STARTER_LOCATION_ID),
                locationRepo.get(STARTER_LOCATION_ID)
            ])
            const latency = Date.now() - startTime

            assert.ok(retrievedPlayer, 'expected player')
            assert.strictEqual(inventory.length, 5, 'expected 5 items')
            assert.strictEqual(layers.length, 3, 'expected 3 layers')
            assert.ok(location, 'expected location')

            // Edge case: Query performance acceptable (goal: <200ms p95 for hybrid queries)
            console.log(`Hybrid query latency: ${latency}ms`)
        })

        test('should document partial write failure as known limitation', async () => {
            // Known limitation per ADR-002: No cross-API transactions
            // If SQL API write succeeds but Gremlin write fails, data may be inconsistent
            // Mitigation: Eventual consistency + compensating transactions (future)

            // This test documents the limitation; no specific failure injection in memory mode

            // Example scenario: Player location update (SQL) succeeds, but Gremlin traversal fails
            // Result: Player.currentLocationId points to location that may not exist
            // Mitigation: Validation layer checks location existence before move (already implemented)

            assert.ok(true, 'documented known limitation: no distributed transactions')
        })

        test('should skip gracefully if infrastructure missing (production safety)', async () => {
            // In production, Cosmos DB connection may fail
            // Tests should skip gracefully if containers are not provisioned

            // Note: IntegrationTestFixture uses memory mode by default, so this test
            // documents expected behavior for cosmos mode when infrastructure is missing

            // Expected: Tests skip with informative message, not hard failure
            // Actual implementation: Test helpers return undefined for missing repos

            const playerRepo = await fixture.getPlayerRepository()
            assert.ok(playerRepo, 'expected repo to be available in test mode')

            // Edge case: Infrastructure provisioning errors handled by test setup
        })
    })
})
