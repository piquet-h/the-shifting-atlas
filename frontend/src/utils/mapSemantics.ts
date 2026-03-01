export type EdgeKind = 'surface' | 'interior' | 'vertical'

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
