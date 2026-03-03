export interface LevelGraphNodeLike {
    id: string
}

export interface LevelGraphEdgeLike {
    fromId: string
    toId: string
    direction: string
}

function getVerticalDelta(direction: string): number {
    if (direction === 'up') return 1
    if (direction === 'down') return -1
    return 0
}

/**
 * Computes relative “level” (an integer offset) for nodes reachable from focus.
 *
 * Semantics:
 * - `up` increases level by +1
 * - `down` decreases level by -1
 * - all other edge directions preserve level (delta 0)
 *
 * Edges are treated as undirected for reachability. When traversing an edge
 * backwards, the vertical delta is negated (so `up` becomes -1 when moving
 * opposite to its declared direction).
 */
export function computeRelativeLevelsFromFocus<N extends LevelGraphNodeLike, E extends LevelGraphEdgeLike>(
    nodes: N[],
    edges: E[],
    focusId: string
): Map<string, number> {
    const allIds = new Set(nodes.map((n) => n.id))
    if (!allIds.has(focusId)) return new Map()

    const adj = new Map<string, Array<{ id: string; delta: number }>>()
    for (const e of edges) {
        if (!allIds.has(e.fromId) || !allIds.has(e.toId)) continue

        const delta = getVerticalDelta(e.direction)

        const a = adj.get(e.fromId) ?? []
        a.push({ id: e.toId, delta })
        adj.set(e.fromId, a)

        const b = adj.get(e.toId) ?? []
        b.push({ id: e.fromId, delta: -delta })
        adj.set(e.toId, b)
    }

    const levels = new Map<string, number>()
    levels.set(focusId, 0)

    const queue: string[] = [focusId]
    while (queue.length > 0) {
        const cur = queue.shift()!
        const curLevel = levels.get(cur) ?? 0
        const neighbors = adj.get(cur) ?? []

        for (const next of neighbors) {
            if (levels.has(next.id)) continue
            levels.set(next.id, curLevel + next.delta)
            queue.push(next.id)
        }
    }

    return levels
}
