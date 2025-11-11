/**
 * Integration test for player location persistence after movement
 * Verifies that player location is updated in SQL API after successful move
 */

import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'
import { getDefaultTestLocations, seedTestWorld } from '../helpers/seedTestWorld.js'

describe('Player Location Persistence', () => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    test('player location is persisted after successful move', async () => {
        const locationRepo = await fixture.getLocationRepository()
        const playerRepo = await fixture.getPlayerRepository()

        // Seed test world
        const { locations } = await seedTestWorld({
            locationRepository: locationRepo,
            playerRepository: playerRepo,
            blueprint: getDefaultTestLocations()
        })

        // Create a player
        const { record: player } = await playerRepo.getOrCreate()
        const hubLocation = locations[0] // Hub location with north exit

        // Set player at hub location
        player.currentLocationId = hubLocation.id
        await playerRepo.update(player)

        // Verify initial location
        const playerBefore = await playerRepo.get(player.id)
        assert.ok(playerBefore, 'player should exist')
        assert.strictEqual(playerBefore.currentLocationId, hubLocation.id, 'player should be at hub initially')

        // Perform move to north
        const moveResult = await locationRepo.move(hubLocation.id, 'north')
        assert.strictEqual(moveResult.status, 'ok', 'move should succeed')

        // For this test, we need to manually update player location since we're testing the repository
        // In production, MoveHandler does this automatically
        if (moveResult.status === 'ok') {
            player.currentLocationId = moveResult.location.id
            await playerRepo.update(player)
        }

        // Verify location was persisted
        const playerAfter = await playerRepo.get(player.id)
        assert.ok(playerAfter, 'player should still exist')
        assert.strictEqual(
            playerAfter.currentLocationId,
            moveResult.status === 'ok' ? moveResult.location.id : hubLocation.id,
            'player location should be updated to new location'
        )
        assert.notStrictEqual(playerAfter.currentLocationId, hubLocation.id, 'player should have moved from hub')
    })

    test('player location survives reconnect (get after update)', async () => {
        const locationRepo = await fixture.getLocationRepository()
        const playerRepo = await fixture.getPlayerRepository()

        // Seed test world
        const { locations } = await seedTestWorld({
            locationRepository: locationRepo,
            playerRepository: playerRepo,
            blueprint: getDefaultTestLocations()
        })

        // Create player and move them
        const { record: player } = await playerRepo.getOrCreate()
        const hubLocation = locations[0]
        player.currentLocationId = hubLocation.id
        await playerRepo.update(player)

        // Move to north
        const moveResult = await locationRepo.move(hubLocation.id, 'north')
        assert.strictEqual(moveResult.status, 'ok')

        if (moveResult.status === 'ok') {
            player.currentLocationId = moveResult.location.id
            await playerRepo.update(player)
        }

        // Simulate reconnect - get player from repo
        const reconnectedPlayer = await playerRepo.get(player.id)
        assert.ok(reconnectedPlayer, 'player should be retrievable')
        assert.strictEqual(
            reconnectedPlayer.currentLocationId,
            moveResult.status === 'ok' ? moveResult.location.id : hubLocation.id,
            'player should be at new location after reconnect'
        )
    })

    test('multiple moves update location correctly', async () => {
        const locationRepo = await fixture.getLocationRepository()
        const playerRepo = await fixture.getPlayerRepository()

        // Seed test world with locations that form a path
        const { locations } = await seedTestWorld({
            locationRepository: locationRepo,
            playerRepository: playerRepo,
            blueprint: getDefaultTestLocations()
        })

        // Create player at hub
        const { record: player } = await playerRepo.getOrCreate()
        const hubLocation = locations[0]
        player.currentLocationId = hubLocation.id
        await playerRepo.update(player)

        // Move north
        const move1 = await locationRepo.move(hubLocation.id, 'north')
        assert.strictEqual(move1.status, 'ok')
        if (move1.status === 'ok') {
            player.currentLocationId = move1.location.id
            await playerRepo.update(player)
        }

        // Verify location after first move
        const playerAfterMove1 = await playerRepo.get(player.id)
        assert.strictEqual(playerAfterMove1?.currentLocationId, move1.status === 'ok' ? move1.location.id : undefined)

        // Move back south to hub
        if (move1.status === 'ok') {
            const move2 = await locationRepo.move(move1.location.id, 'south')
            assert.strictEqual(move2.status, 'ok')
            if (move2.status === 'ok') {
                player.currentLocationId = move2.location.id
                await playerRepo.update(player)
            }

            // Verify location after second move (back to hub)
            const playerAfterMove2 = await playerRepo.get(player.id)
            assert.strictEqual(playerAfterMove2?.currentLocationId, hubLocation.id, 'player should be back at hub')
        }
    })

    test('update fails gracefully for non-existent player', async () => {
        const playerRepo = await fixture.getPlayerRepository()

        const fakePlayer = {
            id: crypto.randomUUID(),
            createdUtc: new Date().toISOString(),
            updatedUtc: new Date().toISOString(),
            guest: true,
            currentLocationId: 'some-location'
        }

        // Should throw error
        await assert.rejects(async () => {
            await playerRepo.update(fakePlayer)
        }, 'update should fail for non-existent player')
    })
})
