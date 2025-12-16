/**
 * Location Clock Repository - In-Memory Implementation
 *
 * Simple in-memory implementation for testing and development.
 * Stores location clocks in a Map, with no persistence.
 */

import { injectable } from 'inversify'
import type { ILocationClockRepository, LocationClock } from './locationClockRepository.js'

@injectable()
export class LocationClockRepositoryMemory implements ILocationClockRepository {
    private clocks = new Map<string, LocationClock>()

    /**
     * Get a location clock, auto-initializing if not found
     */
    async get(locationId: string, currentWorldClockTick: number): Promise<LocationClock> {
        let clock = this.clocks.get(locationId)

        if (!clock) {
            // Auto-initialize
            clock = {
                id: locationId,
                locationId,
                clockAnchor: currentWorldClockTick,
                lastAnchorUpdate: new Date().toISOString()
            }

            this.clocks.set(locationId, clock)
        }

        return clock
    }

    /**
     * Batch sync multiple locations
     */
    async batchSync(locationIds: string[], newClockAnchor: number): Promise<number> {
        const now = new Date().toISOString()

        let synced = 0

        for (const locationId of locationIds) {
            let clock = this.clocks.get(locationId)

            if (!clock) {
                // Create if not found
                clock = {
                    id: locationId,
                    locationId,
                    clockAnchor: newClockAnchor,
                    lastAnchorUpdate: now
                }
            } else {
                // Update existing
                clock = {
                    ...clock,
                    clockAnchor: newClockAnchor,
                    lastAnchorUpdate: now
                }
            }

            this.clocks.set(locationId, clock)
            synced++
        }

        return synced
    }

    /**
     * Sync a single location
     */
    async syncSingle(locationId: string, newClockAnchor: number): Promise<LocationClock> {
        const now = new Date().toISOString()

        let clock = this.clocks.get(locationId)

        if (!clock) {
            // Create if not found
            clock = {
                id: locationId,
                locationId,
                clockAnchor: newClockAnchor,
                lastAnchorUpdate: now
            }
        } else {
            // Update existing
            clock = {
                ...clock,
                clockAnchor: newClockAnchor,
                lastAnchorUpdate: now
            }
        }

        this.clocks.set(locationId, clock)
        return clock
    }

    /**
     * Get occupants at a location at a specific tick
     *
     * In-memory implementation: return empty array
     * Full implementation requires world events cross-reference
     */
    async getOccupantsAtTick(locationId: string, tick: number): Promise<string[]> {
        // Placeholder: requires world events cross-reference
        return []
    }

    /**
     * Clear all clocks (for testing)
     */
    clear(): void {
        this.clocks.clear()
    }
}
