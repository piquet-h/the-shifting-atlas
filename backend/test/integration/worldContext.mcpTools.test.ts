import type { PlayerDoc } from '@piquet-h/shared'
import { STARTER_LOCATION_ID } from '@piquet-h/shared'
import type { InventoryItem } from '@piquet-h/shared/types/inventoryRepository'
import type { WorldEventRecord } from '@piquet-h/shared/types/worldEventRepository'
import { buildLocationScopeKey, buildPlayerScopeKey } from '@piquet-h/shared/types/worldEventRepository'
import { randomUUID } from 'crypto'
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { getAtmosphere, getLocationContext, getPlayerContext } from '../../src/handlers/mcp/world-context/world-context.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

describe('WorldContext MCP tools (integration)', () => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    test('getLocationContext includes nearbyPlayers and recentEvents', async () => {
        const locationRepo = await fixture.getLocationRepository()
        const playerRepo = await fixture.getPlayerDocRepository()
        const eventRepo = await fixture.getWorldEventRepository()

        const locationId = STARTER_LOCATION_ID
        const playerId = randomUUID()

        await locationRepo.upsert({
            id: locationId,
            name: 'Starter',
            description: 'A place',
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

        const evt: WorldEventRecord = {
            id: randomUUID(),
            scopeKey: buildLocationScopeKey(locationId),
            eventType: 'Player.Look',
            status: 'processed',
            occurredUtc: new Date().toISOString(),
            ingestedUtc: new Date().toISOString(),
            actorKind: 'player',
            actorId: playerId,
            correlationId: randomUUID(),
            idempotencyKey: `look-${Date.now()}`,
            payload: { locationId },
            version: 1
        }
        await eventRepo.create(evt)

        const context = await fixture.createInvocationContext()
        const result = await getLocationContext({ arguments: { locationId } }, context)
        const parsed = JSON.parse(result)

        assert.equal(parsed.location.id, locationId)
        assert.ok(Array.isArray(parsed.nearbyPlayers))
        assert.ok(parsed.nearbyPlayers.some((p: { id: string }) => p.id === playerId))
        assert.ok(Array.isArray(parsed.recentEvents))
        assert.ok(parsed.recentEvents.some((e: { id: string }) => e.id === evt.id))
    })

    test('getPlayerContext includes inventory and recentEvents', async () => {
        const locationRepo = await fixture.getLocationRepository()
        const playerRepo = await fixture.getPlayerDocRepository()
        const inventoryRepo = await fixture.getInventoryRepository()
        const eventRepo = await fixture.getWorldEventRepository()

        const locationId = STARTER_LOCATION_ID
        const playerId = randomUUID()

        await locationRepo.upsert({
            id: locationId,
            name: 'Starter',
            description: 'A place',
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

        const item: InventoryItem = {
            id: randomUUID(),
            playerId,
            itemType: 'potion',
            quantity: 1,
            acquiredAt: new Date().toISOString()
        }
        await inventoryRepo.addItem(item)

        const evt: WorldEventRecord = {
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
            payload: { locationId },
            version: 1
        }
        await eventRepo.create(evt)

        const context = await fixture.createInvocationContext()
        const result = await getPlayerContext({ arguments: { playerId } }, context)
        const parsed = JSON.parse(result)

        assert.equal(parsed.player.id, playerId)
        assert.ok(parsed.location)
        assert.equal(parsed.location.id, locationId)
        assert.ok(Array.isArray(parsed.inventory))
        assert.equal(parsed.inventory.length, 1)
        assert.ok(Array.isArray(parsed.recentEvents))
        assert.ok(parsed.recentEvents.some((e: { id: string }) => e.id === evt.id))
    })

    test('getAtmosphere returns defaults when layers are missing', async () => {
        const locationId = STARTER_LOCATION_ID

        const context = await fixture.createInvocationContext()
        const result = await getAtmosphere({ arguments: { locationId } }, context)
        const parsed = JSON.parse(result)

        assert.equal(parsed.locationId, locationId)
        assert.ok(typeof parsed.timeOfDay === 'string')
        assert.equal(parsed.weather.value, 'clear')
        assert.equal(parsed.ambient.value, 'calm')
    })
})
