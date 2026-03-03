import { describe, expect, it } from 'vitest'
import { computeInsideNodeIds, computeInteriorNodeIds, getEdgeClassName, getEdgeKind, isInteriorNode } from '../src/utils/mapSemantics'

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

    describe('isInteriorNode', () => {
        it('returns false for undefined tags', () => {
            expect(isInteriorNode(undefined)).toBe(false)
        })

        it('returns false for empty tags', () => {
            expect(isInteriorNode([])).toBe(false)
        })

        it('returns false when no structure tag is present', () => {
            expect(isInteriorNode(['settlement:mosswell', 'biome:forest'])).toBe(false)
        })

        it('returns false for the outside threshold node (has structureArea:outside)', () => {
            expect(isInteriorNode(['structure:lantern-and-ladle', 'structureArea:outside', 'settlement:mosswell'])).toBe(false)
        })

        it('returns true for an interior node with a structure tag and no outside area', () => {
            expect(isInteriorNode(['structure:lantern-and-ladle', 'structureArea:common-room', 'settlement:mosswell'])).toBe(true)
        })

        it('returns true for room:<n> area tag', () => {
            expect(isInteriorNode(['structure:lantern-and-ladle', 'structureArea:room:3'])).toBe(true)
        })

        it('returns true when only structure tag is present (no structureArea tag at all)', () => {
            // A structure tag without any area tag still means interior; co-presence
            // validation is the lint rule's concern, not the runtime helper.
            expect(isInteriorNode(['structure:town-hall'])).toBe(true)
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

    describe('computeInteriorNodeIds', () => {
        it('prefers interior tags even when edge directions are only vertical', () => {
            const nodes = [
                { id: 'outside', tags: ['structure:lantern-and-ladle', 'structureArea:outside'] },
                { id: 'upstairs', tags: ['structure:lantern-and-ladle', 'structureArea:guest-room'] }
            ]
            const edges = [{ fromId: 'outside', toId: 'upstairs', direction: 'up' }]

            expect(Array.from(computeInteriorNodeIds(nodes, edges)).sort()).toEqual(['upstairs'])
        })

        it('falls back to in/out edge heuristic for legacy untagged nodes', () => {
            const nodes = [{ id: 'outside' }, { id: 'inside' }]
            const edges = [{ fromId: 'outside', toId: 'inside', direction: 'in' }]

            expect(Array.from(computeInteriorNodeIds(nodes, edges)).sort()).toEqual(['inside'])
        })

        it('unions tag-based and edge-based detection', () => {
            const nodes = [
                { id: 'tagged', tags: ['structure:clocktower', 'structureArea:machinery'] },
                { id: 'legacyOutside' },
                { id: 'legacyInside' }
            ]
            const edges = [{ fromId: 'legacyOutside', toId: 'legacyInside', direction: 'in' }]

            expect(Array.from(computeInteriorNodeIds(nodes, edges)).sort()).toEqual(['legacyInside', 'tagged'])
        })
    })
})
