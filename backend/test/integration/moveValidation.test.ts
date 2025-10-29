/**
 * Move Validation Integration Tests
 *
 * Purpose: Test move operation validation logic with in-memory repositories.
 * These tests were migrated from E2E layer because they validate input/business logic,
 * not production database behavior.
 *
 * Migration Rationale:
 * - Input validation doesn't require real Cosmos DB
 * - 10x faster feedback (50ms vs 500ms per test)
 * - Equivalent coverage with lower cost
 * - Existing unit tests already cover validation logic (performMove.core.test.ts)
 *
 * Related:
 * - Unit tests: backend/test/unit/performMove.core.test.ts
 * - E2E tests: backend/test/e2e/cosmos.e2e.test.ts (original location)
 */

import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'
import { getDefaultTestLocations, seedTestWorld } from '../helpers/seedTestWorld.js'

describe('Move Validation', () => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    describe('Exit Validation', () => {
        test('missing exit returns error', async () => {
            const locationRepo = await fixture.getLocationRepository()
            const playerRepo = await fixture.getPlayerRepository()

            // Seed test world with default blueprint
            const { locations } = await seedTestWorld({
                locationRepository: locationRepo,
                playerRepository: playerRepo,
                blueprint: getDefaultTestLocations()
            })

            // Get a location that has no north exit (test-loc-north has only south exit back to hub)
            const northLocation = locations.find((l) => l.id === 'test-loc-north')
            assert.ok(northLocation, 'North location should exist in test blueprint')

            // Try to move north from location with no north exit
            const result = await locationRepo.move(northLocation.id, 'north')

            // Assert error response
            assert.equal(result.status, 'error', 'Move with no exit should return error status')
            assert.ok(result.reason, 'Error should have a reason')
            // In-memory repo returns 'no-exit', Cosmos may have different format
            assert.ok(
                result.reason === 'no-exit' || result.reason.includes('No exit') || result.reason.includes('not found'),
                `Error reason should indicate missing exit, got: ${result.reason}`
            )
        })

        test('invalid direction returns error', async () => {
            const locationRepo = await fixture.getLocationRepository()
            const playerRepo = await fixture.getPlayerRepository()

            // Seed test world
            const { locations } = await seedTestWorld({
                locationRepository: locationRepo,
                playerRepository: playerRepo,
                blueprint: getDefaultTestLocations()
            })

            // Get hub location
            const hubLocation = locations[0]

            // Try to move in invalid direction
            const result = await locationRepo.move(hubLocation.id, 'invalid-direction')

            // Assert error response
            assert.equal(result.status, 'error', 'Move with invalid direction should return error status')
            assert.ok(result.reason && result.reason.length > 0, 'Error should have a reason message')
        })

        test('empty direction returns error', async () => {
            const locationRepo = await fixture.getLocationRepository()
            const playerRepo = await fixture.getPlayerRepository()

            // Seed test world
            const { locations } = await seedTestWorld({
                locationRepository: locationRepo,
                playerRepository: playerRepo,
                blueprint: getDefaultTestLocations()
            })

            // Try to move with empty direction
            const result = await locationRepo.move(locations[0].id, '')

            // Assert error response
            assert.equal(result.status, 'error', 'Move with empty direction should return error status')
        })

        test('valid directions are accepted', async () => {
            const locationRepo = await fixture.getLocationRepository()
            const playerRepo = await fixture.getPlayerRepository()

            // Seed test world
            const { locations } = await seedTestWorld({
                locationRepository: locationRepo,
                playerRepository: playerRepo,
                blueprint: getDefaultTestLocations()
            })

            // Hub location has north, south, east exits
            const hubLocation = locations[0]

            // Test valid directions
            const validMoves = ['north', 'south', 'east']

            for (const direction of validMoves) {
                const result = await locationRepo.move(hubLocation.id, direction)
                assert.equal(result.status, 'ok', `Move ${direction} should succeed with valid exit`)
            }
        })
    })

    describe('Location Validation', () => {
        test('nonexistent location returns error', async () => {
            const locationRepo = await fixture.getLocationRepository()

            // Try to move from location that doesn't exist
            const result = await locationRepo.move('nonexistent-location-id', 'north')

            // Assert error response
            assert.equal(result.status, 'error', 'Move from nonexistent location should return error')
        })

        test('successful move returns new location', async () => {
            const locationRepo = await fixture.getLocationRepository()
            const playerRepo = await fixture.getPlayerRepository()

            // Seed test world
            const { locations } = await seedTestWorld({
                locationRepository: locationRepo,
                playerRepository: playerRepo,
                blueprint: getDefaultTestLocations()
            })

            const hubLocation = locations[0]
            const result = await locationRepo.move(hubLocation.id, 'north')

            // Assert successful move
            assert.equal(result.status, 'ok', 'Valid move should return ok status')
            if (result.status === 'ok') {
                assert.ok(result.location, 'Successful move should return new location')
                assert.notEqual(result.location.id, hubLocation.id, 'New location should be different')
                assert.equal(result.location.id, 'test-loc-north', 'Should move to correct destination')
            }
        })
    })

    describe('Move Response Structure', () => {
        test('error response has correct structure', async () => {
            const locationRepo = await fixture.getLocationRepository()

            const result = await locationRepo.move('invalid-id', 'north')

            // Validate error response structure
            assert.equal(result.status, 'error')
            assert.ok(result.reason, 'Error response should have reason field')
            assert.equal(typeof result.reason, 'string', 'Reason should be a string')
        })

        test('success response has correct structure', async () => {
            const locationRepo = await fixture.getLocationRepository()
            const playerRepo = await fixture.getPlayerRepository()

            const { locations } = await seedTestWorld({
                locationRepository: locationRepo,
                playerRepository: playerRepo,
                blueprint: getDefaultTestLocations()
            })

            const result = await locationRepo.move(locations[0].id, 'north')

            // Validate success response structure
            assert.equal(result.status, 'ok')
            if (result.status === 'ok') {
                assert.ok(result.location, 'Success response should have location field')
                assert.ok(result.location.id, 'Location should have id')
                assert.ok(result.location.name, 'Location should have name')
                assert.ok(result.location.description, 'Location should have description')
            }
        })
    })
})
