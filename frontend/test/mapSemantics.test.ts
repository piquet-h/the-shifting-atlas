import { describe, expect, it } from 'vitest'
import { getEdgeClassName, getEdgeKind, isInteriorNode } from '../src/utils/mapSemantics'

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
            expect(
                isInteriorNode(['structure:lantern-and-ladle', 'structureArea:outside', 'settlement:mosswell'])
            ).toBe(false)
        })

        it('returns true for an interior node with a structure tag and no outside area', () => {
            expect(
                isInteriorNode(['structure:lantern-and-ladle', 'structureArea:common-room', 'settlement:mosswell'])
            ).toBe(true)
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
})

