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
     * Returns players whose:
     * 1. currentLocationId matches the query location
     * 2. clockTick <= query tick (they had arrived by that time)
     */
    async getOccupantsAtTick(locationId: string, tick: number): Promise<string[]> {
        // This is a simplified implementation that queries current player state
        // A full historical query would require temporal ledger or event sourcing
        // For MVP, we assume player documents reflect state at their clockTick

        // Note: This requires getAllPlayers or queryPlayers method on PlayerDocRepository
        // For now, we'll return empty array as this is a future enhancement
        // TODO: Implement when PlayerDocRepository supports bulk queries

        // Placeholder implementation - returns empty array
        // Real implementation would query:
        // SELECT * FROM c WHERE c.currentLocationId = @locationId AND c.clockTick <= @tick

        return []
    }
}
