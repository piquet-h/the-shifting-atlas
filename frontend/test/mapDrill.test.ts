import { describe, expect, it } from 'vitest'
import { computeVisibleNodeIds } from '../src/utils/mapDrill'

const A = 'A'
const B = 'B'
const C = 'C'
const D = 'D'

describe('mapDrill', () => {
    it('in all-mode, returns all nodes regardless of focus', () => {
        const nodes = [{ id: A }, { id: B }, { id: C }]
        const edges = [{ fromId: A, toId: B, direction: 'north' }]

        const visible = computeVisibleNodeIds(nodes, edges, {
            mode: 'all',
            focusId: A,
            allowedKinds: new Set(['surface'])
        })

        expect(Array.from(visible).sort()).toEqual([A, B, C])
    })

    it('in focus-mode depth=0, returns only the focus node', () => {
        const nodes = [{ id: A }, { id: B }]
        const edges = [{ fromId: A, toId: B, direction: 'north' }]

        const visible = computeVisibleNodeIds(nodes, edges, {
            mode: 'focus',
            focusId: A,
            maxDepth: 0,
            allowedKinds: new Set(['surface'])
        })

        expect(Array.from(visible).sort()).toEqual([A])
    })

    it('in focus-mode, respects allowed edge kinds (interior vs vertical vs surface)', () => {
        const nodes = [{ id: A }, { id: B }, { id: C }, { id: D }]
        const edges = [
            { fromId: A, toId: B, direction: 'north' }, // surface
            { fromId: A, toId: C, direction: 'in' }, // interior
            { fromId: A, toId: D, direction: 'up' } // vertical
        ]

        const visibleSurfaceOnly = computeVisibleNodeIds(nodes, edges, {
            mode: 'focus',
            focusId: A,
            maxDepth: 1,
            allowedKinds: new Set(['surface'])
        })
        expect(Array.from(visibleSurfaceOnly).sort()).toEqual([A, B])

        const visibleInteriorOnly = computeVisibleNodeIds(nodes, edges, {
            mode: 'focus',
            focusId: A,
            maxDepth: 1,
            allowedKinds: new Set(['interior'])
        })
        expect(Array.from(visibleInteriorOnly).sort()).toEqual([A, C])

        const visibleVerticalOnly = computeVisibleNodeIds(nodes, edges, {
            mode: 'focus',
            focusId: A,
            maxDepth: 1,
            allowedKinds: new Set(['vertical'])
        })
        expect(Array.from(visibleVerticalOnly).sort()).toEqual([A, D])
    })

    it('treats edges as undirected for visibility expansion (so drill-in works even if only one direction exists)', () => {
        const nodes = [{ id: A }, { id: B }]
        const edges = [{ fromId: B, toId: A, direction: 'out' }]

        const visible = computeVisibleNodeIds(nodes, edges, {
            mode: 'focus',
            focusId: A,
            maxDepth: 1,
            allowedKinds: new Set(['interior'])
        })

        expect(Array.from(visible).sort()).toEqual([A, B])
    })
})
