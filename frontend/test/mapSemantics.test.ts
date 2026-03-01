import { describe, expect, it } from 'vitest'
import { computeInsideNodeIds, getEdgeClassName, getEdgeKind } from '../src/utils/mapSemantics'

describe('mapSemantics', () => {
    describe('getEdgeKind', () => {
        it('classifies in/out as interior', () => {
            expect(getEdgeKind('in')).toBe('interior')
            expect(getEdgeKind('out')).toBe('interior')
        })

        it('classifies up/down as vertical', () => {
            expect(getEdgeKind('up')).toBe('vertical')
            expect(getEdgeKind('down')).toBe('vertical')
        })

        it('defaults to surface for other directions', () => {
            expect(getEdgeKind('north')).toBe('surface')
            expect(getEdgeKind('southeast')).toBe('surface')
            expect(getEdgeKind('')).toBe('surface')
        })
    })

    describe('getEdgeClassName', () => {
        it('returns Cytoscape class token', () => {
            expect(getEdgeClassName('in')).toBe('edge--interior')
            expect(getEdgeClassName('up')).toBe('edge--vertical')
            expect(getEdgeClassName('north')).toBe('edge--surface')
        })
    })

    describe('computeInsideNodeIds', () => {
        it('treats the target of an "in" edge as inside', () => {
            const edges = [{ fromId: 'outside', toId: 'inside', direction: 'in' }]
            expect(Array.from(computeInsideNodeIds(edges)).sort()).toEqual(['inside'])
        })

        it('treats the source of an "out" edge as inside', () => {
            const edges = [{ fromId: 'inside', toId: 'outside', direction: 'out' }]
            expect(Array.from(computeInsideNodeIds(edges)).sort()).toEqual(['inside'])
        })

        it('ignores non interior directions', () => {
            const edges = [
                { fromId: 'A', toId: 'B', direction: 'north' },
                { fromId: 'B', toId: 'C', direction: 'up' }
            ]
            expect(Array.from(computeInsideNodeIds(edges))).toEqual([])
        })

        it('deduplicates nodes across multiple edges', () => {
            const edges = [
                { fromId: 'inside', toId: 'outside', direction: 'out' },
                { fromId: 'outside', toId: 'inside', direction: 'in' }
            ]
            expect(Array.from(computeInsideNodeIds(edges)).sort()).toEqual(['inside'])
        })
    })
})
