/**
 * Location Clock Repository - Cosmos SQL Implementation
 *
 * Stores location clock anchors in Cosmos DB SQL API for efficient batch updates
 * and historical queries of occupant presence.
 */

import type { Container } from '@azure/cosmos'
import { inject, injectable } from 'inversify'
import { CosmosDbSqlRepository } from './base/CosmosDbSqlRepository.js'
import type { ICosmosDbSqlClient } from './base/cosmosDbSqlClient.js'
import type { ILocationClockRepository, LocationClock } from './locationClockRepository.js'

@injectable()
export class LocationClockRepositoryCosmos extends CosmosDbSqlRepository<LocationClock> implements ILocationClockRepository {
    constructor(@inject('CosmosDbSqlClient') client: ICosmosDbSqlClient) {
        super(client, 'locationClocks')
    }

    /**
     * Get the location clock container
     */
    private getContainer(): Container {
        return this.container
    }

    /**
     * Get a location clock, auto-initializing if not found
     */
    async get(locationId: string, currentWorldClockTick: number): Promise<LocationClock> {
        const container = this.getContainer()

        try {
            const { resource } = await container.item(locationId).read<LocationClock>()
            if (resource) {
                return resource
            }
        } catch (error) {
            // 404 is expected on first access
            if (error instanceof Error && error.message.includes('NotFound')) {
                // Fall through to create
            } else {
                throw error
            }
        }

        // Auto-initialize
        const now = new Date().toISOString()
        const newClock: LocationClock = {
            id: locationId,
            locationId,
            clockAnchor: currentWorldClockTick,
            lastAnchorUpdate: now
        }

        const { resource: created } = await container.items.create(newClock)
        return created as LocationClock
    }

    /**
     * Batch sync multiple locations
     */
    async batchSync(locationIds: string[], newClockAnchor: number): Promise<number> {
        const container = this.getContainer()
        const now = new Date().toISOString()

        let synced = 0

        // Process in parallel with reasonable batch size
        const batchSize = 25
        for (let i = 0; i < locationIds.length; i += batchSize) {
            const batch = locationIds.slice(i, i + batchSize)

            const promises = batch.map(async (locationId) => {
                try {
                    // Get current state first
                    const { resource: current } = await container.item(locationId).read<LocationClock>()

                    if (current) {
                        // Update existing
                        const updated: LocationClock = {
                            ...current,
                            clockAnchor: newClockAnchor,
                            lastAnchorUpdate: now
                        }

                        await container.item(locationId).replace(updated)
                        return 1
                    }
                } catch (error) {
                    if (error instanceof Error && error.message.includes('NotFound')) {
                        // Create new if not found
                        const newClock: LocationClock = {
                            id: locationId,
                            locationId,
                            clockAnchor: newClockAnchor,
                            lastAnchorUpdate: now
                        }

                        try {
                            await container.items.create(newClock)
                            return 1
                        } catch {
                            // Ignore concurrent creation
                            return 0
                        }
                    }
                }

                return 0
            })

            const results = await Promise.all(promises)
            synced += results.filter((n) => n === 1).length
        }

        return synced
    }

    /**
     * Sync a single location
     */
    async syncSingle(locationId: string, newClockAnchor: number): Promise<LocationClock> {
        const container = this.getContainer()
        const now = new Date().toISOString()

        try {
            // Try to read and update
            const { resource: current } = await container.item(locationId).read<LocationClock>()

            if (current) {
                const updated: LocationClock = {
                    ...current,
                    clockAnchor: newClockAnchor,
                    lastAnchorUpdate: now
                }

                const { resource: result } = await container.item(locationId).replace(updated)

                return result as LocationClock
            }
        } catch (error) {
            if (!(error instanceof Error) || !error.message.includes('NotFound')) {
                throw error
            }
        }

        // Create if not found
        const newClock: LocationClock = {
            id: locationId,
            locationId,
            clockAnchor: newClockAnchor,
            lastAnchorUpdate: now
        }

        const { resource: created } = await container.items.create(newClock)
        return created as LocationClock
    }

    /**
     * Get occupants at a location at a specific tick
     *
     * This queries player location history and player clocks to determine
     * who was at the location at the requested tick.
     * Requires cross-referencing with player state and world events.
     *
     * TODO: Implement cross-container query or require occupant query
     * via world events service
     */
    async getOccupantsAtTick(locationId: string, tick: number): Promise<string[]> {
        // Placeholder: this requires querying player location history
        // which is tracked via world events (player moved to location).
        // Implementation depends on world events container structure.

        // For MVP, return empty array
        // Full implementation will query world events filtered by:
        // - event type: player movement
        // - target location: locationId
        // - tick range that includes the query tick
        // - check player clock hasn't advanced past this tick

        return []
    }
}
