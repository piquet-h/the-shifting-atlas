/**
 * Frontier Selection Policy
 *
 * Determines which pending exit directions to expand when a player arrives at a frontier location.
 * Implements a deterministic cap-based selection that respects forbidden exit constraints and
 * prioritises locations explicitly marked as frontier boundaries.
 *
 * Related: docs/design-modules/world-spatial-generation.md
 * Issue: piquet-h/the-shifting-atlas#812
 */

import type { Direction } from '@piquet-h/shared'
import type { Location } from '@piquet-h/shared'

/**
 * Tag applied to locations that are explicit frontier expansion boundaries.
 * Locations with this tag have their pending exits treated as high-priority
 * candidates for demand-driven generation.
 */
export const FRONTIER_BOUNDARY_TAG = 'frontier:boundary'

/**
 * Default maximum number of pending exits to select in one expansion batch.
 * Prevents runaway generation cost at locations with many pending directions.
 */
export const DEFAULT_FRONTIER_CAP = 3

/**
 * Result of the frontier exit selection policy.
 */
export interface FrontierSelectionResult {
    /** Ordered list of pending exit directions selected for generation (length ≤ cap). */
    directions: Direction[]
    /**
     * Diagnostic warnings produced during selection (non-fatal).
     * Currently emitted when a direction is listed as both pending and forbidden.
     */
    warnings: string[]
    /** True when the location carries the `frontier:boundary` tag. */
    isFrontierTagged: boolean
}

/**
 * Select pending exit directions eligible for on-demand generation.
 *
 * Policy rules (applied in order):
 * 1. **Forbidden wins**: if a direction appears in both `pending` and `forbidden`,
 *    it is excluded and a diagnostic warning is recorded.
 * 2. **Cap**: at most `cap` directions are returned (declaration order is preserved
 *    for stable, reproducible behaviour).
 * 3. **Frontier tag**: the `isFrontierTagged` field on the result signals whether
 *    the location is an explicit frontier boundary; callers that process multiple
 *    locations should expand frontier-tagged locations before unmarked ones.
 *
 * Safe with missing or partial metadata: returns an empty result rather than throwing.
 *
 * @param location - Location to evaluate
 * @param cap      - Maximum exits to return (defaults to DEFAULT_FRONTIER_CAP)
 */
export function selectFrontierExits(location: Location, cap: number = DEFAULT_FRONTIER_CAP): FrontierSelectionResult {
    const warnings: string[] = []
    const isFrontierTagged = location.tags?.includes(FRONTIER_BOUNDARY_TAG) ?? false
    const metadata = location.exitAvailability

    if (!metadata?.pending) {
        return { directions: [], warnings, isFrontierTagged }
    }

    const pendingDirs = Object.keys(metadata.pending) as Direction[]
    const forbiddenSet = new Set<string>(metadata.forbidden ? Object.keys(metadata.forbidden) : [])

    const eligible: Direction[] = []

    for (const dir of pendingDirs) {
        if (forbiddenSet.has(dir)) {
            warnings.push(`[frontierPolicy] direction "${dir}" on location "${location.id}" is both pending and forbidden; forbidden wins`)
            continue
        }
        eligible.push(dir)
    }

    return {
        directions: eligible.slice(0, cap),
        warnings,
        isFrontierTagged
    }
}
