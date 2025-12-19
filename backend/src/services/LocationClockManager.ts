/**
 * Location Clock Manager Implementation
 *
 * Manages location temporal anchors and synchronization with world clock.
 * Per world-time-temporal-reconciliation.md Section 3 (LocationClockManager).
 */

import { inject, injectable, optional } from 'inversify'
import type { IPlayerDocRepository } from '../repos/PlayerDocRepository.js'
import type { ILocationClockRepository } from '../repos/locationClockRepository.js'
import { TelemetryService } from '../telemetry/TelemetryService.js'
import type { ILocationClockManager, IWorldClockService } from './types.js'

@injectable()
export class LocationClockManager implements ILocationClockManager {
    constructor(
        @inject('ILocationClockRepository') private readonly repository: ILocationClockRepository,
        @inject('IPlayerDocRepository') private readonly playerDocRepo: IPlayerDocRepository,
        @inject(TelemetryService) private readonly telemetry: TelemetryService,
        @inject('IWorldClockService') @optional() private readonly worldClockService?: IWorldClockService
    ) {}

    /**
     * Get location's current world clock anchor
     * Auto-initializes to current world clock if location has no anchor set
     */
    async getLocationAnchor(locationId: string): Promise<number> {
        const existing = await this.repository.get(locationId)

        if (existing) {
            this.telemetry.trackGameEvent('Location.Clock.Queried', {
                locationId,
                clockAnchor: existing.clockAnchor,
                alreadyInitialized: true
            })
            return existing.clockAnchor
        }

        // Get current world clock tick for auto-initialization
        const currentTick = this.worldClockService ? await this.worldClockService.getCurrentTick() : 0

        // Auto-initialize to current world clock
        const initialized = await this.repository.initialize(locationId, currentTick)

        this.telemetry.trackGameEvent('Location.Clock.Initialized', {
            locationId,
            clockAnchor: initialized.clockAnchor,
            worldClockTick: currentTick
        })

        return initialized.clockAnchor
    }

    /**
     * Sync location to new world clock tick
     * Called when world clock advances to update location anchor
     */
    async syncLocation(locationId: string, worldClockTick: number): Promise<void> {
        const existing = await this.repository.get(locationId)

        if (existing) {
            await this.repository.update(locationId, worldClockTick, existing._etag)
        } else {
            await this.repository.initialize(locationId, worldClockTick)
        }

        this.telemetry.trackGameEvent('Location.Clock.Synced', {
            locationId,
            worldClockTick
        })
    }

    /**
     * Query all players present at location at specific historical tick
     * MVP: Returns empty array - full implementation requires world events integration
     */
    async getOccupantsAtTick(locationId: string, tick: number): Promise<string[]> {
        // TODO: Implement cross-reference with world events container
        // Need to query:
        // 1. Player location history (which players were at locationId around tick)
        // 2. Player clock states (filter to those whose clock includes tick)
        // For now, return empty array as placeholder

        this.telemetry.trackGameEvent('Location.Clock.OccupantQuery', {
            locationId,
            tick,
            implemented: false
        })

        return []
    }

    /**
     * Batch sync all locations to new world clock tick
     * Optimized batch update strategy with parallelization
     * Called by world clock advancement handler
     */
    async syncAllLocations(worldClockTick: number): Promise<number> {
        const updated = await this.repository.batchUpdateAll(worldClockTick)

        this.telemetry.trackGameEvent('Location.Clock.BatchSynced', {
            worldClockTick,
            locationsUpdated: updated
        })

        return updated
    }
}
