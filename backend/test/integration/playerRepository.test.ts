import { STARTER_LOCATION_ID } from '@piquet-h/shared'
import type { PlayerRecord } from '@piquet-h/shared/types/playerRepository'
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { describeForBothModes } from '../helpers/describeForBothModes.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

describeForBothModes('Player Repository', (mode) => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture(mode)
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    describe('getOrCreate()', () => {
        test('assigns starting location', async () => {
            const repo = await fixture.getPlayerRepository()
            const { record, created } = await repo.getOrCreate()
            assert.ok(created, 'expected new record')
            const currentLocationId = (record as PlayerRecord).currentLocationId
            assert.ok(currentLocationId, 'currentLocationId should be set')
            // Accept either STARTER_LOCATION_ID or process.env.START_LOCATION_ID
            const expectedLocationId = process.env.START_LOCATION_ID || STARTER_LOCATION_ID
            assert.strictEqual(currentLocationId, expectedLocationId)
        })
    })

    describe('update()', () => {
        test('should update existing player location', async () => {
            const repo = await fixture.getPlayerRepository()
            const { record: player } = await repo.getOrCreate()

            // Verify initial location
            assert.strictEqual(player.currentLocationId, STARTER_LOCATION_ID)

            // Update location
            const newLocationId = 'new-location-123'
            player.currentLocationId = newLocationId
            const updated = await repo.update(player)

            // Verify update succeeded
            assert.strictEqual(updated.currentLocationId, newLocationId)
            assert.ok(updated.updatedUtc, 'updatedUtc should be set')

            // Verify persistence
            const retrieved = await repo.get(player.id)
            assert.ok(retrieved, 'player should still exist')
            assert.strictEqual(retrieved.currentLocationId, newLocationId)
        })

        test('should update player name', async () => {
            const repo = await fixture.getPlayerRepository()
            const { record: player } = await repo.getOrCreate()

            player.name = 'TestPlayer'
            const updated = await repo.update(player)

            assert.strictEqual(updated.name, 'TestPlayer')
        })

        test('should update guest status', async () => {
            const repo = await fixture.getPlayerRepository()
            const { record: player } = await repo.getOrCreate()

            player.guest = false
            const updated = await repo.update(player)

            assert.strictEqual(updated.guest, false)
        })

        test('should update updatedUtc timestamp', async () => {
            const repo = await fixture.getPlayerRepository()
            const { record: player } = await repo.getOrCreate()

            const originalUpdatedUtc = player.updatedUtc

            // Wait a tiny bit to ensure timestamp changes
            await new Promise((resolve) => setTimeout(resolve, 10))

            player.currentLocationId = 'new-location-456'
            const updated = await repo.update(player)

            assert.notStrictEqual(updated.updatedUtc, originalUpdatedUtc, 'updatedUtc should change')
            if (updated.updatedUtc && originalUpdatedUtc) {
                assert.ok(new Date(updated.updatedUtc) > new Date(originalUpdatedUtc), 'updatedUtc should be more recent')
            }
        })

        test('should throw error for non-existent player', async () => {
            const repo = await fixture.getPlayerRepository()
            const fakePlayer: PlayerRecord = {
                id: 'non-existent-player-id',
                createdUtc: new Date().toISOString(),
                updatedUtc: new Date().toISOString(),
                guest: true,
                currentLocationId: STARTER_LOCATION_ID
            }

            await assert.rejects(
                async () => await repo.update(fakePlayer),
                /Player.*not found/,
                'should throw error for non-existent player'
            )
        })

        test('should preserve other fields when updating location', async () => {
            const repo = await fixture.getPlayerRepository()
            const { record: player } = await repo.getOrCreate()

            // Set some fields
            player.name = 'OriginalName'
            player.externalId = 'external-123'
            await repo.update(player)

            // Update only location
            player.currentLocationId = 'new-location-789'
            const updated = await repo.update(player)

            // Verify other fields preserved
            assert.strictEqual(updated.name, 'OriginalName')
            assert.strictEqual(updated.externalId, 'external-123')
            assert.strictEqual(updated.currentLocationId, 'new-location-789')
        })
    })
})
