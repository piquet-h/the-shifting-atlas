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

export interface ComputePositionsOptions {
    /** Multiplier applied to all edge-derived pixel distances. Default: 1. */
    distanceScale?: number
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

function hashStringToUnit(value: string): number {
    // Simple deterministic hash → [0, 1)
    let h = 2166136261
    for (let i = 0; i < value.length; i++) {
        h ^= value.charCodeAt(i)
        h = Math.imul(h, 16777619)
    }
    // >>> 0 ensures unsigned
    return ((h >>> 0) % 10_000) / 10_000
}

function getUnknownDirectionVector(seed: string): [number, number] {
    // Pick an angle on the unit circle so unknown directions still spread out.
    const t = hashStringToUnit(seed)
    const angle = t * Math.PI * 2
    const dx = Math.cos(angle)
    const dy = Math.sin(angle)

    // Avoid near-zero magnitude (extremely unlikely, but keep it robust).
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return [1, 0]
    return [dx, dy]
}

function keyForPosition(x: number, y: number): string {
    // Positions are computed from integer-ish scales, but float vectors exist.
    // Normalize to a stable grid so tiny float deltas don't defeat collision detection.
    const qx = Math.round(x * 10) / 10
    const qy = Math.round(y * 10) / 10
    return `${qx},${qy}`
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
    rootId: string,
    options?: ComputePositionsOptions
): Map<string, { x: number; y: number }> {
    const positions = new Map<string, { x: number; y: number }>()
    const visited = new Set<string>()
    const occupied = new Map<string, number>()

    const distanceScale = Math.max(0.1, options?.distanceScale ?? 1)
    const baseDistancePx = BASE_DISTANCE_PX * distanceScale

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
    occupied.set(keyForPosition(0, 0), 1)

    while (queue.length > 0) {
        const current = queue.shift()!
        const outEdges = adj.get(current.id) ?? []

        for (const edge of outEdges) {
            if (visited.has(edge.toId)) continue
            const vec = DIRECTION_VECTORS[edge.direction] ?? getUnknownDirectionVector(`${edge.direction}:${edge.toId}`)
            const scale = ((edge.travelDurationMs ?? URBAN_MS) / URBAN_MS) * baseDistancePx
            let nx = current.x + vec[0] * scale
            let ny = current.y + vec[1] * scale

            // Collision avoidance: if another node already occupies this slot, offset deterministically
            // on a small spiral. This keeps the map readable and prevents exact-overlap stacks.
            let k = keyForPosition(nx, ny)
            let collisionIndex = occupied.get(k) ?? 0
            if (collisionIndex > 0) {
                // Spiral: radius grows with collision count, angle based on node id for stability.
                const base = 24 * distanceScale
                const radius = base * collisionIndex
                const angle = hashStringToUnit(edge.toId) * Math.PI * 2
                nx += Math.cos(angle) * radius
                ny += Math.sin(angle) * radius
                k = keyForPosition(nx, ny)
                collisionIndex = occupied.get(k) ?? collisionIndex
            }
            occupied.set(k, (occupied.get(k) ?? 0) + 1)

            positions.set(edge.toId, { x: nx, y: ny })
            visited.add(edge.toId)
            queue.push({ id: edge.toId, x: nx, y: ny })
        }
    }

    // ---------------------------------------------------------------------
    // Constraint relaxation
    // ---------------------------------------------------------------------
    // The BFS pass above chooses a spanning-tree embedding. Cross-links and
    // multi-path cycles can then appear "geometrically wrong" in the UI because
    // the chosen first-parent path wins and all other edges are just drawn
    // between fixed coordinates.
    //
    // To reduce misleading geometry, perform a small, deterministic relaxation
    // pass that nudges already-positioned nodes to better satisfy ALL directed
    // edge constraints simultaneously (while keeping the root pinned).
    //
    // This is not a physics engine; it is a lightweight least-squares-ish
    // compromise suitable for small graphs.
    const RELAX_ITERATIONS = 80
    const RELAX_ALPHA = 0.35

    // Build incoming edges for each node (toId → edges), used for per-node averaging.
    const incoming = new Map<string, E[]>()
    for (const e of edges) {
        const list = incoming.get(e.toId) ?? []
        list.push(e)
        incoming.set(e.toId, list)
    }

    for (let iter = 0; iter < RELAX_ITERATIONS; iter++) {
        const next = new Map(positions)

        for (const n of nodes) {
            if (n.id === root.id) continue // root pinned
            const cur = positions.get(n.id)
            if (!cur) continue

            const inc = incoming.get(n.id) ?? []
            if (inc.length === 0) continue

            let sumX = 0
            let sumY = 0
            let count = 0

            for (const e of inc) {
                const from = positions.get(e.fromId)
                if (!from) continue
                const vec = DIRECTION_VECTORS[e.direction] ?? getUnknownDirectionVector(`${e.direction}:${e.toId}`)
                const scale = ((e.travelDurationMs ?? URBAN_MS) / URBAN_MS) * baseDistancePx
                sumX += from.x + vec[0] * scale
                sumY += from.y + vec[1] * scale
                count++
            }

            if (count === 0) continue
            const avgX = sumX / count
            const avgY = sumY / count

            next.set(n.id, {
                x: cur.x + (avgX - cur.x) * RELAX_ALPHA,
                y: cur.y + (avgY - cur.y) * RELAX_ALPHA
            })
        }

        // Commit simultaneously to avoid order-dependence.
        for (const [id, pos] of next) {
            positions.set(id, pos)
        }
    }

    // Place disconnected nodes in a row below the main graph
    let orphanX = 0
    for (const n of nodes) {
        if (!visited.has(n.id)) {
            const y = 600
            let x = orphanX

            // Avoid accidental overlap with already-placed nodes at the orphan baseline.
            let k = keyForPosition(x, y)
            let collisionIndex = occupied.get(k) ?? 0
            if (collisionIndex > 0) {
                x += baseDistancePx * collisionIndex
                k = keyForPosition(x, y)
            }
            occupied.set(k, (occupied.get(k) ?? 0) + 1)

            positions.set(n.id, { x, y })
            orphanX += baseDistancePx
        }
    }

    return positions
}
