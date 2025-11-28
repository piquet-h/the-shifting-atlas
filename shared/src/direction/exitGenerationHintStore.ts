/**
 * Exit Generation Hint Store (N4 - Issue #35)
 *
 * PURPOSE: Track and debounce exit generation requests to avoid duplicate events.
 *
 * When a player attempts to move in a valid canonical direction but no EXIT edge exists,
 * we emit a generation hint event. This store debounces repeated identical requests
 * within a configurable window to prevent event flooding.
 *
 * DEBOUNCE STRATEGY:
 * - Key: `${playerId}:${locationId}:${direction}`
 * - Window: Configurable (default 60 seconds)
 * - Behavior: First request in window emits event, subsequent requests are silently debounced
 *
 * MEMORY MANAGEMENT:
 * - In-memory store with TTL-based expiration
 * - Cleanup runs on each check to remove stale entries
 * - Single debounce entry per player/location/direction combination
 */

import type { Direction } from '../domainModels.js'

/**
 * Exit generation hint context for queue-based processing.
 * Contains all context needed to prioritize and generate new exits.
 */
export interface ExitGenerationHint {
    /** Player ID (should be hashed for privacy in telemetry) */
    playerId: string
    /** Origin location where the exit is requested */
    originLocationId: string
    /** Canonical direction requested (validated against Direction enum) */
    direction: Direction
    /** ISO 8601 timestamp when the request was made */
    timestamp: string
}

/**
 * Result of checking if a generation hint should be emitted.
 */
export interface ExitGenerationHintResult {
    /** Whether to emit the generation hint event */
    shouldEmit: boolean
    /** True if this request was debounced (identical request within window) */
    debounceHit: boolean
    /** The generation hint payload (always present, even if debounced) */
    hint: ExitGenerationHint
}

/**
 * Configuration for the exit generation hint store.
 */
export interface ExitGenerationHintStoreConfig {
    /** Debounce window in milliseconds (default: 60000 = 60 seconds) */
    debounceWindowMs: number
}

const DEFAULT_CONFIG: ExitGenerationHintStoreConfig = {
    debounceWindowMs: 60_000 // 60 seconds
}

/** Internal debounce entry tracking last emit time */
interface DebounceEntry {
    /** Timestamp when event was last emitted for this key */
    lastEmitTimestamp: number
}

/**
 * In-memory store for debouncing exit generation hints.
 *
 * Thread-safety: This implementation is NOT thread-safe.
 * In Node.js single-threaded context, this is acceptable.
 * For multi-instance scenarios, consider Redis-based debouncing.
 */
export class ExitGenerationHintStore {
    private readonly debounceMap: Map<string, DebounceEntry> = new Map()
    private readonly config: ExitGenerationHintStoreConfig
    private cleanupTimer: ReturnType<typeof setTimeout> | null = null

    constructor(config: Partial<ExitGenerationHintStoreConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config }
        // Schedule periodic cleanup (runs every debounce window * 2)
        this.scheduleCleanup()
    }

    /**
     * Check if a generation hint should be emitted for the given context.
     *
     * @param playerId - Player ID (will be stored as-is; caller should hash for telemetry)
     * @param originLocationId - Location ID where exit is requested
     * @param direction - Canonical direction (validated Direction enum value)
     * @returns Result indicating whether to emit and the hint payload
     */
    checkAndRecord(playerId: string, originLocationId: string, direction: Direction): ExitGenerationHintResult {
        const now = Date.now()
        const key = this.buildKey(playerId, originLocationId, direction)
        const hint: ExitGenerationHint = {
            playerId,
            originLocationId,
            direction,
            timestamp: new Date(now).toISOString()
        }

        const existing = this.debounceMap.get(key)

        // Check if within debounce window
        if (existing) {
            const elapsed = now - existing.lastEmitTimestamp
            if (elapsed < this.config.debounceWindowMs) {
                // Debounce hit - don't emit
                return {
                    shouldEmit: false,
                    debounceHit: true,
                    hint
                }
            }
        }

        // Not debounced - record and allow emit
        this.debounceMap.set(key, { lastEmitTimestamp: now })
        return {
            shouldEmit: true,
            debounceHit: false,
            hint
        }
    }

    /**
     * Clear all debounce entries. Useful for testing.
     */
    clear(): void {
        this.debounceMap.clear()
    }

    /**
     * Get current debounce configuration.
     */
    getConfig(): ExitGenerationHintStoreConfig {
        return { ...this.config }
    }

    /**
     * Get the number of active debounce entries.
     */
    get size(): number {
        return this.debounceMap.size
    }

    /**
     * Stop the cleanup timer. Call this when shutting down to allow clean exit.
     */
    dispose(): void {
        if (this.cleanupTimer) {
            clearTimeout(this.cleanupTimer)
            this.cleanupTimer = null
        }
    }

    /**
     * Build the debounce key from components.
     */
    private buildKey(playerId: string, locationId: string, direction: Direction): string {
        return `${playerId}:${locationId}:${direction}`
    }

    /**
     * Schedule periodic cleanup of stale entries.
     */
    private scheduleCleanup(): void {
        // Run cleanup at 2x debounce window interval
        const cleanupIntervalMs = this.config.debounceWindowMs * 2
        this.cleanupTimer = setTimeout(() => {
            this.cleanupStaleEntries()
            this.scheduleCleanup()
        }, cleanupIntervalMs)
        // Unref to allow Node.js to exit even if timer is pending
        this.cleanupTimer.unref()
    }

    /**
     * Remove entries that are older than the debounce window.
     */
    private cleanupStaleEntries(): void {
        const now = Date.now()
        const threshold = now - this.config.debounceWindowMs

        for (const [key, entry] of this.debounceMap.entries()) {
            if (entry.lastEmitTimestamp < threshold) {
                this.debounceMap.delete(key)
            }
        }
    }
}

// Singleton instance for global use (similar to playerHeadingStore pattern)
let globalExitGenerationHintStore: ExitGenerationHintStore | null = null

/**
 * Get the global exit generation hint store instance.
 * Creates the instance lazily on first access.
 */
export function getExitGenerationHintStore(config?: Partial<ExitGenerationHintStoreConfig>): ExitGenerationHintStore {
    if (!globalExitGenerationHintStore) {
        globalExitGenerationHintStore = new ExitGenerationHintStore(config)
    }
    return globalExitGenerationHintStore
}

/**
 * Reset the global exit generation hint store (for testing).
 */
export function resetExitGenerationHintStore(): void {
    if (globalExitGenerationHintStore) {
        globalExitGenerationHintStore.dispose()
        globalExitGenerationHintStore = null
    }
}

/**
 * Hash a player ID for privacy in telemetry.
 * Uses a simple hash that's consistent but not reversible.
 *
 * @param playerId - The raw player ID (GUID)
 * @returns A hashed string suitable for telemetry
 */
export function hashPlayerIdForTelemetry(playerId: string): string {
    // Simple hash using djb2 algorithm - fast and produces consistent results
    let hash = 5381
    for (let i = 0; i < playerId.length; i++) {
        hash = (hash * 33) ^ playerId.charCodeAt(i)
    }
    // Convert to unsigned 32-bit and then to hex string
    return (hash >>> 0).toString(16)
}
