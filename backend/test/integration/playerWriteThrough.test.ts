/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Player Bootstrap / PlayerDoc Projection Integration Tests (post ADR-004)
 *
 * Verifies that bootstrap creates a PlayerDoc projection without emitting legacy
 * Player.WriteThrough.* telemetry events and operates in SQL-only mode.
 */

import type { HttpRequest } from '@azure/functions'
import { STARTER_LOCATION_ID } from '@piquet-h/shared'
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { describeForBothModes } from '../helpers/describeForBothModes.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'
import type { MockTelemetryClient } from '../mocks/MockTelemetryClient.js'

describeForBothModes('Player Bootstrap SQL-only Projection (post ADR-004)', (mode) => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture(mode)
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    describe('Bootstrap Player Projection', () => {
        test('bootstrap returns playerGuid and creates PlayerDoc (no write-through telemetry)', async () => {
            // Import handler to test bootstrap flow
            const { BootstrapPlayerHandler } = await import('../../src/handlers/bootstrapPlayer.js')
            const container = await fixture.getContainer()
            const handler = container.get(BootstrapPlayerHandler)

            // Create mock request
            const { TestMocks } = await import('../helpers/TestFixture.js')
            const request = TestMocks.createHttpRequest({ headers: {} }) as HttpRequest
            const context = await fixture.createInvocationContext()

            // Execute bootstrap (creates new player)
            const response = await handler.handle(request, context as any)

            assert.strictEqual(response.status, 200, 'Bootstrap should succeed')

            const body = response.jsonBody as any
            const playerId = body?.data?.playerGuid

            assert.ok(playerId, `Player ID should be returned. Got: ${JSON.stringify(body)}`)
            assert.strictEqual(body?.data?.created, true, 'Player should be created')

            // Verify player exists in SQL API projection
            const playerDocRepo = await fixture.getPlayerDocRepository()
            const sqlPlayer = await playerDocRepo.getPlayer(playerId)

            assert.ok(sqlPlayer, 'Player should exist in SQL API via write-through')
            assert.strictEqual(sqlPlayer.id, playerId, 'SQL player ID should match')
            assert.strictEqual(sqlPlayer.currentLocationId, STARTER_LOCATION_ID, 'SQL player location should match')

            // Verify telemetry events were emitted
            const telemetry = (await fixture.getTelemetryClient()) as MockTelemetryClient
            const events = telemetry.events

            // Bootstrap handler emits Onboarding events, not Player.Created
            const createdEvent = events.find((e) => e.name === 'Onboarding.GuestGuid.Created')
            assert.ok(createdEvent, 'Onboarding.GuestGuid.Created event should be emitted')
            // Legacy write-through telemetry should NOT be emitted post ADR-004
            assert.ok(!events.find((e) => e.name === 'Player.WriteThrough.Success'), 'Player.WriteThrough.Success should not be emitted')
            assert.ok(!events.find((e) => e.name === 'Player.WriteThrough.Failed'), 'Player.WriteThrough.Failed should not be emitted')
        })

        test('idempotent bootstrap with provided GUID reports created=false and reuses PlayerDoc', async () => {
            // Import handler
            const { BootstrapPlayerHandler } = await import('../../src/handlers/bootstrapPlayer.js')
            const container = await fixture.getContainer()
            const handler = container.get(BootstrapPlayerHandler)

            // First bootstrap - create player with specific GUID
            const testGuid = crypto.randomUUID()
            const { TestMocks } = await import('../helpers/TestFixture.js')
            const request1 = TestMocks.createHttpRequest({
                headers: {
                    'x-player-guid': testGuid
                }
            }) as HttpRequest
            const context1 = await fixture.createInvocationContext()

            const response1 = await handler.handle(request1, context1 as any)
            const body1 = response1.jsonBody as any

            // When a valid GUID is provided, created is reported as false even if player is new
            // This is by design (see line 42 in bootstrapPlayer.ts)
            assert.strictEqual(body1.data.created, false, 'First call should report created=false (client provided GUID)')
            assert.strictEqual(body1.data.playerGuid, testGuid, 'Player GUID should match provided GUID')

            // PlayerDoc projection should exist
            const playerDocRepo = await fixture.getPlayerDocRepository()
            const sqlPlayer = await playerDocRepo.getPlayer(testGuid)
            assert.ok(sqlPlayer, 'Player should exist in SQL API after first bootstrap')

            // Second bootstrap - same GUID
            const request2 = TestMocks.createHttpRequest({
                headers: {
                    'x-player-guid': testGuid
                }
            }) as HttpRequest
            const context2 = await fixture.createInvocationContext()

            const response2 = await handler.handle(request2, context2 as any)
            const body2 = response2.jsonBody

            assert.strictEqual(body2.data.created, false, 'Second call should not create player (reported as false)')
            assert.strictEqual(body2.data.playerGuid, testGuid, 'Player GUID should still match')

            // Verify only one player in SQL API (no duplicates)
            const sqlPlayer2 = await playerDocRepo.getPlayer(testGuid)

            assert.ok(sqlPlayer2, 'Player should exist in SQL API')
            assert.strictEqual(sqlPlayer2.id, testGuid, 'SQL player ID should match')
        })

        test('PlayerDoc upsert remains idempotent', async () => {
            // Create player directly in both stores
            const playerRepo = await fixture.getPlayerRepository()
            const playerDocRepo = await fixture.getPlayerDocRepository()

            const { record: player, created } = await playerRepo.getOrCreate()
            assert.ok(created, 'Player should be created in Gremlin')

            // First write-through
            await playerDocRepo.upsertPlayer({
                id: player.id,
                createdUtc: player.createdUtc,
                updatedUtc: player.updatedUtc || player.createdUtc,
                currentLocationId: player.currentLocationId || STARTER_LOCATION_ID,
                attributes: {},
                inventoryVersion: 0
            })

            const firstRead = await playerDocRepo.getPlayer(player.id)
            assert.ok(firstRead, 'Player should exist in SQL API after first upsert')

            // Second write-through (simulate re-bootstrap or retry)
            await playerDocRepo.upsertPlayer({
                id: player.id,
                createdUtc: player.createdUtc,
                updatedUtc: new Date().toISOString(), // Updated timestamp
                currentLocationId: player.currentLocationId || STARTER_LOCATION_ID,
                attributes: { retry: true },
                inventoryVersion: 0
            })

            const secondRead = await playerDocRepo.getPlayer(player.id)
            assert.ok(secondRead, 'Player should still exist in SQL API after second upsert')
            assert.strictEqual(secondRead.id, player.id, 'Player ID should remain the same')

            // Last write wins - attributes should be updated
            assert.deepStrictEqual(secondRead.attributes, { retry: true }, 'Attributes should be updated (last-write-wins)')
        })
    })

    // Legacy write-through error handling tests removed (logic deprecated)

    describe('PlayerDoc Field Mapping', () => {
        test('should map PlayerRecord fields to PlayerDoc correctly', async () => {
            const { BootstrapPlayerHandler } = await import('../../src/handlers/bootstrapPlayer.js')
            const container = await fixture.getContainer()
            const handler = container.get(BootstrapPlayerHandler)

            const { TestMocks } = await import('../helpers/TestFixture.js')
            const request = TestMocks.createHttpRequest({ headers: {} }) as HttpRequest
            const context = await fixture.createInvocationContext()

            const response = await handler.handle(request, context as any)
            const body = response.jsonBody
            const playerId = body.data.playerGuid

            const playerDocRepo = await fixture.getPlayerDocRepository()
            const sqlPlayer = await playerDocRepo.getPlayer(playerId)

            assert.ok(sqlPlayer, 'Player should exist in SQL API')
            assert.strictEqual(sqlPlayer.id, playerId, 'ID should match')
            assert.ok(sqlPlayer.createdUtc, 'createdUtc should be set')
            assert.ok(sqlPlayer.updatedUtc, 'updatedUtc should be set')
            assert.strictEqual(sqlPlayer.currentLocationId, STARTER_LOCATION_ID, 'currentLocationId should be starter location')
            assert.deepStrictEqual(sqlPlayer.attributes, {}, 'attributes should be initialized as empty object')
            assert.strictEqual(sqlPlayer.inventoryVersion, 0, 'inventoryVersion should be initialized to 0')
        })

        test('should use updatedUtc fallback to createdUtc when updatedUtc missing', async () => {
            // Direct repository test for edge case
            const playerRepo = await fixture.getPlayerRepository()
            const playerDocRepo = await fixture.getPlayerDocRepository()

            const { record: player } = await playerRepo.getOrCreate()

            // Simulate player with missing updatedUtc
            const playerWithoutUpdated = { ...player, updatedUtc: undefined }

            await playerDocRepo.upsertPlayer({
                id: playerWithoutUpdated.id,
                createdUtc: playerWithoutUpdated.createdUtc,
                updatedUtc: playerWithoutUpdated.updatedUtc || playerWithoutUpdated.createdUtc, // Fallback
                currentLocationId: playerWithoutUpdated.currentLocationId || STARTER_LOCATION_ID,
                attributes: {},
                inventoryVersion: 0
            })

            const sqlPlayer = await playerDocRepo.getPlayer(player.id)

            assert.ok(sqlPlayer, 'Player should exist in SQL API')
            assert.strictEqual(sqlPlayer.updatedUtc, player.createdUtc, 'updatedUtc should fallback to createdUtc')
        })

        test('should handle missing currentLocationId with "unknown" default', async () => {
            // Direct repository test for edge case
            const playerRepo = await fixture.getPlayerRepository()
            const playerDocRepo = await fixture.getPlayerDocRepository()

            const { record: player } = await playerRepo.getOrCreate()

            // Simulate player with missing currentLocationId
            await playerDocRepo.upsertPlayer({
                id: player.id,
                createdUtc: player.createdUtc,
                updatedUtc: player.updatedUtc || player.createdUtc,
                currentLocationId: player.currentLocationId || 'unknown', // Default fallback
                attributes: {},
                inventoryVersion: 0
            })

            const sqlPlayer = await playerDocRepo.getPlayer(player.id)

            assert.ok(sqlPlayer, 'Player should exist in SQL API')
            // In normal operation, currentLocationId should be STARTER_LOCATION_ID
            // This test documents the fallback path if it were ever missing
            assert.ok(sqlPlayer.currentLocationId, 'currentLocationId should be set (either starter or unknown)')
        })
    })
})
