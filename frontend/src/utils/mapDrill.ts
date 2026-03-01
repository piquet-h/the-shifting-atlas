import { getEdgeKind, type EdgeKind } from './mapSemantics'

export interface DrillGraphNodeLike {
    id: string
}

export interface DrillGraphEdgeLike {
    fromId: string
    toId: string
    direction: string
}

export interface ComputeVisibleNodeIdsOptions {
    /**
     * all: show whole atlas
     * focus: show only focus neighborhood
     */
    mode: 'all' | 'focus'

    /** Focus node id (required for focus mode). */
    focusId?: string

    /** Maximum hop distance from focus (0 => focus only). Defaults to 1 for focus mode. */
    maxDepth?: number

    /** Which semantic edge kinds are considered traversable for visibility. */
    allowedKinds: ReadonlySet<EdgeKind>
}

/**
 * Compute which node IDs should be visible given a drill/focus mode.
 *
 * Important: this treats edges as *undirected* for visibility.
 * Rationale: narrative navigation often has reciprocal exits, but we don't want
 * the map drill-in UX to fail just because one direction is missing.
 */
export function computeVisibleNodeIds<N extends DrillGraphNodeLike, E extends DrillGraphEdgeLike>(
    nodes: N[],
    edges: E[],
    options: ComputeVisibleNodeIdsOptions
): Set<string> {
    const allIds = new Set(nodes.map((n) => n.id))

    if (options.mode === 'all') {
        return allIds
    }

    const focusId = options.focusId
    if (!focusId || !allIds.has(focusId)) {
        // No valid focus ⇒ show everything (fails open to avoid a blank map).
        return allIds
    }

    const maxDepth = options.maxDepth ?? 1
    if (maxDepth <= 0) {
        return new Set([focusId])
    }

    // Build undirected adjacency list using only allowed edge kinds.
    const adj = new Map<string, string[]>()
    for (const e of edges) {
        const kind = getEdgeKind(e.direction)
        if (!options.allowedKinds.has(kind)) continue

        if (allIds.has(e.fromId) && allIds.has(e.toId)) {
            const a = adj.get(e.fromId) ?? []
            a.push(e.toId)
            adj.set(e.fromId, a)

            const b = adj.get(e.toId) ?? []
            b.push(e.fromId)
            adj.set(e.toId, b)
        }
    }

    // BFS from focus up to maxDepth.
    const visible = new Set<string>([focusId])
    const queue: Array<{ id: string; depth: number }> = [{ id: focusId, depth: 0 }]

    while (queue.length > 0) {
        const cur = queue.shift()!
        if (cur.depth >= maxDepth) continue

        const neighbors = adj.get(cur.id) ?? []
        for (const next of neighbors) {
            if (visible.has(next)) continue
            visible.add(next)
            queue.push({ id: next, depth: cur.depth + 1 })
        }
    }

    return visible
}
