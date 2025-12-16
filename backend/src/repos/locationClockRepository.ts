/**
 * Location Clock Repository - Interface and types
 *
 * Repository for managing location-based temporal anchors in Cosmos SQL API.
 * Each location maintains a clock anchor (world clock tick) that serves as
 * a reconciliation point when players enter shared spaces.
 *
 * Container: `locationClocks` (PK: `/locationId`)
 */

/**
 * Location clock document schema
 */
export interface LocationClock {
    /** Unique identifier (location ID) */
    id: string

    /** Location ID (for clarity in queries) */
    locationId: string

    /** Current world clock anchor tick for this location */
    clockAnchor: number

    /** ISO 8601 timestamp of last anchor update */
    lastAnchorUpdate: string

    /** ETag for optimistic concurrency control */
    _etag?: string
}

/**
 * Repository interface for location clock operations
 */
export interface ILocationClockRepository {
    /**
     * Get the location clock for a specific location
     * Auto-initializes to current world clock if not found
     *
     * @param locationId - Location unique identifier
     * @param currentWorldClockTick - Current world clock tick (for auto-init)
     * @returns The location clock document
     */
    get(locationId: string, currentWorldClockTick: number): Promise<LocationClock>

    /**
     * Batch update location clocks to sync with world clock
     * Called when world clock advances to keep all locations synchronized.
     * Uses bulk operations for efficiency.
     *
     * @param locationIds - Array of location IDs to sync
     * @param newClockAnchor - New anchor tick to set for all locations
     * @returns Number of locations updated
     */
    batchSync(locationIds: string[], newClockAnchor: number): Promise<number>

    /**
     * Sync a single location to a new clock anchor
     *
     * @param locationId - Location unique identifier
     * @param newClockAnchor - New anchor tick
     * @returns Updated location clock document
     */
    syncSingle(locationId: string, newClockAnchor: number): Promise<LocationClock>

    /**
     * Query occupants of a location at a specific world clock tick
     * Cross-references player location history and player clocks
     *
     * @param locationId - Location unique identifier
     * @param tick - World clock tick to query
     * @returns Array of player IDs present at the location at the specified tick
     */
    getOccupantsAtTick(locationId: string, tick: number): Promise<string[]>
}
