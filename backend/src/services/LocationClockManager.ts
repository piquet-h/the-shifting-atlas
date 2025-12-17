/**
 * Location Clock Manager Implementation
 *
 * Manages location temporal anchors and synchronization with world clock.
 * Per world-time-temporal-reconciliation.md Section 3 (LocationClockManager).
 */

import { inject, injectable } from 'inversify'
import type { IPlayerDocRepository } from '../repos/PlayerDocRepository.js'
import type { ILocationClockRepository } from '../repos/locationClockRepository.js'
import { TelemetryService } from '../telemetry/TelemetryService.js'
import type { ILocationClockManager, IWorldClockService } from './types.js'
import { WorldClockService } from './WorldClockService.js'

@injectable()
export class LocationClockManager implements ILocationClockManager {
    constructor(
        @inject('ILocationClockRepository') private readonly repository: ILocationClockRepository,
        @inject(WorldClockService) private readonly worldClockService: IWorldClockService,
        @inject('IPlayerDocRepository') private readonly playerDocRepo: IPlayerDocRepository,
        @inject(TelemetryService) private readonly telemetry: TelemetryService
    ) {}

    /**
     * Get location's current clock anchor
     * Auto-initializes to current world clock if not set
     */
    async getLocationAnchor(locationId: string): Promise<number> {
        // Try to get existing anchor
        const locationClock = await this.repository.get(locationId)

        if (locationClock) {
            return locationClock.clockAnchor
        }

        // Auto-initialize to current world clock
        const worldClockTick = await this.worldClockService.getCurrentTick()
        const initialized = await this.repository.initialize(locationId, worldClockTick)

        // Emit telemetry for auto-initialization
        this.telemetry.trackGameEvent('Location.Clock.Initialized', {
            locationId,
            worldClockTick
        })

        return initialized.clockAnchor
    }

    /**
     * Sync location to new world clock tick
     */
    async syncLocation(locationId: string, worldClockTick: number): Promise<void> {
        // Update location clock (auto-initializes if not exists)
        await this.repository.update(locationId, worldClockTick)

        // Emit telemetry
        this.telemetry.trackGameEvent('Location.Clock.Synced', {
            locationId,
            worldClockTick
        })
    }

    /**
     * Batch sync all locations to new world clock tick
     */
    async syncAllLocations(worldClockTick: number): Promise<number> {
        const count = await this.repository.batchUpdateAll(worldClockTick)

        // Emit telemetry for batch sync
        this.telemetry.trackGameEvent('Location.Clock.BatchSynced', {
            worldClockTick,
            locationCount: count
        })

        return count
    }

    /**
     * Query players present at location at specific tick
     *
     * **MVP Implementation**: Returns empty array (placeholder)
     *
     * Full implementation requires PlayerDocRepository.queryByLocationAndTick():
     * - SQL query: SELECT c.id FROM c WHERE c.currentLocationId = @loc AND c.clockTick <= @tick
     * - Composite index needed: (currentLocationId, clockTick)
     * - Tracked in: M5 Quality & Depth milestone
     *
     * @param _locationId - Location to query (unused in placeholder)
     * @param _tick - World clock tick to query at (unused in placeholder)
     * @returns Player IDs at location at that tick (empty for MVP)
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async getOccupantsAtTick(_locationId: string, _tick: number): Promise<string[]> {
        // Placeholder: requires PlayerDocRepository enhancement
        return []
    }
}
