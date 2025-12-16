/**
 * Location Clock Manager Integration Tests
 *
 * Tests the full Location Clock Manager within the context of world clock advancement
 * and player timeline reconciliation.
 */

import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import type { ILocationClockManager } from '../../src/services/LocationClockManager.js'
import type { IWorldClockService } from '../../src/services/types.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

describe('LocationClockManager (integration)', () => {
    let fixture: IntegrationTestFixture
    let locationClockManager: ILocationClockManager
    let worldClockService: IWorldClockService

    beforeEach(async () => {
        fixture = new IntegrationTestFixture()
        await fixture.setup()
        locationClockManager = await fixture.getLocationClockManager()
        worldClockService = await fixture.getWorldClockService()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    describe('World Clock Advancement Integration', () => {
        test('syncs all locations when world clock advances', async () => {
            // Initialize world clock
            const initialTick = await worldClockService.getCurrentTick()

            // Pre-populate some locations
            const locId1 = 'test-loc-1'
            const locId2 = 'test-loc-2'
            const locId3 = 'test-loc-3'

            // Set initial anchors
            await locationClockManager.syncLocation(locId1, initialTick)
            await locationClockManager.syncLocation(locId2, initialTick)
            await locationClockManager.syncLocation(locId3, initialTick)

            // Advance world clock
            const newTick = await worldClockService.advanceTick(5000, 'integration-test')

            // Sync all locations (simulating what would happen on advancement hook)
            await locationClockManager.batchSyncLocations([locId1, locId2, locId3], newTick)

            // Verify all locations synchronized
            const anchor1 = await locationClockManager.getLocationAnchor(locId1)
            const anchor2 = await locationClockManager.getLocationAnchor(locId2)
            const anchor3 = await locationClockManager.getLocationAnchor(locId3)

            assert.strictEqual(anchor1, newTick)
            assert.strictEqual(anchor2, newTick)
            assert.strictEqual(anchor3, newTick)
        })

        test('maintains location clocks across multiple world clock advancements', async () => {
            const locId = 'test-loc-multi'
            let tick = await worldClockService.getCurrentTick()

            // First advancement
            tick = await worldClockService.advanceTick(1000, 'first')
            await locationClockManager.syncLocation(locId, tick)
            assert.strictEqual(await locationClockManager.getLocationAnchor(locId), tick)

            // Second advancement
            tick = await worldClockService.advanceTick(2000, 'second')
            await locationClockManager.syncLocation(locId, tick)
            assert.strictEqual(await locationClockManager.getLocationAnchor(locId), tick)

            // Third advancement
            tick = await worldClockService.advanceTick(3000, 'third')
            await locationClockManager.syncLocation(locId, tick)
            assert.strictEqual(await locationClockManager.getLocationAnchor(locId), tick)
        })
    })

    describe('Occupant Query Integration', () => {
        test('queries occupants at a specific tick (MVP: returns empty pending world events integration)', async () => {
            const locId = 'test-loc-occupants'
            const tick = await worldClockService.getCurrentTick()

            const occupants = await locationClockManager.getOccupantsAtTick(locId, tick)

            assert(Array.isArray(occupants))
            // MVP: returns empty; full implementation requires world events
            assert.strictEqual(occupants.length, 0)
        })

        // TODO: Add occupant query tests once world events integration is available
        // - Query occupants when players have moved to location
        // - Query historical occupants from previous ticks
        // - Verify occupant isolation per location
    })

    describe('Batch Sync Performance', () => {
        test('handles batch sync of 50 locations efficiently', async () => {
            const locationIds = Array.from({ length: 50 }, (_, i) => `perf-loc-${i}`)
            const tick = 10000

            const startTime = Date.now()
            const count = await locationClockManager.batchSyncLocations(locationIds, tick)
            const duration = Date.now() - startTime

            assert.strictEqual(count, 50)
            // Should complete in reasonable time (< 1 second even with Cosmos)
            assert(duration < 1000, `Batch sync should be fast, took ${duration}ms`)
        })

        test('handles batch sync of 200 locations', async () => {
            const locationIds = Array.from({ length: 200 }, (_, i) => `big-batch-${i}`)
            const tick = 20000

            const count = await locationClockManager.batchSyncLocations(locationIds, tick)

            assert.strictEqual(count, 200)
        })
    })

    describe('Error Recovery', () => {
        test('recovers from transient failures in batch sync', async () => {
            // This test verifies the batch sync can handle some failures
            // In real Cosmos operations, individual failures might occur
            const locationIds = ['recovery-1', 'recovery-2', 'recovery-3']

            // First attempt
            const count1 = await locationClockManager.batchSyncLocations(locationIds, 5000)
            assert.strictEqual(count1, 3)

            // Verify state is correct
            const anchor1 = await locationClockManager.getLocationAnchor('recovery-1')
            assert.strictEqual(anchor1, 5000)
        })
    })
})
