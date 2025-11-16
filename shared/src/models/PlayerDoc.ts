/**
 * PlayerDoc - SQL API projection for mutable player state
 *
 * Per ADR-002, player state is migrated to Cosmos SQL API for better partition isolation
 * and cost-efficient mutable data storage. This document model represents the core player
 * projection with essential fields for gameplay operations.
 *
 * Partition key: `/id` (player GUID for optimal isolation)
 * Container: `players` in Cosmos SQL API
 */

/**
 * Core player document stored in Cosmos SQL API
 */
export interface PlayerDoc {
    /** Player unique identifier (GUID) - also serves as partition key */
    id: string

    /** ISO 8601 timestamp when player was created */
    createdUtc: string

    /** ISO 8601 timestamp when player document was last updated */
    updatedUtc: string

    /** Current location ID where player is positioned */
    currentLocationId: string

    /** Flexible player attributes (HP, stamina, stats, flags, etc.) */
    attributes?: Record<string, number | string | boolean>

    /** Version counter for inventory synchronization across containers */
    inventoryVersion?: number
}
