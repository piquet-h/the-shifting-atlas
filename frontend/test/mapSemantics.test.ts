import { describe, expect, it } from 'vitest'
import { getEdgeClassName, getEdgeKind } from '../src/utils/mapSemantics'

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
})
