import { computeRelativeLevelsFromFocus } from './mapLevels'

export interface SameLevelNodeLike {
    id: string
}

export interface SameLevelEdgeLike {
    fromId: string
    toId: string
    direction: string
}

export interface ApplySameLevelSliceOptions<N extends SameLevelNodeLike, E extends SameLevelEdgeLike> {
    nodes: N[]
    edges: E[]
    visibleNodeIds: Set<string>
    focusId: string | null
    sameLevelOnly: boolean
}

export interface ApplySameLevelSliceResult {
    visibleNodeIds: Set<string>
    hideVerticalEdges: boolean
}

/**
 * Applies the "Same level" slice behavior.
 *
 * Design intent:
 * - If there is no focus node, "Same level" should be a no-op (avoid surprising global changes).
 * - If focused, keep only nodes at the same relative level as focus (level 0), where `up`/`down`
 *   exits form signed integer offsets.
 */
export function applySameLevelSlice<N extends SameLevelNodeLike, E extends SameLevelEdgeLike>(
    options: ApplySameLevelSliceOptions<N, E>
): ApplySameLevelSliceResult {
    if (!options.sameLevelOnly || !options.focusId) {
        return { visibleNodeIds: options.visibleNodeIds, hideVerticalEdges: false }
    }

    const levels = computeRelativeLevelsFromFocus(options.nodes, options.edges, options.focusId)
    for (const id of Array.from(options.visibleNodeIds)) {
        if (levels.get(id) !== 0) {
            options.visibleNodeIds.delete(id)
        }
    }

    return { visibleNodeIds: options.visibleNodeIds, hideVerticalEdges: true }
}
