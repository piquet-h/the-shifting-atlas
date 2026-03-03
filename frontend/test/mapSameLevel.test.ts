import { describe, expect, it } from 'vitest'
import { applySameLevelSlice } from '../src/utils/mapSameLevel'

describe('mapSameLevel', () => {
    it('when enabled but no focusId is set, does not filter nodes and does not hide vertical edges', () => {
        const nodes = [{ id: 'A' }, { id: 'B' }]
        const edges = [{ fromId: 'A', toId: 'B', direction: 'down' }]
        const visible = new Set(['A', 'B'])

        const result = applySameLevelSlice({ nodes, edges, visibleNodeIds: visible, focusId: null, sameLevelOnly: true })

        expect(result.hideVerticalEdges).toBe(false)
        expect(Array.from(result.visibleNodeIds).sort()).toEqual(['A', 'B'])
    })

    it('when enabled with focusId, filters to level=0 nodes and hides vertical edges', () => {
        const nodes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }]
        const edges = [
            { fromId: 'A', toId: 'B', direction: 'up' },
            { fromId: 'A', toId: 'C', direction: 'north' }
        ]
        const visible = new Set(['A', 'B', 'C'])

        const result = applySameLevelSlice({ nodes, edges, visibleNodeIds: visible, focusId: 'A', sameLevelOnly: true })

        expect(result.hideVerticalEdges).toBe(true)
        expect(Array.from(result.visibleNodeIds).sort()).toEqual(['A', 'C'])
    })
})
