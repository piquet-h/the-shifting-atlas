/**
 * LocationClock - SQL API document for location temporal anchors
 *
 * Purpose: Store world clock anchor points for each location to enable player timeline reconciliation.
 * Per world-time-temporal-reconciliation.md Section 3 (LocationClockManager).
 *
 * Container: `locationClocks` in Cosmos SQL API
 * Partition key: `/id` (location GUID for efficient per-location queries)
 *
 * Storage Decision (M3c Temporal PI-0):
 * - Uses SQL API container (not Gremlin graph property) for:
 *   1. Better batch update performance when world clock advances
 *   2. Cost-effective writes at scale (cheaper than graph property updates)
 *   3. Consistency with other temporal data (WorldClock, PlayerDoc both in SQL API)
 *   4. Simpler cross-container queries for historical occupant lookups
 * - Risk: LOW (vs DATA-MODEL risk if using graph properties)
 */

/**
 * Location clock document tracking temporal anchor for a location
 */
export interface LocationClock {
    /** Location unique identifier (GUID) - also serves as partition key */
    id: string

    /** Current world clock tick anchor for this location (milliseconds) */
    clockAnchor: number

    /** ISO 8601 timestamp when anchor was last synchronized */
    lastSynced: string

    /** ETag for optimistic concurrency control (managed by Cosmos) */
    _etag?: string
}

/**
 * Build location clock document ID from location ID
 *
 * Currently a 1:1 identity mapping, but function provides:
 * - API consistency with other ID builders (buildWorldClockId, buildPlayerScopeKey)
 * - Future extensibility point for ID prefixing/namespacing without breaking callers
 * - Clear contract: "location ID → location clock document ID"
 *
 * @param locationId - Location GUID
 * @returns Location clock document ID (same as locationId for 1:1 mapping)
 */
export function buildLocationClockId(locationId: string): string {
    return locationId
}
