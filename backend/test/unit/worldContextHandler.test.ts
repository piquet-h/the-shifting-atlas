/* eslint-disable @typescript-eslint/no-explicit-any */
import type { InvocationContext } from '@azure/functions'
import { STARTER_LOCATION_ID } from '@piquet-h/shared'
import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import sinon from 'sinon'
import { WorldContextHandler } from '../../src/handlers/mcp/world-context/world-context.js'

function makeContext(): InvocationContext {
    // Minimal InvocationContext mock for tests
    return {
        invocationId: 'test-invocation',
        bindings: {},
        bindingData: {},
        traceContext: {},
        bindingDefinitions: [],
        // Provide a function-style logger (Azure Functions context.log is a function)
        log: (() => {}) as unknown as ((msg?: unknown, ...params: unknown[]) => void) & {
            verbose?: (...args: unknown[]) => void
            info?: (...args: unknown[]) => void
            warn?: (...args: unknown[]) => void
            error?: (...args: unknown[]) => void
        }
    } as unknown as InvocationContext
}

describe('WorldContextHandler', () => {
    it('health returns ok JSON', async () => {
        const handler = new WorldContextHandler(
            { get: sinon.stub() } as unknown as any,
            { getExits: sinon.stub() } as unknown as any,
            { getContainingRealms: sinon.stub() } as unknown as any,
            { getActiveLayerForLocation: sinon.stub() } as unknown as any,
            { getCurrentTick: sinon.stub().resolves(0) } as unknown as any,
            { listPlayersAtLocation: sinon.stub().resolves([]) } as unknown as any,
            { listItems: sinon.stub().resolves([]) } as unknown as any,
            { queryByScope: sinon.stub().resolves({ events: [], ruCharge: 0, latencyMs: 0, hasMore: false }) } as unknown as any
        )
        const ctx = makeContext()
        const result = await handler.health({ arguments: {} }, ctx)

        const parsed = JSON.parse(result)
        assert.equal(parsed.ok, true)
        assert.equal(parsed.service, 'world-context')
    })

    it('getLocationContext returns location, exits, realms, and ambient summary', async () => {
        const locationRepo = { get: sinon.stub() }
        const exitRepo = { getExits: sinon.stub() }
        const realmService = { getContainingRealms: sinon.stub() }
        const layerRepo = { getActiveLayerForLocation: sinon.stub() }
        const worldClock = { getCurrentTick: sinon.stub().resolves(123) }
        const playerDocRepo = { listPlayersAtLocation: sinon.stub().resolves([]) }
        const inventoryRepo = { listItems: sinon.stub().resolves([]) }
        const worldEventRepo = { queryByScope: sinon.stub().resolves({ events: [], ruCharge: 0, latencyMs: 0, hasMore: false }) }

        locationRepo.get.resolves({ id: STARTER_LOCATION_ID, name: 'Starter', description: 'A place', exits: [] })
        exitRepo.getExits.resolves([{ direction: 'north', to: 'loc-2' }])
        realmService.getContainingRealms.resolves([
            { id: 'r1', name: 'Market District', realmType: 'DISTRICT', scope: 'LOCAL', narrativeTags: ['bustling'] },
            { id: 'r2', name: 'Faerûn', realmType: 'CONTINENT', scope: 'GLOBAL', narrativeTags: ['ancient'] }
        ])
        layerRepo.getActiveLayerForLocation.resolves({
            id: 'layer-1',
            scopeId: `loc:${STARTER_LOCATION_ID}`,
            layerType: 'ambient',
            value: 'Market vendors call out their wares.',
            effectiveFromTick: 0,
            effectiveToTick: null,
            authoredAt: new Date().toISOString()
        })

        const handler = new WorldContextHandler(
            locationRepo as unknown as any,
            exitRepo as unknown as any,
            realmService as unknown as any,
            layerRepo as unknown as any,
            worldClock as unknown as any,
            playerDocRepo as unknown as any,
            inventoryRepo as unknown as any,
            worldEventRepo as unknown as any
        )

        const ctx = makeContext()
        const result = await handler.getLocationContext({ arguments: {} }, ctx)
        const parsed = JSON.parse(result)

        assert.equal(parsed.location.id, STARTER_LOCATION_ID)
        assert.equal(parsed.tick, 123)
        assert.ok(Array.isArray(parsed.exits))
        assert.equal(parsed.exits[0].direction, 'north')

        assert.ok(parsed.realms)
        assert.ok(Array.isArray(parsed.realms.political))
        assert.ok(Array.isArray(parsed.realms.geographic))

        assert.ok(parsed.ambient)
        assert.equal(parsed.ambient.present, true)
        assert.equal(parsed.ambient.layerType, 'ambient')
        assert.equal(parsed.ambient.scopeId, `loc:${STARTER_LOCATION_ID}`)
        assert.ok(typeof parsed.ambient.valuePreview === 'string')

        assert.ok(Array.isArray(parsed.nearbyPlayers))
        assert.ok(Array.isArray(parsed.recentEvents))
    })

    it('getPlayerContext returns player, inventory, and recent events', async () => {
        const playerId = 'player-1'
        const locationId = STARTER_LOCATION_ID

        const locationRepo = { get: sinon.stub().resolves({ id: locationId, name: 'Starter' }) }
        const exitRepo = { getExits: sinon.stub() }
        const realmService = { getContainingRealms: sinon.stub() }
        const layerRepo = { getActiveLayerForLocation: sinon.stub() }
        const worldClock = { getCurrentTick: sinon.stub().resolves(5000) }

        const playerDocRepo = {
            getPlayer: sinon.stub().resolves({ id: playerId, createdUtc: 'now', updatedUtc: 'now', currentLocationId: locationId })
        }

        const inventoryRepo = {
            listItems: sinon.stub().resolves([{ id: 'item-1', playerId, itemType: 'potion', quantity: 1, acquiredAt: 'now' }])
        }

        const worldEventRepo = {
            queryByScope: sinon.stub().resolves({ events: [{ id: 'e1' }], ruCharge: 1, latencyMs: 1, hasMore: false })
        }

        const handler = new WorldContextHandler(
            locationRepo as unknown as any,
            exitRepo as unknown as any,
            realmService as unknown as any,
            layerRepo as unknown as any,
            worldClock as unknown as any,
            playerDocRepo as unknown as any,
            inventoryRepo as unknown as any,
            worldEventRepo as unknown as any
        )

        const ctx = makeContext()
        const result = await handler.getPlayerContext({ arguments: { playerId } }, ctx)
        const parsed = JSON.parse(result)

        assert.equal(parsed.player.id, playerId)
        assert.equal(parsed.location.id, locationId)
        assert.ok(Array.isArray(parsed.inventory))
        assert.equal(parsed.inventory.length, 1)
        assert.ok(Array.isArray(parsed.recentEvents))
        assert.equal(parsed.recentEvents.length, 1)
    })

    it('getAtmosphere returns defaults when no data (clear/noon/calm)', async () => {
        const locationRepo = { get: sinon.stub() }
        const exitRepo = { getExits: sinon.stub() }
        const realmService = { getContainingRealms: sinon.stub() }
        const layerRepo = { getActiveLayerForLocation: sinon.stub().resolves(null) }
        const worldClock = { getCurrentTick: sinon.stub().resolves(0) }
        const playerDocRepo = { listPlayersAtLocation: sinon.stub().resolves([]) }
        const inventoryRepo = { listItems: sinon.stub().resolves([]) }
        const worldEventRepo = { queryByScope: sinon.stub().resolves({ events: [], ruCharge: 0, latencyMs: 0, hasMore: false }) }

        const handler = new WorldContextHandler(
            locationRepo as unknown as any,
            exitRepo as unknown as any,
            realmService as unknown as any,
            layerRepo as unknown as any,
            worldClock as unknown as any,
            playerDocRepo as unknown as any,
            inventoryRepo as unknown as any,
            worldEventRepo as unknown as any
        )

        const ctx = makeContext()
        const result = await handler.getAtmosphere({ arguments: { locationId: STARTER_LOCATION_ID } }, ctx)
        const parsed = JSON.parse(result)

        assert.equal(parsed.timeOfDay, 'noon')
        assert.equal(parsed.weather.value, 'clear')
        assert.equal(parsed.ambient.value, 'calm')
    })
})
