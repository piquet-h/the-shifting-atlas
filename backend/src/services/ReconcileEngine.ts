/**
 * Reconcile Engine Implementation
 *
 * Implements reconciliation policies for aligning player timelines with location
 * temporal anchors. Uses wait/slow/compress policies based on offset magnitude.
 *
 * Per world-time-temporal-reconciliation.md Section 5 (ReconcileEngine).
 */

import type { ReconciliationResult } from '@piquet-h/shared'
import { getTemporalConfig } from '@piquet-h/shared'
import { injectable } from 'inversify'

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

@injectable()
export class ReconcileEngine implements IReconcileEngine {
    /**
     * Reconcile player clock to location clock anchor
     * Applies appropriate policy based on offset between player and location
     *
     * @param playerClock - Player's current clock tick in milliseconds
     * @param locationClock - Location's current clock anchor in milliseconds
     * @param _playerId - Player unique identifier (reserved for future telemetry/narrative context)
     * @param _locationId - Location unique identifier (reserved for future telemetry/narrative context)
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async reconcile(playerClock: number, locationClock: number, _playerId: string, _locationId: string): Promise<ReconciliationResult> {
        // Get temporal configuration (slow threshold)
        const config = getTemporalConfig()

        // Calculate offset (player - location)
        const offset = playerClock - locationClock

        // Player tick before reconciliation
        const playerTickBefore = playerClock

        // Determine reconciliation method and compute result
        if (offset === 0) {
            // Already synchronized - no action needed
            return {
                playerTickBefore,
                playerTickAfter: playerClock,
                worldClockTick: locationClock,
                reconciliationMethod: 'wait', // Use wait as default for no-op case
                narrativeText: undefined // No narrative when already synchronized
            }
        } else if (offset < 0) {
            // Player behind location → WAIT policy
            // Advance player clock to location anchor
            return {
                playerTickBefore,
                playerTickAfter: locationClock,
                worldClockTick: locationClock,
                reconciliationMethod: 'wait',
                narrativeText: undefined // Narrative generation delegated to NarrativeLayer
            }
        } else if (offset > 0 && offset < config.slowThresholdMs) {
            // Player slightly ahead → SLOW policy (rare edge case)
            // Player stays ahead, location would catch up in full implementation
            return {
                playerTickBefore,
                playerTickAfter: playerClock, // Player clock stays ahead
                worldClockTick: locationClock,
                reconciliationMethod: 'slow',
                narrativeText: undefined
            }
        } else {
            // Player far ahead (offset >= slowThreshold) → COMPRESS policy
            // Compress player back to location anchor
            return {
                playerTickBefore,
                playerTickAfter: locationClock,
                worldClockTick: locationClock,
                reconciliationMethod: 'compress',
                narrativeText: undefined // Narrative generation delegated to NarrativeLayer
            }
        }
    }
}
