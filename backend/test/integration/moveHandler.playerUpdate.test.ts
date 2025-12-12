/**
 * End-to-end test verifying MoveHandler updates player location in repository
 * Tests the complete flow: handler invocation → location update → persistence
 */

import type { HttpRequest, InvocationContext } from '@azure/functions'
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { MoveHandler } from '../../src/handlers/moveCore.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'
import { getDefaultTestLocations, seedTestWorld } from '../helpers/seedTestWorld.js'

describe('MoveHandler Player Location Update (E2E)', () => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    /** Helper to create a mock InvocationContext with container */
    async function createMockContext(fixture: IntegrationTestFixture): Promise<InvocationContext> {
        const container = await fixture.getContainer()
        return {
            invocationId: 'test-invocation',
            functionName: 'test-function',
            extraInputs: new Map([['container', container]]),
            log: () => {},
            error: () => {},
            warn: () => {},
            info: () => {},
            debug: () => {},
            trace: () => {}
        } as unknown as InvocationContext
    }

    test('MoveHandler updates player location after successful move', async () => {
        const container = await fixture.getContainer()
        const locationRepo = await fixture.getLocationRepository()
        const playerRepo = await fixture.getPlayerRepository()

        // Seed test world
        const { locations } = await seedTestWorld({
            locationRepository: locationRepo,
            blueprint: getDefaultTestLocations()
        })

        // Create player
        const { record: player } = await playerRepo.getOrCreate()
        const hubLocation = locations[0] // Hub with north exit

        // Set player at hub
        player.currentLocationId = hubLocation.id
        await playerRepo.update(player)

        // Get MoveHandler from DI container
        const handler = container.get(MoveHandler)

        // Create mock request with player GUID in headers
        const mockRequest = {
            json: async () => ({ direction: 'north', fromLocationId: hubLocation.id }),
            query: new Map(),
            headers: new Map([
                ['content-type', 'application/json'],
                ['x-player-guid', player.id]
            ])
        } as unknown as HttpRequest

        const ctx = await createMockContext(fixture)

        // Execute move through handler - this calls performMove() internally
        const response = await handler.handle(mockRequest, ctx)

        // Parse response to verify success
        assert.strictEqual(response.status, 200, 'move should return 200 OK')

        // Verify player location was updated in repository
        const updatedPlayer = await playerRepo.get(player.id)
        assert.ok(updatedPlayer, 'player should still exist')
        // Player should have moved from hub to north location
        assert.notStrictEqual(updatedPlayer.currentLocationId, hubLocation.id, 'player should have moved from hub')
        assert.strictEqual(updatedPlayer.currentLocationId, locations[1].id, 'player should be at north location')
    })

    test('MoveHandler uses path playerId when header is missing', async () => {
        const container = await fixture.getContainer()
        const locationRepo = await fixture.getLocationRepository()
        const playerRepo = await fixture.getPlayerRepository()

        // Seed test world
        const { locations } = await seedTestWorld({
            locationRepository: locationRepo,
            blueprint: getDefaultTestLocations()
        })

        // Create player
        const { record: player } = await playerRepo.getOrCreate()
        const hubLocation = locations[0]

        // Place player at hub
        player.currentLocationId = hubLocation.id
        await playerRepo.update(player)

        // Get MoveHandler from DI container
        const handler = container.get(MoveHandler)

        // Create mock request with playerId in path params only (no x-player-guid header)
        const mockRequest = {
            json: async () => ({ direction: 'north' }),
            query: new Map(),
            headers: new Map([['content-type', 'application/json']]),
            params: { playerId: player.id }
        } as unknown as HttpRequest

        const ctx = await createMockContext(fixture)

        const response = await handler.handle(mockRequest, ctx)

        assert.strictEqual(response.status, 200, 'move should succeed using path playerId when header missing')

        const updatedPlayer = await playerRepo.get(player.id)
        assert.ok(updatedPlayer, 'player should still exist')
        assert.strictEqual(
            updatedPlayer?.currentLocationId,
            locations[1].id,
            'player location should update when playerId comes from path params'
        )
    })

    test('player location persists across handler invocations (simulated reconnect)', async () => {
        const container = await fixture.getContainer()
        const locationRepo = await fixture.getLocationRepository()
        const playerRepo = await fixture.getPlayerRepository()

        // Seed world and create player
        const { locations } = await seedTestWorld({
            locationRepository: locationRepo,

            blueprint: getDefaultTestLocations()
        })

        const { record: player } = await playerRepo.getOrCreate()
        const hubLocation = locations[0]
        player.currentLocationId = hubLocation.id
        await playerRepo.update(player)

        // First move (initial session)
        const handler1 = container.get(MoveHandler)

        const request1 = {
            json: async () => ({ direction: 'north', fromLocationId: hubLocation.id }),
            query: new Map(),
            headers: new Map([
                ['content-type', 'application/json'],
                ['x-player-guid', player.id]
            ])
        } as unknown as HttpRequest

        const ctx1 = await createMockContext(fixture)
        const response1 = await handler1.handle(request1, ctx1)

        assert.strictEqual(response1.status, 200, 'first move should succeed')

        // Simulate reconnect - new handler instance, fetch player from repo
        const reconnectedPlayer = await playerRepo.get(player.id)
        assert.ok(reconnectedPlayer, 'player should be retrievable')
        // Player should have moved to north location
        assert.strictEqual(reconnectedPlayer.currentLocationId, locations[1].id, 'player location should persist across sessions')
        const newLocationId = reconnectedPlayer.currentLocationId

        // Second move from new location (reconnected session)
        const handler2 = container.get(MoveHandler)

        const request2 = {
            json: async () => ({ direction: 'south', fromLocationId: newLocationId }),
            query: new Map(),
            headers: new Map([
                ['content-type', 'application/json'],
                ['x-player-guid', player.id]
            ])
        } as unknown as HttpRequest

        const ctx2 = await createMockContext(fixture)
        const response2 = await handler2.handle(request2, ctx2)

        assert.strictEqual(response2.status, 200, 'second move should succeed')

        // Verify location updated again (should be back at hub)
        const finalPlayer = await playerRepo.get(player.id)
        assert.strictEqual(finalPlayer?.currentLocationId, hubLocation.id, 'second move should return to hub')
    })

    test('MoveHandler handles missing player gracefully', async () => {
        const container = await fixture.getContainer()
        const locationRepo = await fixture.getLocationRepository()

        // Seed world
        const { locations } = await seedTestWorld({
            locationRepository: locationRepo,

            blueprint: getDefaultTestLocations()
        })

        const hubLocation = locations[0]

        // Get handler with a non-existent player GUID
        const handler = container.get(MoveHandler)

        const mockRequest = {
            json: async () => ({ direction: 'north', fromLocationId: hubLocation.id }),
            query: new Map(),
            headers: new Map([
                ['content-type', 'application/json'],
                ['x-player-guid', crypto.randomUUID()] // Non-existent player
            ])
        } as unknown as HttpRequest

        const ctx = await createMockContext(fixture)
        await handler.handle(mockRequest, ctx)

        // Move should fail if player is missing (fail-fast consistency)
        const result = await handler.performMove(mockRequest)
        assert.strictEqual(result.success, false, 'move should fail if player update fails')
        assert.ok(result.error, 'should return error object')
        assert.strictEqual(result.error?.reason, 'player-not-found', 'error reason should be player-not-found')
    })
})
