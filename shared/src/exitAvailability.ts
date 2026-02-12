/**
 * Exit availability state representation for frontier expansion.
 *
 * Distinguishes between:
 * - hard: Exit exists and is traversable
 * - pending: Exit is valid but awaiting generation
 * - forbidden: Direction is permanently blocked (never generate)
 *
 * Related: docs/concept/exit-intent-capture.md
 */

import type { Direction } from './domainModels.js'

/**
 * Exit availability state.
 *
 * - `hard`: Exit edge exists and is traversable
 * - `pending`: Valid direction but no exit yet; generation may be triggered
 * - `forbidden`: Direction is permanently blocked; never generate
 */
export type ExitAvailability = 'hard' | 'pending' | 'forbidden'

/**
 * Exit information including availability state and optional metadata.
 */
export interface ExitInfo {
    /** Canonical direction. */
    direction: Direction
    /** Current availability state. */
    availability: ExitAvailability
    /** Optional destination location ID (only for 'hard' exits). */
    toLocationId?: string
    /** Optional short reason/description for UI display. */
    reason?: string
    /** Optional flavor text when using this exit (only for 'hard' exits). */
    description?: string
}

/**
 * Exit availability metadata for a location.
 * Maps directions to their availability state and optional reason.
 */
export interface ExitAvailabilityMetadata {
    /** Directions that are pending generation. */
    pending?: Partial<Record<Direction, string>>
    /** Directions that are permanently forbidden. */
    forbidden?: Partial<Record<Direction, string>>
}

/**
 * Type guard for ExitAvailability.
 */
export function isExitAvailability(value: string): value is ExitAvailability {
    return value === 'hard' || value === 'pending' || value === 'forbidden'
}

/**
 * Determine exit availability for a direction at a location.
 *
 * Rules:
 * 1. If exit edge exists → 'hard'
 * 2. If direction is in forbidden set → 'forbidden'
 * 3. If direction is in pending set → 'pending'
 * 4. Otherwise → undefined (unknown/not configured)
 *
 * Edge case: If a direction has both an exit edge AND is marked forbidden,
 * the hard exit takes precedence (data integrity issue - should emit warning).
 */
export function determineExitAvailability(
    direction: Direction,
    exits: Partial<Record<Direction, string>> | undefined,
    metadata: ExitAvailabilityMetadata | undefined
): ExitAvailability | undefined {
    // Rule 1: Hard exit takes precedence
    if (exits && exits[direction]) {
        return 'hard'
    }

    // Rule 2: Check forbidden
    if (metadata?.forbidden && metadata.forbidden[direction]) {
        return 'forbidden'
    }

    // Rule 3: Check pending
    if (metadata?.pending && metadata.pending[direction]) {
        return 'pending'
    }

    // Unknown/not configured
    return undefined
}

/**
 * Build ExitInfo array for a location including availability states.
 *
 * @param exits - Sparse mapping from direction to destination location ID
 * @param metadata - Exit availability metadata (pending, forbidden)
 * @returns Array of ExitInfo with availability states
 */
export function buildExitInfoArray(
    exits: Partial<Record<Direction, string>> | undefined,
    metadata: ExitAvailabilityMetadata | undefined
): ExitInfo[] {
    const result: ExitInfo[] = []
    const processedDirections = new Set<Direction>()

    // Add hard exits
    if (exits) {
        for (const [dir, toId] of Object.entries(exits)) {
            const direction = dir as Direction
            processedDirections.add(direction)
            result.push({
                direction,
                availability: 'hard',
                toLocationId: toId
            })
        }
    }

    // Add forbidden (takes precedence over pending)
    if (metadata?.forbidden) {
        for (const [dir, reason] of Object.entries(metadata.forbidden)) {
            const direction = dir as Direction
            if (!processedDirections.has(direction)) {
                processedDirections.add(direction)
                result.push({
                    direction,
                    availability: 'forbidden',
                    reason
                })
            }
        }
    }

    // Add pending
    if (metadata?.pending) {
        for (const [dir, reason] of Object.entries(metadata.pending)) {
            const direction = dir as Direction
            if (!processedDirections.has(direction)) {
                processedDirections.add(direction)
                result.push({
                    direction,
                    availability: 'pending',
                    reason
                })
            }
        }
    }

    return result
}
