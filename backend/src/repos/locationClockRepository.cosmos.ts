/**
 * Cosmos SQL API implementation of location clock repository
 * Stores location temporal anchors in dedicated SQL container
 */

import { type LocationClock } from '@piquet-h/shared'
import { inject, injectable } from 'inversify'
import { TelemetryService } from '../telemetry/TelemetryService.js'
import { CosmosDbSqlRepository } from './base/CosmosDbSqlRepository.js'
import type { ICosmosDbSqlClient } from './base/cosmosDbSqlClient.js'
import type { ILocationClockRepository } from './locationClockRepository.js'

@injectable()
export class LocationClockRepositoryCosmos extends CosmosDbSqlRepository<LocationClock> implements ILocationClockRepository {
    constructor(@inject('CosmosDbSqlClient') sqlClient: ICosmosDbSqlClient, @inject(TelemetryService) telemetryService: TelemetryService) {
        // Container name from environment (should be 'locationClocks')
        const containerName = process.env.COSMOS_SQL_CONTAINER_LOCATION_CLOCKS || 'locationClocks'
        super(sqlClient, containerName, telemetryService)
    }

    /**
     * Get location clock by ID
     */
    async get(locationId: string): Promise<LocationClock | undefined> {
        const result = await this.getById(locationId, locationId)
        return result || undefined
    }

    /**
     * Initialize new location clock
     */
    async initialize(locationId: string, worldClockTick: number): Promise<LocationClock> {
        const locationClock: LocationClock = {
            id: locationId,
            clockAnchor: worldClockTick,
            lastSynced: new Date().toISOString()
        }

        const { resource } = await this.create(locationClock)
        return resource
    }

    /**
     * Update location clock anchor
     */
    async update(locationId: string, worldClockTick: number, etag?: string): Promise<LocationClock> {
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

        const { resource } = await this.replace(locationId, updated, locationId, useEtag)
        return resource
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
            batches.map((batch) => Promise.all(batch.map((clock) => this.update(clock.id, worldClockTick, clock._etag))))
        )

        // Count total updates (each batch returns array of results)
        return batchResults.reduce((total: number, batchResult: LocationClock[]) => total + batchResult.length, 0)
    }

    /**
     * List all location clocks
     */
    async listAll(): Promise<LocationClock[]> {
        const queryText = 'SELECT * FROM c'
        const { items } = await this.query(queryText)
        return items
    }
}
