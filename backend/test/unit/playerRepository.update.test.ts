/**
 * Unit tests for IPlayerRepository.update() method
 * Tests both SQL and in-memory implementations
 */

import { STARTER_LOCATION_ID } from '@piquet-h/shared'
import type { PlayerRecord } from '@piquet-h/shared/types/playerRepository'
import assert from 'node:assert'
import { describe, test } from 'node:test'
import { InMemoryPlayerRepository } from '../../src/repos/playerRepository.memory.js'

describe('PlayerRepository.update()', () => {
    describe('InMemoryPlayerRepository', () => {
        test('should update existing player location', async () => {
            const repo = new InMemoryPlayerRepository()
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
            const repo = new InMemoryPlayerRepository()
            const { record: player } = await repo.getOrCreate()

            player.name = 'TestPlayer'
            const updated = await repo.update(player)

            assert.strictEqual(updated.name, 'TestPlayer')
        })

        test('should update guest status', async () => {
            const repo = new InMemoryPlayerRepository()
            const { record: player } = await repo.getOrCreate()

            player.guest = false
            const updated = await repo.update(player)

            assert.strictEqual(updated.guest, false)
        })

        test('should update updatedUtc timestamp', async () => {
            const repo = new InMemoryPlayerRepository()
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
            const repo = new InMemoryPlayerRepository()
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
            const repo = new InMemoryPlayerRepository()
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
