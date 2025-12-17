/**
 * Location Clock Manager Service Implementation
 *
 * Manages temporal anchors for locations, enabling reconciliation of player clocks
 * when entering shared spaces. Maintains location-based time synchronization with
 * the world clock.
 */

import { inject, injectable } from 'inversify'
import type { ILocationClockRepository, LocationClock } from '../repos/locationClockRepository.js'
import type { IPlayerRepository } from '../repos/playerRepository.js'
import { TelemetryService } from '../telemetry/TelemetryService.js'

/**
 * Service interface for location clock operations
 */
export interface ILocationClockManager {
    /**
     * Get the current clock anchor for a location
     * Auto-initializes to world clock tick if not found
     *
     * @param locationId - Location unique identifier
     * @param currentWorldClockTick - Current world clock tick for auto-initialization fallback
     * @returns Clock anchor tick for the location
     */
    getLocationAnchor(locationId: string, currentWorldClockTick: number): Promise<number>

    /**
     * Sync a location's clock anchor to the world clock
     * Called when world clock advances
     *
     * @param locationId - Location unique identifier
     * @param newAnchor - New anchor tick (typically current world clock tick)
     * @returns Updated location clock
     */
    syncLocation(locationId: string, newAnchor: number): Promise<LocationClock>

    /**
     * Batch sync multiple locations to the world clock
     * Optimized for bulk updates on world clock advancement
     *
     * @param locationIds - Array of location IDs to sync
     * @param newAnchor - New anchor tick for all locations
     * @returns Number of locations successfully synced
     */
    batchSyncLocations(locationIds: string[], newAnchor: number): Promise<number>

    /**
     * Get all players present at a location at a specific world clock tick
     * Supports historical queries for timeline reconstruction
     *
     * @param locationId - Location unique identifier
     * @param tick - World clock tick to query
     * @returns Array of player IDs at the location at that tick
     */
    getOccupantsAtTick(locationId: string, tick: number): Promise<string[]>

    /**
     * Sync all known locations on world clock advancement
     * Called by WorldClockService after advancement
     *
     * @param newWorldClockTick - New world clock tick
     * @returns Number of locations synced
     */
    syncAllLocationsOnClockAdvance(newWorldClockTick: number): Promise<number>
}

@injectable()
export class LocationClockManager implements ILocationClockManager {
    constructor(
        @inject('ILocationClockRepository')
        private readonly locationClockRepository: ILocationClockRepository,
        @inject('IPlayerRepository')
        private readonly playerRepository: IPlayerRepository,
        @inject(TelemetryService)
        private readonly telemetry: TelemetryService
    ) {}

    /**
     * Get the current clock anchor for a location
     * Auto-initializes if not found
     *
     * @param locationId - Location unique identifier
     * @param currentWorldClockTick - Current world clock tick for auto-initialization fallback
     */
    async getLocationAnchor(locationId: string, currentWorldClockTick: number): Promise<number> {
        const locationClock = await this.locationClockRepository.get(locationId, currentWorldClockTick)

        this.telemetry.trackGameEvent('Location.Clock.Queried', {
            locationId,
            anchor: locationClock.clockAnchor
        })

        return locationClock.clockAnchor
    }

    /**
     * Sync a location to a new anchor
     */
    async syncLocation(locationId: string, newAnchor: number): Promise<LocationClock> {
        const updated = await this.locationClockRepository.syncSingle(locationId, newAnchor)

        this.telemetry.trackGameEvent('Location.Clock.Synced', {
            locationId,
            newAnchor,
            previousAnchor: updated.clockAnchor
        })

        return updated
    }

    /**
     * Batch sync multiple locations
     */
    async batchSyncLocations(locationIds: string[], newAnchor: number): Promise<number> {
        if (locationIds.length === 0) {
            return 0
        }

        const updated = await this.locationClockRepository.batchSync(locationIds, newAnchor)

        this.telemetry.trackGameEvent('Location.Clock.BatchSynced', {
            count: updated,
            newAnchor,
            totalRequested: locationIds.length
        })

        return updated
    }

    /**
     * Get occupants at a location at a specific tick
     */
    async getOccupantsAtTick(locationId: string, tick: number): Promise<string[]> {
        const occupants = await this.locationClockRepository.getOccupantsAtTick(locationId, tick)

        this.telemetry.trackGameEvent('Location.Occupants.Queried', {
            locationId,
            tick,
            count: occupants.length
        })

        return occupants
    }

    /**
     * Sync all locations on world clock advancement
     * This is called by a world clock advancement handler
     */
    async syncAllLocationsOnClockAdvance(newWorldClockTick: number): Promise<number> {
        // Get all location IDs (from a location repository)
        // For MVP, this is a placeholder; actual implementation depends on
        // having a method to enumerate all locations
        // For now, we'll just track the call

        this.telemetry.trackGameEvent('Location.Clock.AdvancementSync', {
            newWorldClockTick
        })

        // TODO: Implement full location enumeration and batch sync
        // This likely requires adding a method to ILocationRepository
        // to get all location IDs efficiently

        return 0 // Placeholder
    }
}
