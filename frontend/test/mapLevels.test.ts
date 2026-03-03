import { describe, expect, it } from 'vitest'
import { computeRelativeLevelsFromFocus } from '../src/utils/mapLevels'

describe('mapLevels', () => {
    it('assigns levels relative to focus using up/down deltas', () => {
        const nodes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }]
        const edges = [
            { fromId: 'A', toId: 'B', direction: 'up' },
            { fromId: 'B', toId: 'C', direction: 'north' }
        ]

        const levels = computeRelativeLevelsFromFocus(nodes, edges, 'A')
        expect(levels.get('A')).toBe(0)
        expect(levels.get('B')).toBe(1)
        expect(levels.get('C')).toBe(1)
    })

    it('treats vertical edges as undirected but preserves sign when traversing backwards', () => {
        const nodes = [{ id: 'A' }, { id: 'B' }]
        const edges = [{ fromId: 'B', toId: 'A', direction: 'up' }]

        const levels = computeRelativeLevelsFromFocus(nodes, edges, 'A')
        // If moving B -> A is up (+1), then A -> B is down (-1).
        expect(levels.get('A')).toBe(0)
        expect(levels.get('B')).toBe(-1)
    })
})
