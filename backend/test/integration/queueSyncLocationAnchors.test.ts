/**
 * Integration tests for Queue Sync Location Anchors Handler
 * Tests handler with real repository implementations in both memory and cosmos modes
 */

import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import type { InvocationContext } from '@azure/functions'
import { QueueSyncLocationAnchorsHandler } from '../../src/handlers/queueSyncLocationAnchors.js'
import type { ILocationClockManager } from '../../src/services/types.js'
import { describeForBothModes } from '../helpers/describeForBothModes.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

describeForBothModes('QueueSyncLocationAnchors Integration', (mode) => {
    let fixture: IntegrationTestFixture
    let manager: ILocationClockManager
    let handler: QueueSyncLocationAnchorsHandler
    let mockContext: InvocationContext

    beforeEach(async () => {
        fixture = new IntegrationTestFixture(mode)
        await fixture.setup()
        manager = await fixture.getLocationClockManager()
        
        const container = await fixture.getContainer()
        handler = container.get(QueueSyncLocationAnchorsHandler)
        
        // Create minimal mock context
        mockContext = {
            invocationId: 'integration-test-invocation',
            log: () => {},
            warn: () => {},
            error: () => {}
        } as unknown as InvocationContext
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    describe('batch synchronization', () => {
        test('syncs multiple locations to new world clock tick', async () => {
            // Given: World clock at tick 1000 with 5 locations initialized
            const worldClockService = await fixture.getWorldClockService()
            await worldClockService.advanceTick(1000, 'test setup')
            
            const locationIds = ['loc-1', 'loc-2', 'loc-3', 'loc-4', 'loc-5']
            for (const locationId of locationIds) {
                await manager.getLocationAnchor(locationId) // Auto-initializes at tick 1000
            }

            // When: Queue handler syncs to new tick 5000
            const payload = { worldClockTick: 5000, advancementReason: 'test batch sync' }
            const result = await handler.handle(payload, mockContext)

            // Then: All locations should be at tick 5000
            assert.strictEqual(result.locationsUpdated, 5)
            assert.strictEqual(result.worldClockTick, 5000)
            assert.ok(result.durationMs >= 0)

            // Verify each location is at new tick
            for (const locationId of locationIds) {
                const anchor = await manager.getLocationAnchor(locationId)
                assert.strictEqual(anchor, 5000, `Location ${locationId} should be at tick 5000`)
            }
        })

        test('handles empty location set gracefully', async () => {
            // Given: No locations initialized
            // When: Queue handler attempts sync
            const payload = { worldClockTick: 3000, advancementReason: 'empty sync' }
            const result = await handler.handle(payload, mockContext)

            // Then: Should succeed with 0 updates
            assert.strictEqual(result.locationsUpdated, 0)
            assert.strictEqual(result.worldClockTick, 3000)
        })

        test('handles large number of locations efficiently', async () => {
            // Given: 100 locations initialized at tick 500
            const worldClockService = await fixture.getWorldClockService()
            await worldClockService.advanceTick(500, 'test setup')
            
            const locationIds = Array.from({ length: 100 }, (_, i) => `perf-loc-${i}`)
            for (const locationId of locationIds) {
                await manager.getLocationAnchor(locationId)
            }

            // When: Queue handler syncs to new tick 2500
            const startTime = Date.now()
            const payload = { worldClockTick: 2500, advancementReason: 'performance test' }
            const result = await handler.handle(payload, mockContext)
            const duration = Date.now() - startTime

            // Then: All locations updated in reasonable time
            assert.strictEqual(result.locationsUpdated, 100)
            assert.strictEqual(result.worldClockTick, 2500)
            
            // Performance assertion: Should complete in <5 seconds for 100 locations
            // (Memory mode should be much faster, Cosmos mode may be slower)
            if (mode === 'memory') {
                assert.ok(duration < 1000, `Batch sync took ${duration}ms, expected <1000ms for memory mode`)
            } else {
                assert.ok(duration < 5000, `Batch sync took ${duration}ms, expected <5000ms for cosmos mode`)
            }

            // Spot check a few random locations
            const sampleIds = ['perf-loc-0', 'perf-loc-50', 'perf-loc-99']
            for (const locationId of sampleIds) {
                const anchor = await manager.getLocationAnchor(locationId)
                assert.strictEqual(anchor, 2500, `Location ${locationId} should be at tick 2500`)
            }
        })
    })

    describe('idempotency', () => {
        test('repeated sync to same tick is safe and idempotent', async () => {
            // Given: 3 locations at tick 1000
            const worldClockService = await fixture.getWorldClockService()
            await worldClockService.advanceTick(1000, 'test setup')
            
            const locationIds = ['idem-loc-1', 'idem-loc-2', 'idem-loc-3']
            for (const locationId of locationIds) {
                await manager.getLocationAnchor(locationId)
            }

            // When: Sync to tick 3000 twice
            const payload = { worldClockTick: 3000, advancementReason: 'idempotency test' }
            const result1 = await handler.handle(payload, mockContext)
            const result2 = await handler.handle(payload, mockContext)

            // Then: Both succeed, second updates all locations (not currently optimized for skip)
            assert.strictEqual(result1.locationsUpdated, 3)
            assert.strictEqual(result2.locationsUpdated, 3)
            
            // Locations still at correct tick
            for (const locationId of locationIds) {
                const anchor = await manager.getLocationAnchor(locationId)
                assert.strictEqual(anchor, 3000)
            }
        })
    })

    describe('telemetry integration', () => {
        test('emits telemetry events with correct properties', async () => {
            // Given: Valid payload and telemetry client
            const payload = { worldClockTick: 8000, advancementReason: 'telemetry test' }
            const telemetry = await fixture.getTelemetryClient()

            // Setup a few locations
            const worldClockService = await fixture.getWorldClockService()
            await worldClockService.advanceTick(1000, 'setup')
            await manager.getLocationAnchor('telemetry-loc-1')
            await manager.getLocationAnchor('telemetry-loc-2')

            // When: Handler processes payload
            await handler.handle(payload, mockContext)

            // Then: Should emit triggered and completed events
            const triggeredEvents = telemetry.events.filter((e) => e.name === 'Location.Clock.QueueSyncTriggered')
            assert.strictEqual(triggeredEvents.length, 1)
            assert.strictEqual(triggeredEvents[0].properties?.worldClockTick, 8000)
            assert.strictEqual(triggeredEvents[0].properties?.advancementReason, 'telemetry test')

            const completedEvents = telemetry.events.filter((e) => e.name === 'Location.Clock.QueueSyncCompleted')
            assert.strictEqual(completedEvents.length, 1)
            assert.strictEqual(completedEvents[0].properties?.worldClockTick, 8000)
            assert.strictEqual(completedEvents[0].properties?.locationsUpdated, 2)
            assert.ok(typeof completedEvents[0].properties?.durationMs === 'number')
            assert.ok(completedEvents[0].properties?.durationMs >= 0)
        })
    })

    describe('error scenarios', () => {
        test('invalid payload throws validation error', async () => {
            // Given: Invalid payloads and expected error patterns
            const invalidPayloads = [
                { payload: null, errorPattern: /must be an object/i },
                { payload: undefined, errorPattern: /must be an object/i },
                { payload: {}, errorPattern: /worldClockTick.*required/i },
                { payload: { worldClockTick: 'invalid' }, errorPattern: /worldClockTick.*number/i },
                { payload: { worldClockTick: -100 }, errorPattern: /worldClockTick.*non-negative/i }
            ]

            // When/Then: Each should throw appropriate validation error
            for (const { payload, errorPattern } of invalidPayloads) {
                await assert.rejects(
                    async () => handler.handle(payload, mockContext),
                    errorPattern,
                    `Payload ${JSON.stringify(payload)} should throw validation error matching ${errorPattern}`
                )
            }
        })
    })

    describe('edge cases', () => {
        test('syncs locations added during sync operation', async () => {
            // Given: Initial set of locations
            const worldClockService = await fixture.getWorldClockService()
            await worldClockService.advanceTick(1000, 'setup')
            await manager.getLocationAnchor('edge-loc-1')

            // When: Sync to tick 3000 (other locations may be added concurrently in real system)
            const payload = { worldClockTick: 3000, advancementReason: 'concurrent add test' }
            await handler.handle(payload, mockContext)

            // Add new location after sync
            await manager.getLocationAnchor('edge-loc-2') // Will initialize at current world clock

            // Then: New location gets current world clock, not the sync tick
            // (This demonstrates that sync operates on existing locations at time of execution)
            const worldClock = await worldClockService.getCurrentTick()
            const newLocationAnchor = await manager.getLocationAnchor('edge-loc-2')
            // New location should be at world clock (which hasn't advanced beyond setup)
            assert.ok(newLocationAnchor >= 1000)
        })

        test('handles optional advancementReason field', async () => {
            // Given: Payload without optional advancementReason
            const payload = { worldClockTick: 4000 }

            // When: Handler processes payload
            const result = await handler.handle(payload, mockContext)

            // Then: Should succeed
            assert.strictEqual(result.worldClockTick, 4000)
            assert.ok(result.durationMs >= 0)
        })
    })
})
