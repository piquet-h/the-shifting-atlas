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
 * Motif describing the type of barrier for a forbidden exit direction.
 * Used by narration consumers to select contextually appropriate copy.
 *
 * - `cliff`  — sheer drop or impassable rock face
 * - `ward`   — magical or arcane barrier
 * - `water`  — open water, river, or sea preventing foot passage
 * - `law`    — legal or civic restriction (locked gate, border)
 * - `ruin`   — collapsed structure blocking the way
 */
export type ForbiddenExitMotif = 'cliff' | 'ward' | 'water' | 'law' | 'ruin'

/**
 * When a forbidden exit should be narrated to the player.
 *
 * - `onTryMove` (default): only describe the barrier when the player attempts movement
 * - `onLook`: include barrier hint in the location description (obvious geographic feature)
 */
export type ForbiddenExitReveal = 'onLook' | 'onTryMove'

/**
 * Metadata for a single forbidden exit direction.
 *
 * Consumer rule: do not narrate a forbidden direction unless the location description
 * implies it, the player attempts movement, or `reveal === 'onLook'`.
 */
export interface ForbiddenExitEntry {
    /** Required: human-readable reason why this direction is blocked. */
    reason: string
    /**
     * Optional barrier type hint for narration consumers.
     * When omitted, consumers should use conservative / generic copy.
     */
    motif?: ForbiddenExitMotif
    /**
     * When to surface the barrier to the player.
     * Defaults to `'onTryMove'` when omitted.
     */
    reveal?: ForbiddenExitReveal
}

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
    /** Barrier motif for forbidden exits (narration hint). */
    motif?: ForbiddenExitMotif
    /** When to reveal the barrier in narration (defaults to 'onTryMove'). */
    reveal?: ForbiddenExitReveal
}

/**
 * Exit availability metadata for a location.
 * Maps directions to their availability state and optional reason.
 */
export interface ExitAvailabilityMetadata {
    /** Directions that are pending generation. */
    pending?: Partial<Record<Direction, string>>
    /** Directions that are permanently forbidden. */
    forbidden?: Partial<Record<Direction, ForbiddenExitEntry>>
}

/**
 * Type guard for ExitAvailability.
 */
export function isExitAvailability(value: string): value is ExitAvailability {
    return value === 'hard' || value === 'pending' || value === 'forbidden'
}

/**
 * Type guard for ForbiddenExitMotif.
 * Fails closed: unknown motif values are treated as invalid.
 */
export function isForbiddenExitMotif(value: unknown): value is ForbiddenExitMotif {
    return value === 'cliff' || value === 'ward' || value === 'water' || value === 'law' || value === 'ruin'
}

/**
 * Normalise a raw forbidden exit value from storage or JSON.
 *
 * Handles legacy format where the value was a plain string (reason only):
 *   `"Open sea bars passage"` → `{ reason: "Open sea bars passage", reveal: "onTryMove" }`
 *
 * New format (ForbiddenExitEntry) is returned as-is.
 */
export function normalizeForbiddenEntry(raw: ForbiddenExitEntry | string): ForbiddenExitEntry {
    if (typeof raw === 'string') {
        return { reason: raw, reveal: 'onTryMove' }
    }
    return raw
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

    // Rule 2: Check forbidden (key-in check: ForbiddenExitEntry is always truthy)
    if (metadata?.forbidden && direction in metadata.forbidden) {
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
        for (const [dir, rawEntry] of Object.entries(metadata.forbidden)) {
            const direction = dir as Direction
            if (!processedDirections.has(direction)) {
                processedDirections.add(direction)
                const entry = normalizeForbiddenEntry(rawEntry as ForbiddenExitEntry | string)
                result.push({
                    direction,
                    availability: 'forbidden',
                    reason: entry.reason,
                    motif: entry.motif,
                    reveal: entry.reveal ?? 'onTryMove'
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
