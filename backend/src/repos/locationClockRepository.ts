import type { LocationClock } from '@piquet-h/shared'

/**
 * Repository contract for location clock persistence
 * Per world-time-temporal-reconciliation.md Section 3 (LocationClockManager)
 */
export interface ILocationClockRepository {
    /**
     * Get location clock document by location ID
     * @param locationId - Location unique identifier
     * @returns LocationClock document or undefined if not found
     */
    get(locationId: string): Promise<LocationClock | undefined>

    /**
     * Initialize location clock with world clock anchor
     * Creates new document with given tick as initial anchor
     * @param locationId - Location unique identifier
     * @param worldClockTick - Initial anchor tick
     * @returns Created LocationClock document
     */
    initialize(locationId: string, worldClockTick: number): Promise<LocationClock>

    /**
     * Update location clock anchor to new tick
     * Uses optimistic concurrency control via ETag if provided
     * @param locationId - Location unique identifier
     * @param worldClockTick - New anchor tick
     * @param etag - Optional ETag for concurrency control
     * @returns Updated LocationClock document
     */
    update(locationId: string, worldClockTick: number, etag?: string): Promise<LocationClock>

    /**
     * Batch update all location clocks to new tick
     * Optimized for performance with parallel updates
     * @param worldClockTick - New anchor tick for all locations
     * @returns Number of locations updated
     */
    batchUpdateAll(worldClockTick: number): Promise<number>

    /**
     * List all location clock documents
     * Used for batch operations and diagnostics
     * @returns Array of all LocationClock documents
     */
    listAll(): Promise<LocationClock[]>
}
