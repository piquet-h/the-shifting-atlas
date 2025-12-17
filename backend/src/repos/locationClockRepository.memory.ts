/**
 * In-memory implementation of location clock repository
 * For unit tests and local development without Cosmos DB
 */

import { buildLocationClockId, type LocationClock } from '@piquet-h/shared'
import { injectable } from 'inversify'
import type { ILocationClockRepository } from './locationClockRepository.js'

@injectable()
export class MemoryLocationClockRepository implements ILocationClockRepository {
    private store: Map<string, LocationClock> = new Map()
    private etagCounter = 0

    /**
     * Get location clock by ID
     */
    async get(locationId: string): Promise<LocationClock | undefined> {
        const id = buildLocationClockId(locationId)
        return this.store.get(id)
    }

    /**
     * Initialize new location clock
     */
    async initialize(locationId: string, worldClockTick: number): Promise<LocationClock> {
        const id = buildLocationClockId(locationId)

        // Check if already exists
        if (this.store.has(id)) {
            throw new Error(`Location clock already exists: ${locationId}`)
        }

        const locationClock: LocationClock = {
            id: locationId,
            clockAnchor: worldClockTick,
            lastSynced: new Date().toISOString(),
            _etag: `etag-${++this.etagCounter}`
        }

        this.store.set(id, locationClock)
        return locationClock
    }

    /**
     * Update location clock anchor
     */
    async update(locationId: string, worldClockTick: number, etag?: string): Promise<LocationClock> {
        const id = buildLocationClockId(locationId)
        const existing = this.store.get(id)

        // Auto-initialize if not exists
        if (!existing) {
            return this.initialize(locationId, worldClockTick)
        }

        // Check ETag for concurrency control if provided
        if (etag && existing._etag !== etag) {
            throw new Error(`Concurrent modification detected for location clock: ${locationId}`)
        }

        const updated: LocationClock = {
            ...existing,
            clockAnchor: worldClockTick,
            lastSynced: new Date().toISOString(),
            _etag: `etag-${++this.etagCounter}`
        }

        this.store.set(id, updated)
        return updated
    }

    /**
     * Batch update all location clocks
     */
    async batchUpdateAll(worldClockTick: number): Promise<number> {
        const allClocks = Array.from(this.store.values())

        // Update all in parallel (simulated)
        await Promise.all(allClocks.map((clock) => this.update(clock.id, worldClockTick, clock._etag)))

        return allClocks.length
    }

    /**
     * List all location clocks
     */
    async listAll(): Promise<LocationClock[]> {
        return Array.from(this.store.values())
    }

    /**
     * Clear all data (test helper)
     */
    clear(): void {
        this.store.clear()
        this.etagCounter = 0
    }
}
