/**
 * Cosmos SQL API implementation of location clock repository
 * Stores location temporal anchors in dedicated SQL container
 */

import { buildLocationClockId, type LocationClock } from '@piquet-h/shared'
import { inject, injectable } from 'inversify'
import type { ICosmosDbSqlClient } from './base/cosmosDbSqlClient.js'
import type { ILocationClockRepository } from './locationClockRepository.js'

@injectable()
export class LocationClockRepositoryCosmos implements ILocationClockRepository {
    private readonly containerName: string

    constructor(@inject('CosmosDbSqlClient') private readonly sqlClient: ICosmosDbSqlClient) {
        // Container name from environment (should be 'locationClocks')
        this.containerName = process.env.COSMOS_SQL_CONTAINER_LOCATION_CLOCKS || 'locationClocks'
    }

    /**
     * Get location clock by ID
     */
    async get(locationId: string): Promise<LocationClock | undefined> {
        const id = buildLocationClockId(locationId)

        try {
            const result = await this.sqlClient.readItem<LocationClock>(this.containerName, id, id)
            return result || undefined
        } catch (error: unknown) {
            // 404 Not Found is expected for uninitialized locations
            if (error && typeof error === 'object' && 'code' in error && error.code === 404) {
                return undefined
            }
            throw error
        }
    }

    /**
     * Initialize new location clock
     */
    async initialize(locationId: string, worldClockTick: number): Promise<LocationClock> {
        const id = buildLocationClockId(locationId)

        const locationClock: LocationClock = {
            id: locationId,
            clockAnchor: worldClockTick,
            lastSynced: new Date().toISOString()
        }

        const created = await this.sqlClient.createItem<LocationClock>(this.containerName, locationClock)
        return created
    }

    /**
     * Update location clock anchor
     */
    async update(locationId: string, worldClockTick: number, etag?: string): Promise<LocationClock> {
        const id = buildLocationClockId(locationId)

        // Try to get existing clock
        const existing = await this.get(locationId)

        // Auto-initialize if not exists
        if (!existing) {
            return this.initialize(locationId, worldClockTick)
        }

        const updated: LocationClock = {
            ...existing,
            clockAnchor: worldClockTick,
            lastSynced: new Date().toISOString()
        }

        // Use provided ETag for concurrency control, or existing one
        const useEtag = etag || existing._etag

        const result = await this.sqlClient.upsertItem<LocationClock>(this.containerName, updated, useEtag)
        return result
    }

    /**
     * Batch update all location clocks
     * 
     * Updates only existing location clocks (lazy initialization on first access).
     * Uses parallel batches of 50 to balance throughput and Cosmos RU limits.
     */
    async batchUpdateAll(worldClockTick: number): Promise<number> {
        const allClocks = await this.listAll()

        // Group into batches
        const BATCH_SIZE = 50
        const batches: LocationClock[][] = []

        for (let i = 0; i < allClocks.length; i += BATCH_SIZE) {
            batches.push(allClocks.slice(i, i + BATCH_SIZE))
        }

        // Process all batches in parallel
        const batchResults = await Promise.all(
            batches.map((batch) =>
                Promise.all(batch.map((clock) => this.update(clock.id, worldClockTick, clock._etag)))
            )
        )

        // Count total updates (each batch returns array of results)
        return batchResults.reduce((total, batchResult) => total + batchResult.length, 0)
    }

    /**
     * List all location clocks
     */
    async listAll(): Promise<LocationClock[]> {
        const query = 'SELECT * FROM c'
        const results = await this.sqlClient.queryItems<LocationClock>(this.containerName, query)
        return results
    }
}
