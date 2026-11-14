import type { Direction } from '@piquet-h/shared'

import type { AreaReadinessState } from './macroGenerationContext.js'
import { extractOrderedAreaRefs, resolveAreaTransitionEdgeForTags } from './macroGenerationContext.js'

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

export function resolveTransitionOutcome(sourceTags: string[] | undefined, direction: Direction): TransitionResolution {
    if (extractOrderedAreaRefs(sourceTags).length === 0) {
        return { outcome: 'stay' }
    }

    const edge = resolveAreaTransitionEdgeForTags(sourceTags, direction)
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
