/**
 * Prefetch Batch Generation Service
 *
 * Handles proactive batch generation enqueueing when a player arrives at a frontier location.
 * Implements debouncing and idempotency to prevent redundant generation requests.
 *
 * Atlas-constrained selection: uses selectFrontierExits to respect forbidden exits and
 * prioritise atlas-significant directions (route-continuity, terrain trends) when a cap applies.
 *
 * Issue: piquet-h/the-shifting-atlas#811
 */

import type { Direction, ExitAvailabilityMetadata, TerrainType } from '@piquet-h/shared'
import type { WorldEventEnvelope } from '@piquet-h/shared/events'
import { v4 as uuidv4 } from 'uuid'
import { selectFrontierExits } from '../seeding/frontierSelectionPolicy.js'

/**
 * Configuration for prefetch batch generation
 */
export interface PrefetchConfig {
    /** Maximum number of pending exits to include in a single batch generation event */
    maxBatchSize: number
    /** Debounce window in milliseconds (default 5 minutes) */
    debounceWindowMs: number
}

/**
 * Default configuration
 */
export const DEFAULT_PREFETCH_CONFIG: PrefetchConfig = {
    maxBatchSize: 20,
    debounceWindowMs: 5 * 60 * 1000 // 5 minutes
}

/**
 * In-memory debounce tracker for prefetch requests
 * Maps locationId to timestamp of last prefetch event
 */
class PrefetchDebounceTracker {
    private lastPrefetch: Map<string, number> = new Map()

    /**
     * Check if a prefetch should be debounced for a given location
     * @param locationId - Location ID to check
     * @param debounceWindowMs - Debounce window in milliseconds
     * @returns true if prefetch should be skipped (debounced), false otherwise
     */
    shouldDebounce(locationId: string, debounceWindowMs: number): boolean {
        const lastTimestamp = this.lastPrefetch.get(locationId)
        if (!lastTimestamp) {
            return false
        }

        const now = Date.now()
        const elapsed = now - lastTimestamp
        return elapsed < debounceWindowMs
    }

    /**
     * Record a prefetch event for a location
     * @param locationId - Location ID
     */
    recordPrefetch(locationId: string): void {
        this.lastPrefetch.set(locationId, Date.now())
    }

    /**
     * Clear debounce state (for testing)
     */
    clear(): void {
        this.lastPrefetch.clear()
    }
}

/**
 * Singleton debounce tracker
 */
const debounceTracker = new PrefetchDebounceTracker()

/**
 * Get the debounce tracker instance (for testing)
 */
export function getDebounceTracker(): PrefetchDebounceTracker {
    return debounceTracker
}

/**
 * Extract pending exit directions from exit availability metadata
 * @param metadata - Exit availability metadata
 * @returns Array of pending exit directions
 */
export function extractPendingExits(metadata: ExitAvailabilityMetadata | undefined): Direction[] {
    if (!metadata?.pending) {
        return []
    }

    return Object.keys(metadata.pending) as Direction[]
}

/**
 * Check if a location requires prefetch (has pending exits)
 * @param exitAvailability - Exit availability metadata
 * @returns true if location has pending exits, false otherwise
 */
export function requiresPrefetch(exitAvailability: ExitAvailabilityMetadata | undefined): boolean {
    return extractPendingExits(exitAvailability).length > 0
}

/**
 * Create a batch generation event envelope for prefetch
 * @param locationId - Root location ID
 * @param terrain - Terrain type of the location
 * @param arrivalDirection - Direction the player arrived from
 * @param pendingExitCount - Number of pending exits
 * @param correlationId - Correlation ID from the move request
 * @param config - Prefetch configuration
 * @returns World event envelope for batch generation
 */
