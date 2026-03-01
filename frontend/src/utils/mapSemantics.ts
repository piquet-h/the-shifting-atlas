export type EdgeKind = 'surface' | 'interior' | 'vertical'

export interface EdgeLike {
    fromId: string
    toId: string
    direction: string
}

/**
 * Returns true when a location's tags indicate it is inside a named structure
 * (i.e. carries a `structure:<slug>` tag and is NOT the outside threshold node).
 *
 * This is the preferred mechanism for map filtering over the edge-kind heuristic.
 * See docs/architecture/interior-structure-conventions.md § 4 for details.
 */
export function isInteriorNode(tags: string[] | undefined): boolean {
    if (!tags) return false
    const hasStructureTag = tags.some((t) => /^structure:[a-z0-9]+(-[a-z0-9]+)*$/.test(t))
    const hasOutsideArea = tags.some((t) => t === 'structureArea:outside')
    return hasStructureTag && !hasOutsideArea
}

export function getEdgeKind(direction: string): EdgeKind {
    switch (direction) {
        case 'in':
        case 'out':
            return 'interior'
        case 'up':
        case 'down':
            return 'vertical'
        default:
            return 'surface'
    }
}

export function getEdgeClassName(direction: string): string {
    const kind = getEdgeKind(direction)
    // Cytoscape element classes: space-separated tokens.
    return `edge--${kind}`
}

/**
 * Compute the set of node IDs that represent "inside" locations.
 *
 * Convention:
 * - An exterior location has an `in` exit to an interior location.
 * - An interior location has an `out` exit back to an exterior location.
 *
 * Therefore:
 * - The target of an `in` edge is inside.
 * - The source of an `out` edge is inside.
 */
export function computeInsideNodeIds<E extends EdgeLike>(edges: E[]): Set<string> {
    const inside = new Set<string>()
    for (const e of edges) {
        if (e.direction === 'in') inside.add(e.toId)
        else if (e.direction === 'out') inside.add(e.fromId)
    }
    return inside
}
