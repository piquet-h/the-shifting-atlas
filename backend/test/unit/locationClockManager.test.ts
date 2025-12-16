/**
 * Unit tests for Location Clock Manager
 * TDD: Tests written first to define expected behavior
 */

import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import type { ILocationClockRepository } from '../../src/repos/locationClockRepository.js'
import type { IPlayerRepository } from '../../src/repos/playerRepository.js'
import type { IWorldClockService } from '../../src/services/types.js'
import { LocationClockManager, type ILocationClockManager } from '../../src/services/LocationClockManager.js'
import { TelemetryService } from '../../src/telemetry/TelemetryService.js'
import { LocationClockRepositoryMemory } from '../../src/repos/locationClockRepository.memory.js'

describe('LocationClockManager (unit)', () => {
    let manager: ILocationClockManager
    let locationClockRepo: ILocationClockRepository
    let worldClockService: IWorldClockService
    let telemetryService: TelemetryService

    beforeEach(() => {
        // Set up mock services
        locationClockRepo = new LocationClockRepositoryMemory()

        // Mock world clock service
        worldClockService = {
            getCurrentTick: async () => 1000,
            advanceTick: async () => 2000,
            getTickAt: async () => 1000
        } as unknown as IWorldClockService

        // Mock player repository (not heavily used in these tests)
        const playerRepo = {} as unknown as IPlayerRepository

        // Create telemetry service (will track events)
        telemetryService = {
            trackGameEvent: () => {} // No-op for tests
        } as unknown as TelemetryService

        manager = new LocationClockManager(
            locationClockRepo,
            playerRepo,
            worldClockService,
            telemetryService
        )
    })

    afterEach(() => {
        // Cleanup
    })

    describe('getLocationAnchor', () => {
        test('returns anchor for existing location', async () => {
            // Pre-populate a location clock
            const locationId = 'loc-001'
            await locationClockRepo.syncSingle(locationId, 500)

            const anchor = await manager.getLocationAnchor(locationId)

            assert.strictEqual(anchor, 500)
        })

        test('auto-initializes to world clock tick if location not found', async () => {
            const locationId = 'loc-002'

            const anchor = await manager.getLocationAnchor(locationId)

            // Should initialize to current world clock (1000)
            assert.strictEqual(anchor, 1000)
        })
    })

    describe('syncLocation', () => {
        test('updates anchor for a single location', async () => {
            const locationId = 'loc-003'
            const newAnchor = 2000

            const result = await manager.syncLocation(locationId, newAnchor)

            assert.strictEqual(result.locationId, locationId)
            assert.strictEqual(result.clockAnchor, newAnchor)
        })

        test('preserves location clock if already initialized', async () => {
            const locationId = 'loc-004'

            // Pre-initialize
            await manager.syncLocation(locationId, 500)

            // Sync to new value
            const result = await manager.syncLocation(locationId, 1500)

            assert.strictEqual(result.clockAnchor, 1500)
        })

        test('updates lastAnchorUpdate timestamp', async () => {
            const locationId = 'loc-005'
            const before = new Date()

            const result = await manager.syncLocation(locationId, 3000)

            const updateTime = new Date(result.lastAnchorUpdate)
            assert(updateTime >= before, 'Update time should be >= before time')
        })
    })

    describe('batchSyncLocations', () => {
        test('syncs multiple locations to the same anchor', async () => {
            const locationIds = ['loc-010', 'loc-011', 'loc-012']
            const newAnchor = 2500

            const count = await manager.batchSyncLocations(locationIds, newAnchor)

            assert.strictEqual(count, 3)

            // Verify each location was updated
            for (const locId of locationIds) {
                const anchor = await manager.getLocationAnchor(locId)
                assert.strictEqual(anchor, newAnchor)
            }
        })

        test('handles empty location list', async () => {
            const count = await manager.batchSyncLocations([], 2000)

            assert.strictEqual(count, 0)
        })

        test('handles large batch', async () => {
            const locationIds = Array.from({ length: 100 }, (_, i) =>
                `loc-batch-${i}`
            )
            const newAnchor = 3000

            const count = await manager.batchSyncLocations(locationIds, newAnchor)

            assert.strictEqual(count, 100)

            // Spot-check a few locations
            const anchor0 = await manager.getLocationAnchor(locationIds[0])
            const anchor50 = await manager.getLocationAnchor(locationIds[50])
            const anchor99 = await manager.getLocationAnchor(locationIds[99])

            assert.strictEqual(anchor0, newAnchor)
            assert.strictEqual(anchor50, newAnchor)
            assert.strictEqual(anchor99, newAnchor)
        })
    })

    describe('getOccupantsAtTick', () => {
        test('returns empty array (MVP placeholder)', async () => {
            const occupants = await manager.getOccupantsAtTick('loc-100', 1000)

            assert(Array.isArray(occupants))
            assert.strictEqual(occupants.length, 0)
        })

        // Note: Full implementation requires world events integration
        // and will be added in a subsequent phase
    })

    describe('syncAllLocationsOnClockAdvance', () => {
        test('emits telemetry event', async () => {
            let eventEmitted = false
            const originalTrack = telemetryService.trackGameEvent
            telemetryService.trackGameEvent = (eventName: string, data: unknown) => {
                if (eventName === 'Location.Clock.AdvancementSync') {
                    eventEmitted = true
                }
                originalTrack.call(telemetryService, eventName, data)
            }

            await manager.syncAllLocationsOnClockAdvance(5000)

            assert(eventEmitted, 'Location.Clock.AdvancementSync event should be emitted')
        })

        // Note: Full batch sync requires location enumeration method
        // which will be added when LocationRepository is updated
    })

    describe('World Clock Advancement Scenario', () => {
        test('syncs locations when world clock advances', async () => {
            const locId1 = 'loc-sync-1'
            const locId2 = 'loc-sync-2'

            // Initialize locations at tick 1000
            await manager.syncLocation(locId1, 1000)
            await manager.syncLocation(locId2, 1000)

            // World clock advances to 2000
            const newTick = 2000
            await manager.batchSyncLocations([locId1, locId2], newTick)

            // Verify both locations synchronized
            const anchor1 = await manager.getLocationAnchor(locId1)
            const anchor2 = await manager.getLocationAnchor(locId2)

            assert.strictEqual(anchor1, newTick)
            assert.strictEqual(anchor2, newTick)
        })
    })
})
