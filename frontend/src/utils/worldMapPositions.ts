/**
 * worldMapPositions – position calculator for the WorldMap Cytoscape graph.
 *
 * Uses BFS starting from the known starter location, assigning each node a
 * pixel coordinate derived from its connecting exit direction and travelDurationMs.
 */

/** Minimal graph node shape required for position calculation. */
export interface GraphNodeLike {
    id: string
}

/** Minimal graph edge shape required for position calculation. */
export interface GraphEdgeLike {
    fromId: string
    toId: string
    direction: string
    travelDurationMs?: number
}

/** Base pixel distance for the urban travel duration (300 000 ms). */
export const BASE_DISTANCE_PX = 200

/** Default travel duration (urban, 5 min) when edge has no explicit value. */
export const URBAN_MS = 300_000

/** Cardinal + radial direction → unit vector [dx, dy] where north is (0, –1). */
export const DIRECTION_VECTORS: Readonly<Record<string, [number, number]>> = {
    north: [0, -1],
    south: [0, 1],
    east: [1, 0],
    west: [-1, 0],
    northeast: [1, -1],
    northwest: [-1, -1],
    southeast: [1, 1],
    southwest: [-1, 1],
    up: [0.4, -1],
    down: [-0.4, 1],
    in: [0.6, 0],
    out: [-0.6, 0]
}

/**
 * Compute a `{x, y}` position for every node in the graph.
 *
 * @param nodes    - Array of graph nodes (only `id` is used here)
 * @param edges    - Array of directed exit edges
 * @param rootId   - ID of the node to place at the origin (0, 0)
 * @returns Map from node ID → pixel coordinates
 */
export function computePositions<N extends GraphNodeLike, E extends GraphEdgeLike>(
    nodes: N[],
    edges: E[],
    rootId: string
): Map<string, { x: number; y: number }> {
    const positions = new Map<string, { x: number; y: number }>()
    const visited = new Set<string>()

    // Prefer provided rootId; fall back to first node
    const root = nodes.find((n) => n.id === rootId) ?? nodes[0]
    if (!root) return positions

    // Build adjacency list (fromId → edges)
    const adj = new Map<string, E[]>()
    for (const e of edges) {
        const list = adj.get(e.fromId) ?? []
        list.push(e)
        adj.set(e.fromId, list)
    }

    // BFS
    const queue: Array<{ id: string; x: number; y: number }> = [{ id: root.id, x: 0, y: 0 }]
    positions.set(root.id, { x: 0, y: 0 })
    visited.add(root.id)

    while (queue.length > 0) {
        const current = queue.shift()!
        const outEdges = adj.get(current.id) ?? []

        for (const edge of outEdges) {
            if (visited.has(edge.toId)) continue
            const vec = DIRECTION_VECTORS[edge.direction] ?? [0, 0]
            const scale = ((edge.travelDurationMs ?? URBAN_MS) / URBAN_MS) * BASE_DISTANCE_PX
            const nx = current.x + vec[0] * scale
            const ny = current.y + vec[1] * scale
            positions.set(edge.toId, { x: nx, y: ny })
            visited.add(edge.toId)
            queue.push({ id: edge.toId, x: nx, y: ny })
        }
    }

    // Place disconnected nodes in a row below the main graph
    let orphanX = 0
    for (const n of nodes) {
        if (!visited.has(n.id)) {
            positions.set(n.id, { x: orphanX, y: 600 })
            orphanX += BASE_DISTANCE_PX
        }
    }

    return positions
}
