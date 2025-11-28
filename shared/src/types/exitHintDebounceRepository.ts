/**
 * Exit Hint Debounce Repository Interface
 *
 * Purpose: Debounce repeated identical exit generation hints within a configurable window.
 * Prevents event flooding when a player repeatedly attempts to move in a direction without an exit.
 *
 * Key Design Principles:
 * - Per (player/location/direction) debounce key
 * - Configurable window via EXIT_HINT_DEBOUNCE_MS env var
 * - In-memory implementation for dev/test
 * - Cosmos SQL implementation for prod with partition key on scopeKey
 *
 * Pattern: Similar to IProcessedEventRepository but simpler (no full event storage).
 */

import type { Direction } from '../domainModels.js'

/**
 * Result of checking if a hint should be emitted.
 */
export interface DebounceCheckResult {
    /** Whether to emit the generation hint event */
    emit: boolean
    /** True if this request was debounced (identical request within window) */
    debounceHit: boolean
}

/**
 * Internal record stored for debounce tracking.
 */
export interface ExitHintDebounceRecord {
    /** Unique document ID (for Cosmos) */
    id: string
    /** Scope key pattern: player:<playerId> for efficient partition access */
    scopeKey: string
    /** Debounce key: player:location:direction */
    debounceKey: string
    /** Player ID */
    playerId: string
    /** Origin location ID */
    originLocationId: string
    /** Canonical direction */
    direction: Direction
    /** ISO 8601 timestamp when hint was last emitted */
    lastEmitUtc: string
    /** TTL in seconds (for Cosmos automatic expiration) */
    ttl?: number
}

/**
 * Repository interface for exit hint debounce operations.
 *
 * Implementations:
 * - MemoryExitHintDebounceRepository: In-memory with TTL for dev/test
 * - CosmosExitHintDebounceRepository: Cosmos SQL API for prod
 */
export interface IExitHintDebounceRepository {
    /**
     * Check if a hint should be emitted and record the attempt.
     *
     * Atomically checks if an identical hint was emitted within the debounce window.
     * If not, records this emit time and returns emit=true.
     * If yes, returns emit=false with debounceHit=true.
     *
     * @param playerId - Player ID requesting the exit
     * @param originLocationId - Location ID where exit is requested
     * @param dir - Canonical direction
     * @returns Promise resolving to debounce check result
     */
    shouldEmit(playerId: string, originLocationId: string, dir: Direction): Promise<DebounceCheckResult>

    /**
     * Clear all debounce entries. Useful for testing.
     */
    clear(): void
}

/**
 * Build the debounce key from components.
 * Pattern: playerId:locationId:direction
 */
export function buildDebounceKey(playerId: string, originLocationId: string, direction: Direction): string {
    return `${playerId}:${originLocationId}:${direction}`
}

/**
 * Build the scope key (partition key) from player ID.
 * Pattern: player:<playerId>
 *
 * This ensures all debounce entries for a player are co-located in the same partition.
 */
export function buildScopeKey(playerId: string): string {
    return `player:${playerId}`
}

/**
 * Parse a debounce key into its components.
 * @param debounceKey - The debounce key string
 * @returns Parsed components or null if invalid format
 */
export function parseDebounceKey(debounceKey: string): {
    playerId: string
    originLocationId: string
    direction: Direction
} | null {
    const parts = debounceKey.split(':')
    if (parts.length < 3) return null

    const playerId = parts[0]
    const originLocationId = parts[1]
    // Direction may contain colons in edge cases, so join remaining parts
    const direction = parts.slice(2).join(':') as Direction

    return { playerId, originLocationId, direction }
}
