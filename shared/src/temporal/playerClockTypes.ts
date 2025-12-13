/**
 * Player Clock API Types
 *
 * Types and interfaces for player-specific time tracking, drift, and reconciliation.
 * Per world-time-temporal-reconciliation.md Section 2 (PlayerClockAPI).
 */

import type { ReconciliationMethod } from '../models/TemporalLedgerEntry.js'

// Re-export ReconciliationMethod for convenience
export type { ReconciliationMethod }

/**
 * Result of reconciling player clock to a location's world clock anchor
 */
export interface ReconciliationResult {
    /** Player clock tick before reconciliation */
    playerTickBefore: number

    /** Player clock tick after reconciliation */
    playerTickAfter: number

    /** World clock tick at location (reconciliation target) */
    worldClockTick: number

    /** Reconciliation method used */
    reconciliationMethod: ReconciliationMethod

    /** Optional narrative text describing time passage (if generated) */
    narrativeText?: string
}

/**
 * Interface for player clock operations
 */
export interface IPlayerClockAPI {
    /**
     * Advance player clock by action duration
     * Updates player's clockTick and lastAction timestamp
     * Emits Player.Clock.Advanced telemetry event
     *
     * @param playerId - Player unique identifier
     * @param durationMs - Duration to advance in milliseconds (must be positive)
     * @param actionType - Type of action that triggered advancement (e.g., "move", "look")
     * @throws Error if playerId not found or durationMs is negative
     */
    advancePlayerTime(playerId: string, durationMs: number, actionType: string): Promise<void>

    /**
     * Apply idle drift to player clock
     * Calculates drift based on real-time elapsed and configured drift rate
     * Updates player's clockTick and lastDrift timestamp
     * Emits Player.Clock.DriftApplied telemetry event
     *
     * @param playerId - Player unique identifier
     * @param realTimeElapsedMs - Real-world time elapsed in milliseconds
     * @throws Error if playerId not found or realTimeElapsedMs is negative
     */
    applyDrift(playerId: string, realTimeElapsedMs: number): Promise<void>

    /**
     * Reconcile player clock to location's world clock anchor
     * Applies appropriate reconciliation policy based on offset:
     * - Wait: Player behind location (increment player to location)
     * - Slow: Player slightly ahead (rare, location catches up)
     * - Compress: Player far ahead (compress narrative, align to location)
     * Emits Player.Clock.Reconciled telemetry event
     *
     * @param playerId - Player unique identifier
     * @param locationId - Location unique identifier for reconciliation
     * @returns ReconciliationResult with before/after ticks and method used
     * @throws Error if playerId or locationId not found
     */
    reconcile(playerId: string, locationId: string): Promise<ReconciliationResult>

    /**
     * Get player's current time offset from world clock
     * Positive offset = player ahead of world clock
     * Negative offset = player behind world clock
     *
     * @param playerId - Player unique identifier
     * @returns Offset in milliseconds (player clock - world clock)
     * @throws Error if playerId not found
     */
    getPlayerOffset(playerId: string): Promise<number>
}