export function createBatchGenerationEvent(
    locationId: string,
    terrain: TerrainType,
    arrivalDirection: Direction,
    pendingExitCount: number,
    correlationId: string,
    config: PrefetchConfig = DEFAULT_PREFETCH_CONFIG,
    locationTags?: string[]
): WorldEventEnvelope {
    // Cap batch size at configuration limit
    const batchSize = Math.min(pendingExitCount, config.maxBatchSize)

    const realmKey = pickRealmKey(locationTags)

    const event: WorldEventEnvelope = {
        eventId: uuidv4(),
        type: 'World.Location.BatchGenerate',
        occurredUtc: new Date().toISOString(),
        actor: {
            kind: 'system'
        },
        correlationId,
        idempotencyKey: `prefetch:${locationId}:${Date.now()}`,
        version: 1,
        payload: {
            rootLocationId: locationId,
            terrain,
            arrivalDirection,
            expansionDepth: 1, // Prefetch only generates immediate neighbors
            batchSize,
            ...(realmKey ? { realmKey } : {})
        }
    }

    return event
}

/**
 * Determine if prefetch should be triggered and create event if needed.
 *
 * Uses atlas-constrained frontier selection to determine eligible directions:
 *   - Forbidden exits are excluded regardless of their pending status.
 *   - When location has atlas tags, directions are ranked by atlas significance
 *     (route-continuity trend, terrain trend) so the most coherent exits fill the batch first.
 *   - The batch size reflects the eligible direction count, capped at `config.maxBatchSize`.
 *     When more eligible directions exist than the cap allows, atlas scoring determines which
 *     subset is selected (highest-scoring directions fill the batch first).
 *
 * @param locationId - Root location ID
 * @param terrain - Terrain type of the location
 * @param arrivalDirection - Direction the player arrived from
 * @param exitAvailability - Exit availability metadata
 * @param correlationId - Correlation ID from the move request
 * @param config - Prefetch configuration (maxBatchSize caps the selected direction count)
 * @param locationTags - Tags on the location (used for atlas-aware direction scoring)
 * @returns Event envelope if prefetch should happen, undefined if debounced/not needed;
 *          selectedDirections carries the atlas-scored directions for telemetry.
 */
export function tryCreatePrefetchEvent(
    locationId: string,
    terrain: TerrainType,
    arrivalDirection: Direction,
    exitAvailability: ExitAvailabilityMetadata | undefined,
    correlationId: string,
    config: PrefetchConfig = DEFAULT_PREFETCH_CONFIG,
    locationTags?: string[]
): { event?: WorldEventEnvelope; debounced: boolean; pendingExitCount: number; selectedDirections?: Direction[] } {
    // Use atlas-constrained frontier selection to determine eligible (non-forbidden, scored) directions.
    // Forbidden exits are excluded; atlas tags rank directions by significance when a cap applies.
    const selectionResult = selectFrontierExits(
        {
            id: locationId,
            name: '',
            description: '',
            tags: locationTags,
            exitAvailability
        },
        config.maxBatchSize
    )

    const selectedDirections = selectionResult.directions
    if (selectedDirections.length === 0) {
        return { debounced: false, pendingExitCount: 0 }
    }

    // Check debounce
    if (debounceTracker.shouldDebounce(locationId, config.debounceWindowMs)) {
        return { debounced: true, pendingExitCount: selectedDirections.length, selectedDirections }
    }

    // Create event using the eligible direction count (not raw pending count) for batch sizing.
    const event = createBatchGenerationEvent(
        locationId,
        terrain,
        arrivalDirection,
        selectedDirections.length,
        correlationId,
        config,
        locationTags
    )

    debounceTracker.recordPrefetch(locationId)

    return { event, debounced: false, pendingExitCount: selectedDirections.length, selectedDirections }
}

function pickRealmKey(locationTags: string[] | undefined): string | undefined {
    if (!locationTags || locationTags.length === 0) {
        return undefined
    }

    // Prefer macro area constraints first (strongest spatial coherence), then settlement,
    // then fallback to macro route lineage.
    const macroArea = locationTags.find((tag) => tag.startsWith('macro:area:'))
    if (macroArea) {
        return macroArea
    }

    const settlement = locationTags.find((tag) => tag.startsWith('settlement:'))
    if (settlement) {
        return settlement
    }

    const macroRoute = locationTags.find((tag) => tag.startsWith('macro:route:'))
    if (macroRoute) {
        return macroRoute
    }

    return undefined
}
