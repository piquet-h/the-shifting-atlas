import { describe, expect, it } from 'vitest'
import { BASE_DISTANCE_PX, computePositions, DIRECTION_VECTORS, URBAN_MS } from '../src/utils/worldMapPositions'

const ROOT_ID = 'root-00000000-0000-0000-0000-000000000001'
const NORTH_ID = 'node-00000000-0000-0000-0000-000000000002'
const EAST_ID = 'node-00000000-0000-0000-0000-000000000003'
const ORPHAN_ID = 'node-00000000-0000-0000-0000-000000000099'

describe('worldMapPositions', () => {
    describe('computePositions', () => {
        it('places root node at (0, 0)', () => {
            const nodes = [{ id: ROOT_ID }]
            const positions = computePositions(nodes, [], ROOT_ID)
            expect(positions.get(ROOT_ID)).toEqual({ x: 0, y: 0 })
        })

        it('places north neighbour above root (y < 0)', () => {
            const nodes = [{ id: ROOT_ID }, { id: NORTH_ID }]
            const edges = [{ fromId: ROOT_ID, toId: NORTH_ID, direction: 'north' }]
            const positions = computePositions(nodes, edges, ROOT_ID)
            const pos = positions.get(NORTH_ID)!
            expect(pos.x).toBe(0)
            expect(pos.y).toBeLessThan(0)
        })

        it('places east neighbour to the right (x > 0)', () => {
            const nodes = [{ id: ROOT_ID }, { id: EAST_ID }]
            const edges = [{ fromId: ROOT_ID, toId: EAST_ID, direction: 'east' }]
            const positions = computePositions(nodes, edges, ROOT_ID)
            const pos = positions.get(EAST_ID)!
            expect(pos.x).toBeGreaterThan(0)
            expect(pos.y).toBe(0)
        })

        it('scales distance by travelDurationMs relative to URBAN_MS', () => {
            const nodes = [{ id: ROOT_ID }, { id: EAST_ID }]
            const travelMs = URBAN_MS * 2
            const edges = [{ fromId: ROOT_ID, toId: EAST_ID, direction: 'east', travelDurationMs: travelMs }]
            const positions = computePositions(nodes, edges, ROOT_ID)
            expect(positions.get(EAST_ID)!.x).toBe(BASE_DISTANCE_PX * 2)
        })

        it('uses URBAN_MS as default when travelDurationMs is absent', () => {
            const nodes = [{ id: ROOT_ID }, { id: EAST_ID }]
            const edges = [{ fromId: ROOT_ID, toId: EAST_ID, direction: 'east' }]
            const positions = computePositions(nodes, edges, ROOT_ID)
            expect(positions.get(EAST_ID)!.x).toBe(BASE_DISTANCE_PX)
        })

        it('falls back to first node when rootId is not found', () => {
            const nodes = [{ id: NORTH_ID }, { id: EAST_ID }]
            const edges = [{ fromId: NORTH_ID, toId: EAST_ID, direction: 'east' }]
            const positions = computePositions(nodes, edges, 'unknown-root')
            // First node (NORTH_ID) should be at origin
            expect(positions.get(NORTH_ID)).toEqual({ x: 0, y: 0 })
        })

        it('returns empty map for empty node list', () => {
            const positions = computePositions([], [], ROOT_ID)
            expect(positions.size).toBe(0)
        })

        it('places disconnected (orphan) nodes in a row at y=600', () => {
            const nodes = [{ id: ROOT_ID }, { id: ORPHAN_ID }]
            const edges: never[] = [] // no edges → ORPHAN_ID is disconnected
            const positions = computePositions(nodes, edges, ROOT_ID)
            expect(positions.get(ORPHAN_ID)!.y).toBe(600)
        })

        it('does not revisit already-positioned nodes (cycle safety)', () => {
            // A → B → A cycle: B should only be placed once
            const A = ROOT_ID
            const B = NORTH_ID
            const nodes = [{ id: A }, { id: B }]
            const edges = [
                { fromId: A, toId: B, direction: 'north' },
                { fromId: B, toId: A, direction: 'south' }
            ]
            const positions = computePositions(nodes, edges, ROOT_ID)
            expect(positions.size).toBe(2)
            expect(positions.get(A)).toEqual({ x: 0, y: 0 })
        })
    })

    describe('DIRECTION_VECTORS', () => {
        it('north is (0, -1)', () => {
            expect(DIRECTION_VECTORS['north']).toEqual([0, -1])
        })
        it('south is (0, 1)', () => {
            expect(DIRECTION_VECTORS['south']).toEqual([0, 1])
        })
        it('east is (1, 0)', () => {
            expect(DIRECTION_VECTORS['east']).toEqual([1, 0])
        })
        it('west is (-1, 0)', () => {
            expect(DIRECTION_VECTORS['west']).toEqual([-1, 0])
        })
    })
})
