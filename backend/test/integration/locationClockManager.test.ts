/**
 * Integration tests for Location Clock Manager
 * Tests service and repository operations in both memory and cosmos modes
 */

import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import type { ILocationClockManager } from '../../src/services/types.js'
import { describeForBothModes } from '../helpers/describeForBothModes.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

describeForBothModes('LocationClockManager Integration', (mode) => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture(mode)
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    describe('getLocationAnchor', () => {
        test('auto-initializes to current world clock on first access', async () => {
            const manager = await fixture.getLocationClockManager()
            const worldClockService = await fixture.getWorldClockService()

            // Advance world clock to specific tick
            await worldClockService.advanceTick(7500, 'test setup')

            // Get anchor for new location (should auto-initialize)
            const anchor = await manager.getLocationAnchor('integration-location-1')

            assert.strictEqual(anchor, 7500)
        })

        test('returns cached anchor on subsequent accesses', async () => {
            const manager = await fixture.getLocationClockManager()

            // Initialize location at tick 2000
            await manager.syncLocation('integration-location-2', 2000)

            // Multiple accesses should return same anchor
            const anchor1 = await manager.getLocationAnchor('integration-location-2')
            const anchor2 = await manager.getLocationAnchor('integration-location-2')

            assert.strictEqual(anchor1, 2000)
            assert.strictEqual(anchor2, 2000)
        })
    })

    describe('syncLocation', () => {
        test('updates location anchor and persists to repository', async () => {
            const manager = await fixture.getLocationClockManager()

            // Sync location to tick 5000
            await manager.syncLocation('integration-location-3', 5000)

            // Verify persisted by reading directly from repository
            const repo = await fixture.getLocationClockRepository()
            const locationClock = await repo.get('integration-location-3')

            assert.ok(locationClock)
            assert.strictEqual(locationClock.clockAnchor, 5000)
            assert.strictEqual(locationClock.id, 'integration-location-3')
        })

        test('emits telemetry event', async () => {
            const manager = await fixture.getLocationClockManager()
            const telemetry = await fixture.getTelemetryClient()

            await manager.syncLocation('integration-location-4', 3000)

            const events = telemetry.events.filter((e) => e.name === 'Location.Clock.Synced')
            assert.strictEqual(events.length, 1)
            assert.strictEqual(events[0].properties?.locationId, 'integration-location-4')
            assert.strictEqual(events[0].properties?.worldClockTick, 3000)
        })
    })

    describe('syncAllLocations', () => {
        test('world clock advances → all location anchors updated', async () => {
            const manager = await fixture.getLocationClockManager()
            const worldClockService = await fixture.getWorldClockService()

            // Initialize multiple locations at different ticks
            await manager.syncLocation('loc-a', 1000)
            await manager.syncLocation('loc-b', 1500)
            await manager.syncLocation('loc-c', 2000)

            // Advance world clock
            await worldClockService.advanceTick(5000, 'batch sync test')

            // Batch sync all locations to new world clock
            const count = await manager.syncAllLocations(5000)

            // Verify all locations synced
            assert.strictEqual(count, 3)

            const anchorA = await manager.getLocationAnchor('loc-a')
            const anchorB = await manager.getLocationAnchor('loc-b')
            const anchorC = await manager.getLocationAnchor('loc-c')

            assert.strictEqual(anchorA, 5000)
            assert.strictEqual(anchorB, 5000)
            assert.strictEqual(anchorC, 5000)
        })

        test('handles empty location set gracefully', async () => {
            const manager = await fixture.getLocationClockManager()

            // Batch sync with no locations
            const count = await manager.syncAllLocations(10000)

            assert.strictEqual(count, 0)
        })

        test('batch sync is efficient with many locations', async () => {
            const manager = await fixture.getLocationClockManager()

            // Create many locations
            for (let i = 0; i < 50; i++) {
                await manager.syncLocation(`perf-loc-${i}`, 1000)
            }

            // Measure batch sync performance
            const startTime = Date.now()
            const count = await manager.syncAllLocations(5000)
            const duration = Date.now() - startTime

            assert.strictEqual(count, 50)

            // Should complete in reasonable time (< 5 seconds even for cosmos)
            assert.ok(duration < 5000, `Batch sync took ${duration}ms, expected < 5000ms`)
        })
    })

    describe('getOccupantsAtTick', () => {
        test('returns empty array (placeholder implementation)', async () => {
            const manager = await fixture.getLocationClockManager()

            // Current implementation returns empty array
            const occupants = await manager.getOccupantsAtTick('any-location', 5000)

            assert.ok(Array.isArray(occupants))
            assert.strictEqual(occupants.length, 0)
        })
    })
})
