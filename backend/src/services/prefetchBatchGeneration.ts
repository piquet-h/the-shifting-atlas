/**
 * Prefetch Batch Generation Service
 *
 * Handles proactive batch generation enqueueing when a player arrives at a frontier location.
 * Implements debouncing and idempotency to prevent redundant generation requests.
 *
 * Issue: piquet-h/the-shifting-atlas#811
 */

import type { Direction, ExitAvailabilityMetadata, TerrainType } from '@piquet-h/shared'
import type { WorldEventEnvelope } from '@piquet-h/shared/events'
import { v4 as uuidv4 } from 'uuid'

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
    config: PrefetchConfig = DEFAULT_PREFETCH_CONFIG
): WorldEventEnvelope {
    // Cap batch size at configuration limit
    const batchSize = Math.min(pendingExitCount, config.maxBatchSize)

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
            batchSize
        }
    }

    return event
}

/**
 * Determine if prefetch should be triggered and create event if needed
 * @param locationId - Root location ID
 * @param terrain - Terrain type of the location
 * @param arrivalDirection - Direction the player arrived from
 * @param exitAvailability - Exit availability metadata
 * @param correlationId - Correlation ID from the move request
 * @param config - Prefetch configuration
 * @returns Event envelope if prefetch should happen, undefined if debounced/not needed
 */
export function tryCreatePrefetchEvent(
    locationId: string,
    terrain: TerrainType,
    arrivalDirection: Direction,
    exitAvailability: ExitAvailabilityMetadata | undefined,
    correlationId: string,
    config: PrefetchConfig = DEFAULT_PREFETCH_CONFIG
): { event?: WorldEventEnvelope; debounced: boolean; pendingExitCount: number } {
    // Check if location has pending exits
    const pendingExits = extractPendingExits(exitAvailability)
    if (pendingExits.length === 0) {
        return { debounced: false, pendingExitCount: 0 }
    }

    // Check debounce
    if (debounceTracker.shouldDebounce(locationId, config.debounceWindowMs)) {
        return { debounced: true, pendingExitCount: pendingExits.length }
    }

    // Create event and record debounce
    const event = createBatchGenerationEvent(
        locationId,
        terrain,
        arrivalDirection,
        pendingExits.length,
        correlationId,
        config
    )

    debounceTracker.recordPrefetch(locationId)

    return { event, debounced: false, pendingExitCount: pendingExits.length }
}
