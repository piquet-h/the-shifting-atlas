/**
 * Unit tests for PlayerDocRepository
 * Tests core CRUD operations for PlayerDoc SQL API projection
 */

import type { PlayerDoc } from '@piquet-h/shared'
import assert from 'node:assert'
import { describe, test } from 'node:test'
import { PlayerDocRepository } from '../../src/repos/PlayerDocRepository.js'
import { createMockCosmosDbSqlClient } from '../mocks/mockCosmosDbSqlClient.js'
import { TelemetryService } from '../../src/telemetry/TelemetryService.js'
import { createMockTelemetryClient } from '../helpers/containerHelpers.js'

describe('PlayerDocRepository', () => {
    // Helper to create a mock TelemetryService
    function createMockTelemetryService(): TelemetryService {
        const { client } = createMockTelemetryClient()
        return new TelemetryService(client)
    }

    describe('getPlayer', () => {
        test('returns player when found', async () => {
            const playerId = crypto.randomUUID()
            const expectedPlayer: PlayerDoc = {
                id: playerId,
                createdUtc: new Date().toISOString(),
                updatedUtc: new Date().toISOString(),
                currentLocationId: crypto.randomUUID(),
                attributes: { hp: 100, stamina: 50 },
                inventoryVersion: 1
            }

            const mockClient = createMockCosmosDbSqlClient({
                players: {
                    [playerId]: expectedPlayer
                }
            })

            const mockTelemetry = createMockTelemetryService()
            const repo = new PlayerDocRepository(mockClient, mockTelemetry)

            const result = await repo.getPlayer(playerId)

            assert.ok(result, 'expected player to be found')
            assert.strictEqual(result.id, playerId)
            assert.strictEqual(result.currentLocationId, expectedPlayer.currentLocationId)
            assert.deepStrictEqual(result.attributes, expectedPlayer.attributes)
            assert.strictEqual(result.inventoryVersion, 1)
        })

        test('returns null when player not found', async () => {
            const mockClient = createMockCosmosDbSqlClient({
                players: {}
            })

            const mockTelemetry = createMockTelemetryService()
            const repo = new PlayerDocRepository(mockClient, mockTelemetry)

            const result = await repo.getPlayer(crypto.randomUUID())

            assert.strictEqual(result, null, 'expected null for non-existent player')
        })
    })

    describe('upsertPlayer', () => {
        test('creates new player document', async () => {
            const playerId = crypto.randomUUID()
            const newPlayer: PlayerDoc = {
                id: playerId,
                createdUtc: new Date().toISOString(),
                updatedUtc: new Date().toISOString(),
                currentLocationId: crypto.randomUUID(),
                attributes: { level: 1 },
                inventoryVersion: 0
            }

            const mockClient = createMockCosmosDbSqlClient({
                players: {}
            })

            const mockTelemetry = createMockTelemetryService()
            const repo = new PlayerDocRepository(mockClient, mockTelemetry)

            await repo.upsertPlayer(newPlayer)

            // Verify player was stored
            const retrieved = await repo.getPlayer(playerId)
            assert.ok(retrieved, 'expected player to be created')
            assert.strictEqual(retrieved.id, playerId)
            assert.deepStrictEqual(retrieved.attributes, { level: 1 })
        })

        test('updates existing player document', async () => {
            const playerId = crypto.randomUUID()
            const originalPlayer: PlayerDoc = {
                id: playerId,
                createdUtc: new Date().toISOString(),
                updatedUtc: new Date().toISOString(),
                currentLocationId: crypto.randomUUID(),
                attributes: { hp: 100 },
                inventoryVersion: 1
            }

            const mockClient = createMockCosmosDbSqlClient({
                players: { [playerId]: { ...originalPlayer } }
            })

            const mockTelemetry = createMockTelemetryService()
            const repo = new PlayerDocRepository(mockClient, mockTelemetry)

            // Update player
            const updatedPlayer: PlayerDoc = {
                ...originalPlayer,
                currentLocationId: crypto.randomUUID(),
                attributes: { hp: 80 },
                inventoryVersion: 2,
                updatedUtc: new Date().toISOString()
            }

            await repo.upsertPlayer(updatedPlayer)

            // Verify update
            const retrieved = await repo.getPlayer(playerId)
            assert.ok(retrieved, 'expected player to exist')
            assert.strictEqual(retrieved.currentLocationId, updatedPlayer.currentLocationId)
            assert.deepStrictEqual(retrieved.attributes, { hp: 80 })
            assert.strictEqual(retrieved.inventoryVersion, 2)
        })

        test('upsert is idempotent', async () => {
            const playerId = crypto.randomUUID()
            const player: PlayerDoc = {
                id: playerId,
                createdUtc: new Date().toISOString(),
                updatedUtc: new Date().toISOString(),
                currentLocationId: crypto.randomUUID()
            }

            const mockClient = createMockCosmosDbSqlClient({
                players: {}
            })

            const mockTelemetry = createMockTelemetryService()
            const repo = new PlayerDocRepository(mockClient, mockTelemetry)

            // Upsert twice with same data
            await repo.upsertPlayer(player)
            await repo.upsertPlayer(player)

            // Should succeed both times
            const retrieved = await repo.getPlayer(playerId)
            assert.ok(retrieved, 'expected player to exist')
        })
    })

    describe('Edge Cases', () => {
        test('handles player with minimal fields', async () => {
            const playerId = crypto.randomUUID()
            const minimalPlayer: PlayerDoc = {
                id: playerId,
                createdUtc: new Date().toISOString(),
                updatedUtc: new Date().toISOString(),
                currentLocationId: crypto.randomUUID()
            }

            const mockClient = createMockCosmosDbSqlClient({
                players: {}
            })

            const mockTelemetry = createMockTelemetryService()
            const repo = new PlayerDocRepository(mockClient, mockTelemetry)

            await repo.upsertPlayer(minimalPlayer)

            const retrieved = await repo.getPlayer(playerId)
            assert.ok(retrieved, 'expected minimal player to be created')
            assert.strictEqual(retrieved.attributes, undefined)
            assert.strictEqual(retrieved.inventoryVersion, undefined)
        })

        test('handles concurrent upserts with last-write-wins', async () => {
            const playerId = crypto.randomUUID()
            const player1: PlayerDoc = {
                id: playerId,
                createdUtc: new Date().toISOString(),
                updatedUtc: new Date().toISOString(),
                currentLocationId: 'location-1',
                attributes: { version: 1 }
            }

            const player2: PlayerDoc = {
                id: playerId,
                createdUtc: player1.createdUtc,
                updatedUtc: new Date().toISOString(),
                currentLocationId: 'location-2',
                attributes: { version: 2 }
            }

            const mockClient = createMockCosmosDbSqlClient({
                players: {}
            })

            const mockTelemetry = createMockTelemetryService()
            const repo = new PlayerDocRepository(mockClient, mockTelemetry)

            // Simulate concurrent upserts
            await Promise.all([repo.upsertPlayer(player1), repo.upsertPlayer(player2)])

            // Last write wins (order undefined in this test, both should succeed)
            const retrieved = await repo.getPlayer(playerId)
            assert.ok(retrieved, 'expected player to exist')
            assert.ok(
                retrieved.currentLocationId === 'location-1' || retrieved.currentLocationId === 'location-2',
                'expected one of the upserts to win'
            )
        })
    })
})
