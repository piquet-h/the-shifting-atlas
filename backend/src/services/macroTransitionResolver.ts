import type { Direction } from '@piquet-h/shared'

import type { AreaReadinessState } from './macroGenerationContext.js'
import { resolveAreaTransitionEdge } from './macroGenerationContext.js'

/**
 * Three-way outcome of a macro-area transition check.
 *
 * - `stay`:       No authored transition edge in the attempted direction, or no
 *                 `macro:area:` tag on the source.  Generation remains in the
 *                 current area's continuation mode.
 * - `transition`: Destination area is authored and ready for handoff.  Carries
 *                 route-handoff metadata when the atlas edge requires it so
 *                 downstream generation can preserve route continuity.
 * - `blocked`:    Transition edge exists but the destination readiness state
 *                 (`partial`, `blocked`, or `deferred`) prevents the handoff.
 *                 Surfaced as a first-class outcome so callers can communicate
 *                 an explicit boundary rather than silently falling back.
 */
export type TransitionResolution =
    | { outcome: 'stay' }
    | {
          outcome: 'transition'
          /** Semantic atlas ID of the destination area — never a runtime GUID. */
          destinationAreaRef: string
          /** Human-readable crossing condition from the atlas edge. */
          threshold: string
          /** Recommended entry segment inside the destination area, if authored. */
          entrySegmentRef?: string
          /** Whether a route handoff must be evaluated at this transition point. */
          requiresRouteHandoff: boolean
          /** Atlas route reference for the continuation route in the destination, when applicable. */
          handoffRouteRef?: string
      }
    | {
          outcome: 'blocked'
          /** Semantic atlas ID of the destination area — never a runtime GUID. */
          destinationAreaRef: string
          /** Readiness state that caused the block (`partial`, `blocked`, or `deferred`). */
          reason: Exclude<AreaReadinessState, 'ready'>
          /** Traversal classification of the blocking edge, if present. */
          traversal?: string
          /** Barrier node references on the blocking edge, if any. */
          barrierRefs?: string[]
      }

const MACRO_AREA_PREFIX = 'macro:area:'

/**
 * Resolves the three-way transition outcome for a given set of source location
 * tags and an attempted expansion direction.
 *
 * Logic:
 * 1. Extract the first `macro:area:<ref>` tag from `sourceTags`.  If absent,
 *    return `stay` — no atlas context to resolve against.
 * 2. Look up an authored `macro-transition` edge for `(areaRef, direction)`.
 *    If none exists, return `stay` — current-area continuation mode.
 * 3. If the edge's `destinationReadiness` is `ready`, return `transition` with
 *    the full handoff metadata from the atlas edge.
 * 4. Otherwise (`partial` | `blocked` | `deferred`), return `blocked` with the
 *    reason and any barrier context so callers can surface an explicit boundary.
 *
 * This function is pure: it reads only from in-process atlas data and performs
 * no I/O, no GUID generation, and no tag computation.
 *
 * @param sourceTags - Tags on the source location (may be `undefined`).
 * @param direction  - The expansion direction being attempted.
 */
export function resolveTransitionOutcome(sourceTags: string[] | undefined, direction: Direction): TransitionResolution {
    const areaTag = (sourceTags ?? []).find((tag) => tag.startsWith(MACRO_AREA_PREFIX))
    if (!areaTag) {
        return { outcome: 'stay' }
    }

    const areaRef = areaTag.slice(MACRO_AREA_PREFIX.length)
    const edge = resolveAreaTransitionEdge(areaRef, direction)
    if (!edge) {
        return { outcome: 'stay' }
    }

    const { transition, traversal, barrierRefs } = edge
    const { destinationReadiness, destinationAreaRef, threshold, entrySegmentRef, requiresRouteHandoff, handoffRouteRef } = transition

    if (destinationReadiness === 'ready') {
        return {
            outcome: 'transition',
            destinationAreaRef,
            threshold,
            entrySegmentRef,
            requiresRouteHandoff: requiresRouteHandoff ?? false,
            handoffRouteRef
        }
    }

    return {
        outcome: 'blocked',
        destinationAreaRef,
        reason: destinationReadiness,
        traversal,
        barrierRefs
    }
}
