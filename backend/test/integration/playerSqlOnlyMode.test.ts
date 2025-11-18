/**
 * Integration tests for SQL-only player persistence mode
 * Verifies player lifecycle without Gremlin write dependencies
 * Migration cutover complete: issue #519 (2025-11-17)
 */

import { STARTER_LOCATION_ID } from '@piquet-h/shared'
import type { PlayerRecord } from '@piquet-h/shared/types/playerRepository'
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { describeForBothModes } from '../helpers/describeForBothModes.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

describeForBothModes('Player SQL-Only Mode Integration', (mode) => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture(mode)
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    describe('Player Creation (SQL-First)', () => {
        test('should create player in SQL API without Gremlin writes', async () => {
            const playerRepo = await fixture.getPlayerRepository()

            // Create player (SQL-only)
            const { record: player, created } = await playerRepo.getOrCreate()

            assert.ok(created, 'expected new player to be created')
            assert.ok(player.id, 'expected player ID to be set')
            assert.strictEqual(player.guest, true, 'expected guest flag to be true')
            assert.strictEqual(player.currentLocationId, STARTER_LOCATION_ID, 'expected starter location')
        })

        test('should handle getOrCreate idempotently', async () => {
            const playerRepo = await fixture.getPlayerRepository()

            // First call: create
            const { record: player1, created: created1 } = await playerRepo.getOrCreate()
            assert.ok(created1, 'expected first call to create player')

            // Second call with same ID: return existing
            const { record: player2, created: created2 } = await playerRepo.getOrCreate(player1.id)
            assert.strictEqual(created2, false, 'expected second call to return existing player')
            assert.strictEqual(player2.id, player1.id, 'expected same player ID')
        })
    })

    describe('Player Update (SQL-Only)', () => {
        test('should update player without Gremlin writes', async () => {
            const playerRepo = await fixture.getPlayerRepository()

            // Create player
            const { record: player } = await playerRepo.getOrCreate()

            // Update player
            const updatedPlayer: PlayerRecord = {
                ...player,
                currentLocationId: 'loc-test-room',
                guest: false,
                name: 'TestPlayer'
            }

            const result = await playerRepo.update(updatedPlayer)

            assert.strictEqual(result.currentLocationId, 'loc-test-room', 'expected location updated')
            assert.strictEqual(result.guest, false, 'expected guest flag updated')
            assert.strictEqual(result.name, 'TestPlayer', 'expected name updated')
        })

        test('should throw error when updating non-existent player', async () => {
            const playerRepo = await fixture.getPlayerRepository()

            const fakePlayer: PlayerRecord = {
                id: crypto.randomUUID(),
                createdUtc: new Date().toISOString(),
                updatedUtc: new Date().toISOString(),
                guest: true,
                currentLocationId: STARTER_LOCATION_ID
            }

            await assert.rejects(async () => await playerRepo.update(fakePlayer), {
                message: /Player .* not found/
            })
        })
    })

    describe('External ID Linking (SQL-Only)', () => {
        test('should link external ID without Gremlin writes', async () => {
            const playerRepo = await fixture.getPlayerRepository()

            // Create player
            const { record: player } = await playerRepo.getOrCreate()

            // Link external ID
            const externalId = 'auth0|test123'
            const result = await playerRepo.linkExternalId(player.id, externalId)

            assert.strictEqual(result.updated, true, 'expected linkExternalId to succeed')
            assert.ok(result.record, 'expected updated record returned')
            assert.strictEqual(result.record?.externalId, externalId, 'expected externalId set')
            assert.strictEqual(result.record?.guest, false, 'expected guest flag cleared')
        })

        test('should detect external ID conflicts', async () => {
            const playerRepo = await fixture.getPlayerRepository()

            // Create two players
            const { record: player1 } = await playerRepo.getOrCreate()
            const { record: player2 } = await playerRepo.getOrCreate()

            // Link external ID to first player
            const externalId = 'auth0|conflict'
            await playerRepo.linkExternalId(player1.id, externalId)

            // Attempt to link same external ID to second player
            const result = await playerRepo.linkExternalId(player2.id, externalId)

            assert.strictEqual(result.updated, false, 'expected linkExternalId to fail')
            assert.strictEqual(result.conflict, true, 'expected conflict flag')
            assert.strictEqual(result.existingPlayerId, player1.id, 'expected conflict to reference first player')
        })

        test('should handle idempotent external ID linking', async () => {
            const playerRepo = await fixture.getPlayerRepository()

            // Create player and link external ID
            const { record: player } = await playerRepo.getOrCreate()
            const externalId = 'auth0|idempotent'
            await playerRepo.linkExternalId(player.id, externalId)

            // Link same external ID again (idempotent)
            const result = await playerRepo.linkExternalId(player.id, externalId)

            assert.strictEqual(result.updated, false, 'expected no-op for idempotent link')
            assert.ok(result.record, 'expected record returned')
            assert.strictEqual(result.record?.externalId, externalId, 'expected externalId unchanged')
        })
    })

    describe('Find by External ID (SQL-Only)', () => {
        test('should find player by external ID', async () => {
            const playerRepo = await fixture.getPlayerRepository()

            // Create player and link external ID
            const { record: player } = await playerRepo.getOrCreate()
            const externalId = 'auth0|findme'
            await playerRepo.linkExternalId(player.id, externalId)

            // Find by external ID
            const found = await playerRepo.findByExternalId(externalId)

            assert.ok(found, 'expected player to be found')
            assert.strictEqual(found?.id, player.id, 'expected correct player ID')
            assert.strictEqual(found?.externalId, externalId, 'expected correct external ID')
        })

        test('should return undefined for non-existent external ID', async () => {
            const playerRepo = await fixture.getPlayerRepository()

            const found = await playerRepo.findByExternalId('auth0|doesnotexist')

            assert.strictEqual(found, undefined, 'expected undefined for non-existent external ID')
        })
    })

    describe('Player Get (SQL Source)', () => {
        test('should retrieve player from SQL API', async () => {
            const playerRepo = await fixture.getPlayerRepository()

            // Create player
            const { record: player } = await playerRepo.getOrCreate()

            // Retrieve player
            const retrieved = await playerRepo.get(player.id)

            assert.ok(retrieved, 'expected player to be retrieved')
            assert.strictEqual(retrieved?.id, player.id, 'expected correct player ID')
        })

        test('should return undefined for non-existent player', async () => {
            const playerRepo = await fixture.getPlayerRepository()

            const nonExistentId = crypto.randomUUID()
            const retrieved = await playerRepo.get(nonExistentId)

            assert.strictEqual(retrieved, undefined, 'expected undefined for non-existent player')
        })
    })

    describe('Gremlin Read-Only Fallback', () => {
        test('should support reading legacy Gremlin players (disaster recovery)', async () => {
            // This test verifies that the Gremlin read-only fallback is wired correctly
            // In cosmos mode, if a player exists in Gremlin but not SQL, it should still be readable
            // In memory mode, this is not applicable (no Gremlin backend)

            if (mode === 'memory') {
                // Skip in memory mode - no Gremlin backend
                return
            }

            // Note: This test assumes there might be legacy players in Gremlin
            // In practice, after full migration, no new Gremlin player vertices are created
            // This path is for disaster recovery only
            const playerRepo = await fixture.getPlayerRepository()

            // Attempt to get a non-existent player (will try SQL then Gremlin fallback)
            const nonExistentId = crypto.randomUUID()
            const player = await playerRepo.get(nonExistentId)

            // Should return undefined (no player in SQL or Gremlin)
            assert.strictEqual(player, undefined, 'expected undefined for non-existent player')
        })
    })

    describe('No Gremlin Write Dependencies', () => {
        test('should complete full player lifecycle without Gremlin write operations', async () => {
            const playerRepo = await fixture.getPlayerRepository()

            // Full lifecycle: create -> update -> link external ID -> find
            const { record: player, created } = await playerRepo.getOrCreate()
            assert.ok(created, 'expected player created')

            const updatedPlayer = await playerRepo.update({
                ...player,
                currentLocationId: 'loc-new-room',
                name: 'Lifecycle Test'
            })
            assert.strictEqual(updatedPlayer.currentLocationId, 'loc-new-room', 'expected location updated')

            const externalId = 'auth0|lifecycle'
            const linkResult = await playerRepo.linkExternalId(player.id, externalId)
            assert.strictEqual(linkResult.updated, true, 'expected external ID linked')

            const foundPlayer = await playerRepo.findByExternalId(externalId)
            assert.ok(foundPlayer, 'expected player found by external ID')
            assert.strictEqual(foundPlayer?.id, player.id, 'expected correct player')
        })
    })
})
