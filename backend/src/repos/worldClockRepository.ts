/**
 * World Clock Repository - Interface and types
 *
 * Repository for managing the global world clock state in Cosmos SQL API.
 * Singleton document (id = "global") with optimistic concurrency control.
 *
 * Container: `worldClock` (PK: `/id`)
 * Concurrency: ETag-based optimistic locking
 */

import type { WorldClock } from '@piquet-h/shared'

/**
 * Repository interface for world clock operations
 */
export interface IWorldClockRepository {
    /**
     * Get the current world clock state
     * @returns The world clock document, or null if not initialized
     */
    get(): Promise<WorldClock | null>

    /**
     * Initialize the world clock with starting tick
     * @param initialTick - Starting tick value (default: 0)
     * @returns The initialized world clock document
     * @throws Error if clock already exists
     */
    initialize(initialTick?: number): Promise<WorldClock>

    /**
     * Advance the world clock by duration with optimistic concurrency control
     * @param durationMs - Duration to advance in milliseconds (must be positive)
     * @param reason - Reason for advancement (e.g., "scheduled", "admin", "test")
     * @param currentEtag - Current ETag for optimistic concurrency
     * @returns The updated world clock document
     * @throws Error if durationMs is negative or zero
     * @throws ConflictError if ETag mismatch (concurrent modification detected)
     */
    advance(durationMs: number, reason: string, currentEtag: string): Promise<WorldClock>
}

/**
 * Error thrown when concurrent advancement attempt fails due to ETag mismatch
 */
export class ConcurrentAdvancementError extends Error {
    constructor(message: string = 'Concurrent world clock advancement detected') {
        super(message)
        this.name = 'ConcurrentAdvancementError'
    }
}
