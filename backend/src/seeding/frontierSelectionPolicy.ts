/**
 * Frontier Selection Policy
 *
 * Determines which pending exit directions to expand when a player arrives at a frontier location.
 * Implements a deterministic, atlas-aware selection that:
 *   - Respects forbidden exit constraints (forbidden always wins)
 *   - Prioritises atlas-significant directions (route-continuity, terrain trends) when a cap applies
 *   - Falls back to declaration order when no atlas tags are present
 *
 * Related: docs/design-modules/world-spatial-generation.md
 * Issue: piquet-h/the-shifting-atlas#812
 */

import type { Direction } from '@piquet-h/shared'
import type { Location } from '@piquet-h/shared'
import { resolveMacroGenerationContext, scoreExpansionDirection } from '../services/macroGenerationContext.js'

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
    /**
     * Atlas-derived direction priority scores, keyed by eligible direction.
     * Present only when the location carries atlas tags (`macro:area:`, `macro:route:`,
     * or `macro:water:`). Absent when no atlas information is available, in which case
     * declaration order governs selection.
     *
     * Use for telemetry and debug inspection to understand why a given direction
     * was selected or ranked over another.
     */
    atlasScores?: Partial<Record<Direction, number>>
}

/**
 * Returns true when the location carries at least one macro atlas tag that enables
 * direction scoring. Locations without these tags fall back to declaration-order selection.
 */
function hasAtlasTags(tags: string[] | undefined): boolean {
    if (!tags || tags.length === 0) return false
    return tags.some((t) => t.startsWith('macro:area:') || t.startsWith('macro:route:') || t.startsWith('macro:water:'))
}

/**
 * Select pending exit directions eligible for on-demand generation.
 *
 * Policy rules (applied in order):
 * 1. **Forbidden wins**: if a direction appears in both `pending` and `forbidden`,
 *    it is excluded and a diagnostic warning is recorded.
 * 2. **Atlas-aware scoring**: when the location carries atlas tags, eligible directions
 *    are ranked by their atlas significance score (route-continuity trend, terrain trend,
 *    barrier context) so the most coherent exits are selected first when a cap applies.
 *    Directions with equal scores preserve declaration order as a stable tiebreaker.
 * 3. **Cap**: at most `cap` directions are returned.
 * 4. **Frontier tag**: the `isFrontierTagged` field on the result signals whether
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

    // Atlas-aware scoring: when the location carries macro tags, rank directions by atlas
    // significance so route-continuity and terrain-trend directions are preferred when a cap
    // applies. Directions with equal scores preserve declaration order (stable tiebreaker).
    const tags = location.tags
    if (hasAtlasTags(tags)) {
        const scored = eligible.map((direction, index) => ({
            direction,
            index,
            score: scoreExpansionDirection(resolveMacroGenerationContext(tags, direction))
        }))
        scored.sort((a, b) => (a.score !== b.score ? b.score - a.score : a.index - b.index))

        const atlasScores: Partial<Record<Direction, number>> = {}
        for (const { direction, score } of scored) {
            atlasScores[direction] = score
        }

        const directions = scored.slice(0, cap).map((e) => e.direction)
        return { directions, warnings, isFrontierTagged, atlasScores }
    }

    return {
        directions: eligible.slice(0, cap),
        warnings,
        isFrontierTagged
    }
}
