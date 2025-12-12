/**
 * WorldClock - Global world time state document
 *
 * Purpose: Single source of truth for world clock progression with immutable audit trail.
 *
 * Container: `worldClock` in Cosmos SQL API
 * Partition key: `/id` (singleton document with id = "global")
 * Optimistic concurrency: Uses ETag for concurrent advancement protection
 *
 * Per world-time-temporal-reconciliation.md Section 1 (WorldClockService).
 */

/**
 * Advancement log entry for immutable history tracking
 */
export interface AdvancementLog {
    /** ISO 8601 timestamp when advancement occurred */
    timestamp: string
    /** Duration advanced in milliseconds */
    durationMs: number
    /** Reason for advancement (e.g., "scheduled", "admin", "test") */
    reason: string
    /** World clock tick after advancement */
    tickAfter: number
}

/**
 * World clock document
 */
export interface WorldClock {
    /** Document unique identifier (always "global" for singleton) */
    id: string

    /** Current world clock tick in milliseconds (monotonically increasing) */
    currentTick: number

    /** ISO 8601 timestamp of last advancement */
    lastAdvanced: string

    /** Immutable log of all advancements (append-only) */
    advancementHistory: AdvancementLog[]

    /** ETag for optimistic concurrency control (managed by Cosmos) */
    _etag?: string
}

/**
 * Build the singleton world clock document ID
 * @returns World clock document ID ("global")
 */
export function buildWorldClockId(): string {
    return 'global'
}
