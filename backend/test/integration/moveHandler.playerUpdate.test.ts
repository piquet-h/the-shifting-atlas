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

        // Initialize handler context
        await handler.handle(mockRequest, ctx)

        // Execute move through handler
        const result = await handler.performMove(mockRequest)

        // Verify move succeeded
        assert.strictEqual(result.success, true, 'move should succeed')
        assert.ok(result.location, 'should return new location')

        // Verify player location was updated in repository
        const updatedPlayer = await playerRepo.get(player.id)
        assert.ok(updatedPlayer, 'player should still exist')
        assert.strictEqual(updatedPlayer.currentLocationId, result.location?.id, 'player location should be updated to new location')
        assert.notStrictEqual(updatedPlayer.currentLocationId, hubLocation.id, 'player should have moved from hub')
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
        await handler1.handle(request1, ctx1)
        const result1 = await handler1.performMove(request1)

        assert.strictEqual(result1.success, true)

        const newLocationId = result1.location?.id
        assert.ok(newLocationId, 'should have new location')

        // Simulate reconnect - new handler instance, fetch player from repo
        const reconnectedPlayer = await playerRepo.get(player.id)
        assert.ok(reconnectedPlayer, 'player should be retrievable')
        assert.strictEqual(reconnectedPlayer.currentLocationId, newLocationId, 'player location should persist across sessions')

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
        await handler2.handle(request2, ctx2)
        const result2 = await handler2.performMove(request2)

        assert.strictEqual(result2.success, true)

        // Verify location updated again
        const finalPlayer = await playerRepo.get(player.id)
        assert.strictEqual(finalPlayer?.currentLocationId, result2.location?.id, 'second move should update location')
    })

    test('MoveHandler handles missing player gracefully', async () => {
        const container = await fixture.getContainer()
        const locationRepo = await fixture.getLocationRepository()
        const playerRepo = await fixture.getPlayerRepository()

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

        // Move should still succeed (stateless operation)
        const result = await handler.performMove(mockRequest)
        assert.strictEqual(result.success, true, 'move should succeed even if player update fails')
        assert.ok(result.location, 'should return new location')
    })
})
