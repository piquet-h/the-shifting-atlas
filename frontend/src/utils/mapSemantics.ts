export type EdgeKind = 'surface' | 'interior' | 'vertical'

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
