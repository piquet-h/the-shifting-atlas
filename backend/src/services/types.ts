/**
 * Service Types
 *
 * Interfaces and types for backend services.
 */

// ---------------------------------------------------------------------------
// Description Composer Service
// ---------------------------------------------------------------------------

/**
 * Context information for determining which layers are active
 */
export interface ViewContext {
    /** Current weather type (e.g., 'rain', 'clear', 'snow') */
    weather?: string
    /** Time bucket (e.g., 'dawn', 'day', 'dusk', 'night') */
    time?: string
    /** Season (e.g., 'spring', 'summer', 'fall', 'winter') */
    season?: string
    /** ISO timestamp of the view request */
    timestamp: string
}

/**
 * Provenance information for a single layer
 */
export interface LayerProvenance {
    /** Layer unique ID */
    id: string
    /** Layer type */
    layerType: string
    /** Priority value */
    priority: number
    /** Whether this layer was superseded by another */
    superseded?: boolean
    /** ISO timestamp when layer was authored */
    authoredAt: string
}

/**
 * Complete provenance metadata for a compiled description
 */
export interface CompiledProvenance {
    /** Location ID this compilation is for */
    locationId: string
    /** Layers that contributed to this compilation (in assembly order) */
    layers: LayerProvenance[]
    /** Context used for layer filtering */
    context: ViewContext
    /** ISO timestamp when compilation occurred */
    compiledAt: string
}

/**
 * Result of compiling all description layers for a location
 */
export interface CompiledDescription {
    /** Plain text assembled from all active layers */
    text: string
    /** HTML version (markdown-to-HTML conversion) */
    html: string
    /** Provenance metadata showing which layers contributed */
    provenance: CompiledProvenance
}

/**
 * Options for description compilation
 */
export interface CompileOptions {
    /**
     * The canonical base description for the location (from Location.description).
     * This is the immutable foundation that layers are applied on top of.
     * Layers in the repository (dynamic, ambient, enhancement) modify/augment this base.
     */
    baseDescription?: string
}

// ---------------------------------------------------------------------------
// World Clock Service
// ---------------------------------------------------------------------------

/**
 * Service interface for world clock operations
 */
export interface IWorldClockService {
    /**
     * Get the current world clock tick
     * @returns Current tick in milliseconds, or 0 if clock not initialized
     */
    getCurrentTick(): Promise<number>

    /**
     * Advance the world clock by duration
     * Emits World.Clock.Advanced telemetry event
     * Uses optimistic concurrency control to prevent conflicts
     *
     * @param durationMs - Duration to advance in milliseconds (must be positive)
     * @param reason - Reason for advancement (e.g., "scheduled", "admin", "test")
     * @returns New tick value after advancement
     * @throws Error if durationMs is negative or zero
     * @throws ConcurrentAdvancementError if another advancement occurred concurrently
     */
    advanceTick(durationMs: number, reason: string): Promise<number>

    /**
     * Query world clock tick at specific timestamp (historical query)
     * Reconstructs tick state by replaying advancement history
     *
     * @param timestamp - ISO 8601 timestamp to query
     * @returns Tick value at that timestamp, or null if timestamp before clock initialization
     */
    getTickAt(timestamp: Date): Promise<number | null>
}

// ---------------------------------------------------------------------------
// Player Clock API
// ---------------------------------------------------------------------------

// Re-export types from shared package for convenience
export type { IPlayerClockAPI, ReconciliationResult, ReconciliationMethod } from '@piquet-h/shared'

// ---------------------------------------------------------------------------
// Location Clock Manager
// ---------------------------------------------------------------------------

/**
 * Service interface for location clock operations
 * Per world-time-temporal-reconciliation.md Section 3 (LocationClockManager)
 */
export interface ILocationClockManager {
    /**
     * Get location's current world clock anchor
     * Auto-initializes to current world clock if location has no anchor set
     *
     * @param locationId - Location unique identifier
     * @returns Current clock anchor tick in milliseconds
     */
    getLocationAnchor(locationId: string): Promise<number>

    /**
     * Sync location to new world clock tick
     * Called when world clock advances to update location anchor
     * Emits Location.Clock.Synced telemetry event
     *
     * @param locationId - Location unique identifier
     * @param worldClockTick - New world clock tick to sync to
     */
    syncLocation(locationId: string, worldClockTick: number): Promise<void>

    /**
     * Query all players present at location at specific historical tick
     * Cross-references player clocks + player locations at requested tick
     * Used for historical queries like "Who was here when Fred arrived?"
     *
     * @param locationId - Location unique identifier
     * @param tick - World clock tick to query at
     * @returns Array of player IDs present at location at that tick
     */
    getOccupantsAtTick(locationId: string, tick: number): Promise<string[]>

    /**
     * Batch sync all locations to new world clock tick
     * Optimized batch update strategy with parallelization
     * Called by world clock advancement handler
     *
     * @param worldClockTick - New world clock tick to sync all locations to
     * @returns Number of locations synced
     */
    syncAllLocations(worldClockTick: number): Promise<number>
}
