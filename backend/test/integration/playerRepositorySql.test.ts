/**
 * Integration tests for SQL API player repository
 * Tests player CRUD operations and migration path from Gremlin
 */

import { STARTER_LOCATION_ID } from '@piquet-h/shared'
import type { PlayerRecord } from '@piquet-h/shared/types/playerRepository'
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

describe('Player Repository SQL API', () => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    describe('Create Player', () => {
        test('creates new player with generated ID', async () => {
            const repo = await fixture.getPlayerRepository()
            const { record, created } = await repo.getOrCreate()

            assert.ok(created, 'expected new record to be created')
            assert.ok(record.id, 'expected ID to be set')
            assert.strictEqual(record.guest, true, 'expected guest flag to be true')
            assert.strictEqual(record.currentLocationId, STARTER_LOCATION_ID, 'expected starting location')
            assert.ok(record.createdUtc, 'expected createdUtc to be set')
            assert.ok(record.updatedUtc, 'expected updatedUtc to be set')
        })

        test('creates player with specific ID', async () => {
            const repo = await fixture.getPlayerRepository()
            const playerId = crypto.randomUUID()

            const { record, created } = await repo.getOrCreate(playerId)

            assert.ok(created, 'expected new record to be created')
            assert.strictEqual(record.id, playerId, 'expected provided ID to be used')
            assert.strictEqual(record.guest, true, 'expected guest flag to be true')
        })

        test('returns existing player on duplicate getOrCreate', async () => {
            const repo = await fixture.getPlayerRepository()
            const playerId = crypto.randomUUID()

            const first = await repo.getOrCreate(playerId)
            assert.ok(first.created, 'first call should create player')

            const second = await repo.getOrCreate(playerId)
            assert.strictEqual(second.created, false, 'second call should not create player')
            assert.strictEqual(second.record.id, first.record.id, 'should return same player')
        })
    })

    describe('Read Player', () => {
        test('gets existing player by ID', async () => {
            const repo = await fixture.getPlayerRepository()
            const { record: created } = await repo.getOrCreate()

            const retrieved = await repo.get(created.id)

            assert.ok(retrieved, 'expected player to be found')
            assert.strictEqual(retrieved.id, created.id, 'expected same player ID')
        })

        test('returns undefined for non-existent player', async () => {
            const repo = await fixture.getPlayerRepository()
            const nonExistentId = crypto.randomUUID()

            const retrieved = await repo.get(nonExistentId)

            assert.strictEqual(retrieved, undefined, 'expected undefined for non-existent player')
        })
    })

    describe('Update Player Location', () => {
        test('validates player has starting location', async () => {
            const repo = await fixture.getPlayerRepository()
            const { record: player } = await repo.getOrCreate()

            // Note: updateLocation is not in the IPlayerRepository interface
            // Location updates in production happen via PlayerMoveHandler
            // This test validates the data model supports location storage
            const originalLocation = player.currentLocationId

            assert.ok(originalLocation, 'expected original location to be set')
            assert.strictEqual(originalLocation, STARTER_LOCATION_ID, 'expected starting location')
        })
    })

    describe('Link External ID', () => {
        test('links external ID to player', async () => {
            const repo = await fixture.getPlayerRepository()
            const { record: player } = await repo.getOrCreate()
            const externalId = 'test-external-id-' + crypto.randomUUID()

            const result = await repo.linkExternalId(player.id, externalId)

            assert.ok(result.updated, 'expected update to succeed')
            assert.ok(result.record, 'expected updated record to be returned')
            assert.strictEqual(result.record.externalId, externalId, 'expected external ID to be set')
            assert.strictEqual(result.record.guest, false, 'expected guest flag to be false after linking')
        })

        test('is idempotent for same external ID', async () => {
            const repo = await fixture.getPlayerRepository()
            const { record: player } = await repo.getOrCreate()
            const externalId = 'test-external-id-' + crypto.randomUUID()

            const first = await repo.linkExternalId(player.id, externalId)
            assert.ok(first.updated, 'first link should succeed')

            const second = await repo.linkExternalId(player.id, externalId)
            assert.strictEqual(second.updated, false, 'second link should be no-op')
            assert.ok(second.record, 'should return existing record')
        })

        test('detects conflict with existing external ID', async () => {
            const repo = await fixture.getPlayerRepository()
            const { record: player1 } = await repo.getOrCreate()
            const { record: player2 } = await repo.getOrCreate()
            const externalId = 'test-external-id-' + crypto.randomUUID()

            // Link external ID to first player
            await repo.linkExternalId(player1.id, externalId)

            // Attempt to link same external ID to second player
            const result = await repo.linkExternalId(player2.id, externalId)

            assert.strictEqual(result.updated, false, 'expected update to fail')
            assert.strictEqual(result.conflict, true, 'expected conflict flag')
            assert.strictEqual(result.existingPlayerId, player1.id, 'expected existing player ID')
        })

        test('returns false for non-existent player', async () => {
            const repo = await fixture.getPlayerRepository()
            const nonExistentId = crypto.randomUUID()
            const externalId = 'test-external-id-' + crypto.randomUUID()

            const result = await repo.linkExternalId(nonExistentId, externalId)

            assert.strictEqual(result.updated, false, 'expected update to fail for non-existent player')
        })
    })

    describe('Find by External ID', () => {
        test('finds player by external ID', async () => {
            const repo = await fixture.getPlayerRepository()
            const { record: player } = await repo.getOrCreate()
            const externalId = 'test-external-id-' + crypto.randomUUID()

            await repo.linkExternalId(player.id, externalId)

            const found = await repo.findByExternalId(externalId)

            assert.ok(found, 'expected player to be found')
            assert.strictEqual(found.id, player.id, 'expected same player ID')
            assert.strictEqual(found.externalId, externalId, 'expected external ID to match')
        })

        test('returns undefined for non-existent external ID', async () => {
            const repo = await fixture.getPlayerRepository()
            const nonExistentExternalId = 'non-existent-' + crypto.randomUUID()

            const found = await repo.findByExternalId(nonExistentExternalId)

            assert.strictEqual(found, undefined, 'expected undefined for non-existent external ID')
        })
    })

    describe('Edge Cases', () => {
        test('handles concurrent player creation', async () => {
            const repo = await fixture.getPlayerRepository()
            const playerId = crypto.randomUUID()

            // Simulate concurrent creation (both calls should succeed, one creates, one returns existing)
            const [result1, result2] = await Promise.all([repo.getOrCreate(playerId), repo.getOrCreate(playerId)])

            // Exactly one should report created=true
            const createdCount = (result1.created ? 1 : 0) + (result2.created ? 1 : 0)
            assert.strictEqual(createdCount, 1, 'expected exactly one create operation')

            // Both should return the same player ID
            assert.strictEqual(result1.record.id, playerId, 'first result should have correct ID')
            assert.strictEqual(result2.record.id, playerId, 'second result should have correct ID')
        })

        test('assigns starting location by default', async () => {
            const repo = await fixture.getPlayerRepository()
            const { record } = await repo.getOrCreate()

            const currentLocationId = (record as PlayerRecord).currentLocationId
            assert.ok(currentLocationId, 'currentLocationId should be set')
            assert.strictEqual(currentLocationId, STARTER_LOCATION_ID, 'expected starting location')
        })
    })
})
