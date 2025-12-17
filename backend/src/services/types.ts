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
// Location Clock Manager
// ---------------------------------------------------------------------------

/**
 * Service interface for location clock operations
 * Manages temporal anchors for locations, enabling reconciliation of player clocks
 * when entering shared spaces.
 */
export interface ILocationClockManager {
    /**
     * Get the current clock anchor for a location
     * Auto-initializes to world clock tick if not found
     *
     * @param locationId - Location unique identifier
     * @param currentWorldClockTick - Current world clock tick for auto-initialization fallback
     * @returns Clock anchor tick for the location
     */
    getLocationAnchor(locationId: string, currentWorldClockTick: number): Promise<number>

    /**
     * Sync a location's clock anchor to the world clock
     * Called when world clock advances
     *
     * @param locationId - Location unique identifier
     * @param newAnchor - New anchor tick (typically current world clock tick)
     * @returns Updated location clock
     */
    syncLocation(locationId: string, newAnchor: number): Promise<{ clockAnchor: number; locationId: string; lastAnchorUpdate: string }>

    /**
     * Batch sync multiple locations to the world clock
     * Optimized for bulk updates on world clock advancement
     *
     * @param locationIds - Array of location IDs to sync
     * @param newAnchor - New anchor tick for all locations
     * @returns Number of locations successfully synced
     */
    batchSyncLocations(locationIds: string[], newAnchor: number): Promise<number>

    /**
     * Get all players present at a location at a specific world clock tick
     * Supports historical queries for timeline reconstruction
     *
     * @param locationId - Location unique identifier
     * @param tick - World clock tick to query
     * @returns Array of player IDs at the location at that tick
     */
    getOccupantsAtTick(locationId: string, tick: number): Promise<string[]>

    /**
     * Sync all known locations on world clock advancement
     * Called by WorldClockService after advancement
     *
     * @param newWorldClockTick - New world clock tick
     * @returns Number of locations synced
     */
    syncAllLocationsOnClockAdvance(newWorldClockTick: number): Promise<number>
}

// ---------------------------------------------------------------------------
