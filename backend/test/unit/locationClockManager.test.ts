/**
 * Unit tests for Location Clock Manager
 * TDD: Tests written first to define expected behavior
 */

import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import type { ILocationClockManager } from '../../src/services/types.js'
import { UnitTestFixture } from '../helpers/UnitTestFixture.js'

describe('LocationClockManager (unit)', () => {
    let fixture: UnitTestFixture
    let manager: ILocationClockManager

    beforeEach(async () => {
        fixture = new UnitTestFixture()
        await fixture.setup()
        manager = await fixture.getLocationClockManager()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    describe('getLocationAnchor', () => {
        test('returns current world clock tick for uninitialized location', async () => {
            // Given: World clock at tick 5000
            const worldClockService = await fixture.getWorldClockService()
            await worldClockService.advanceTick(5000, 'test setup')

            // When: Getting anchor for new location
            const anchor = await manager.getLocationAnchor('location-123')

            // Then: Should initialize to current world clock
            assert.strictEqual(anchor, 5000)
        })

        test('returns existing anchor for initialized location', async () => {
            // Given: Location initialized at tick 1000
            const worldClockService = await fixture.getWorldClockService()
            await worldClockService.advanceTick(1000, 'test setup')
            await manager.syncLocation('location-456', 1000)

            // When: World clock advances but location not synced
            await worldClockService.advanceTick(2000, 'test advance')

            // Then: Location anchor should still be 1000
            const anchor = await manager.getLocationAnchor('location-456')
            assert.strictEqual(anchor, 1000)
        })

        test('auto-initializes location on first access', async () => {
            // Given: World clock at specific tick
            const worldClockService = await fixture.getWorldClockService()
            await worldClockService.advanceTick(12345, 'test')

            // When: First access to location
            const anchor1 = await manager.getLocationAnchor('new-location')

            // Then: Should be initialized to current world clock
            assert.strictEqual(anchor1, 12345)

            // When: Second access (after world clock advance)
            await worldClockService.advanceTick(100, 'advance')
            const anchor2 = await manager.getLocationAnchor('new-location')

            // Then: Should return cached anchor (not re-initialize)
            assert.strictEqual(anchor2, 12345)
        })
    })

    describe('syncLocation', () => {
        test('updates location anchor to new tick', async () => {
            // Given: Location at tick 1000
            await manager.syncLocation('location-789', 1000)

            // When: Syncing to new tick
            await manager.syncLocation('location-789', 5000)

            // Then: Anchor should be updated
            const anchor = await manager.getLocationAnchor('location-789')
            assert.strictEqual(anchor, 5000)
        })

        test('emits Location.Clock.Synced telemetry event', async () => {
            const telemetry = await fixture.getTelemetryClient()

            // When: Syncing location
            await manager.syncLocation('location-xyz', 3000)

            // Then: Should emit telemetry
            const events = telemetry.events.filter((e) => e.name === 'Location.Clock.Synced')
            assert.strictEqual(events.length, 1)
            assert.strictEqual(events[0].properties?.locationId, 'location-xyz')
            assert.strictEqual(events[0].properties?.worldClockTick, 3000)
        })

        test('initializes location if not exists', async () => {
            // When: Syncing uninitialized location
            await manager.syncLocation('new-location-sync', 7500)

            // Then: Should be initialized at that tick
            const anchor = await manager.getLocationAnchor('new-location-sync')
            assert.strictEqual(anchor, 7500)
        })
    })

    describe('syncAllLocations', () => {
        test('syncs all initialized locations to new tick', async () => {
            // Given: Multiple locations at different ticks
            await manager.syncLocation('loc-1', 1000)
            await manager.syncLocation('loc-2', 1500)
            await manager.syncLocation('loc-3', 2000)

            // When: Batch syncing all to new tick
            const count = await manager.syncAllLocations(10000)

            // Then: All locations should be at new tick
            assert.strictEqual(count, 3)
            assert.strictEqual(await manager.getLocationAnchor('loc-1'), 10000)
            assert.strictEqual(await manager.getLocationAnchor('loc-2'), 10000)
            assert.strictEqual(await manager.getLocationAnchor('loc-3'), 10000)
        })

        test('returns zero when no locations initialized', async () => {
            // When: Batch syncing with no locations
            const count = await manager.syncAllLocations(5000)

            // Then: Should return 0
            assert.strictEqual(count, 0)
        })

        test('handles large number of locations efficiently', async () => {
            // Given: Many locations
            const locationIds: string[] = []
            for (let i = 0; i < 100; i++) {
                locationIds.push(`loc-${i}`)
                await manager.syncLocation(`loc-${i}`, 1000)
            }

            // When: Batch syncing
            const startTime = Date.now()
            const count = await manager.syncAllLocations(5000)
            const duration = Date.now() - startTime

            // Then: All should be synced
            assert.strictEqual(count, 100)

            // Performance check: should complete reasonably fast (< 1 second for memory)
            assert.ok(duration < 1000, `Batch sync took ${duration}ms, expected < 1000ms`)
        })
    })

    describe('getOccupantsAtTick', () => {
        test('returns empty array when no players at location', async () => {
            // When: Querying occupants with no players
            const occupants = await manager.getOccupantsAtTick('empty-location', 5000)

            // Then: Should return empty array
            assert.ok(Array.isArray(occupants))
            assert.strictEqual(occupants.length, 0)
        })

        test('returns players present at location at specific tick', async () => {
            // Given: Players at location with matching clock ticks
            const playerDocRepo = await fixture.getPlayerDocRepository()

            // Player 1: at location, clock at tick 5000
            await playerDocRepo.upsertPlayer({
                id: 'player-1',
                currentLocationId: 'test-location',
                clockTick: 5000,
                createdUtc: new Date().toISOString(),
                updatedUtc: new Date().toISOString()
            })

            // Player 2: at location, clock at tick 5500
            await playerDocRepo.upsertPlayer({
                id: 'player-2',
                currentLocationId: 'test-location',
                clockTick: 5500,
                createdUtc: new Date().toISOString(),
                updatedUtc: new Date().toISOString()
            })

            // Player 3: different location, same tick
            await playerDocRepo.upsertPlayer({
                id: 'player-3',
                currentLocationId: 'other-location',
                clockTick: 5000,
                createdUtc: new Date().toISOString(),
                updatedUtc: new Date().toISOString()
            })

            // When: Querying occupants at tick 5000
            const occupants = await manager.getOccupantsAtTick('test-location', 5000)

            // Then: Should return players at location with clock <= tick
            assert.ok(occupants.includes('player-1'))
            assert.ok(occupants.includes('player-2'))
            assert.ok(!occupants.includes('player-3'))
        })

        test('excludes players who arrived after tick', async () => {
            // Given: Players with different arrival times
            const playerDocRepo = await fixture.getPlayerDocRepository()

            // Player arrived before tick (clock at 4000)
            await playerDocRepo.upsertPlayer({
                id: 'early-player',
                currentLocationId: 'query-location',
                clockTick: 4000,
                createdUtc: new Date().toISOString(),
                updatedUtc: new Date().toISOString()
            })

            // Player arrived after tick (clock at 6000)
            await playerDocRepo.upsertPlayer({
                id: 'late-player',
                currentLocationId: 'query-location',
                clockTick: 6000,
                createdUtc: new Date().toISOString(),
                updatedUtc: new Date().toISOString()
            })

            // When: Querying at tick 5000
            const occupants = await manager.getOccupantsAtTick('query-location', 5000)

            // Then: Should only include early player
            assert.strictEqual(occupants.length, 1)
            assert.ok(occupants.includes('early-player'))
            assert.ok(!occupants.includes('late-player'))
        })
    })
})
