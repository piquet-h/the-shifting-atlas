export type EdgeKind = 'surface' | 'interior' | 'vertical'

export interface EdgeLike {
    fromId: string
    toId: string
    direction: string
}

export interface NodeLike {
    id: string
    tags?: string[]
}

/** Matches a `structure:<slug>` tag where slug is lowercase-alphanumeric with hyphens. */
const STRUCTURE_TAG_PATTERN = /^structure:[a-z0-9]+(-[a-z0-9]+)*$/

/**
 * Returns true when a location's tags indicate it is inside a named structure
 * (i.e. carries a `structure:<slug>` tag and is NOT the outside threshold node).
 *
 * This is the preferred mechanism for map filtering over the edge-kind heuristic.
 * See docs/architecture/interior-structure-conventions.md § 4 for details.
 */
export function isInteriorNode(tags: string[] | undefined): boolean {
    if (!tags) return false
    const hasStructureTag = tags.some((t) => STRUCTURE_TAG_PATTERN.test(t))
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

/**
 * Classify the set of node IDs that are "inside" a structure using a two-tier approach:
 *
 * 1. **Tag-based (primary)**: nodes that carry a `structure:<slug>` tag are classified
 *    using `isInteriorNode()` — inside when the tag is present and `structureArea:outside`
 *    is absent.  This catches interiors reached via `up/down` (e.g. guest rooms) where no
 *    `in/out` edge exists.
 * 2. **Edge-based fallback**: for nodes that have no `structure:*` tag at all, the
 *    legacy heuristic applies — targets of `in` edges and sources of `out` edges are inside.
 */
export function classifyInsideNodeIds<N extends NodeLike, E extends EdgeLike>(nodes: N[], edges: E[]): Set<string> {
    const inside = new Set<string>()

    // Tag-based pass: record which node IDs have been classified by tags so that
    // the edge fallback does not override them.
    const tagClassifiedIds = new Set<string>()
    for (const n of nodes) {
        if (n.tags?.some((t) => STRUCTURE_TAG_PATTERN.test(t))) {
            tagClassifiedIds.add(n.id)
            if (isInteriorNode(n.tags)) {
                inside.add(n.id)
            }
        }
    }

    // Edge-based fallback: only for nodes not already classified via tags.
    for (const e of edges) {
        if (e.direction === 'in' && !tagClassifiedIds.has(e.toId)) inside.add(e.toId)
        else if (e.direction === 'out' && !tagClassifiedIds.has(e.fromId)) inside.add(e.fromId)
    }

    return inside
}
