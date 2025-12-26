/**
 * Reconcile Engine Types
 *
 * Types and interfaces for reconciliation engine that aligns player timelines
 * with location temporal anchors using wait/slow/compress policies.
 *
 * Per world-time-temporal-reconciliation.md Section 5 (ReconcileEngine).
 */

import type { ReconciliationMethod, ReconciliationResult } from './playerClockTypes.js'

// Re-export for convenience
export type { ReconciliationMethod, ReconciliationResult }

/**
 * Interface for reconciliation engine
 * Implements policies for aligning player clocks to location temporal anchors
 */
export interface IReconcileEngine {
    /**
     * Reconcile player clock to location clock anchor
     * Applies appropriate policy based on offset between player and location:
     * - Wait: Player behind location (negative offset) → advance player to location
     * - Slow: Player slightly ahead (0 < offset < SLOW_THRESHOLD) → rare edge case
     * - Compress: Player far ahead (offset >= SLOW_THRESHOLD) → compress narrative, align to location
     *
     * @param playerClock - Player's current clock tick in milliseconds
     * @param locationClock - Location's current clock anchor in milliseconds
     * @param playerId - Player unique identifier (for telemetry/narrative context)
     * @param locationId - Location unique identifier (for telemetry/narrative context)
     * @returns ReconciliationResult with method used, ticks before/after, and optional narrative
     */
    reconcile(playerClock: number, locationClock: number, playerId: string, locationId: string): Promise<ReconciliationResult>
}
