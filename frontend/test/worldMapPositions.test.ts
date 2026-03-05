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

        it('supports distanceScale to broaden the layout spacing', () => {
            const nodes = [{ id: ROOT_ID }, { id: EAST_ID }]
            const edges = [{ fromId: ROOT_ID, toId: EAST_ID, direction: 'east' }]
            const positions = computePositions(nodes, edges, ROOT_ID, { distanceScale: 2 })
            expect(positions.get(EAST_ID)!.x).toBe(BASE_DISTANCE_PX * 2)
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

        it('avoids placing multiple nodes at the exact same coordinates (overlap guard)', () => {
            const A = ROOT_ID
            const B = 'node-00000000-0000-0000-0000-000000000010'
            const C = 'node-00000000-0000-0000-0000-000000000011'
            const nodes = [{ id: A }, { id: B }, { id: C }]

            // Unknown direction currently resolves to (0,0) vector → both would overlap at (0,0)
            // unless we add collision/unknown-direction mitigation.
            const edges = [
                { fromId: A, toId: B, direction: 'inside' },
                { fromId: A, toId: C, direction: 'inside' }
            ]

            const positions = computePositions(nodes, edges, A)
            expect(positions.get(B)).toBeDefined()
            expect(positions.get(C)).toBeDefined()

            const pb = positions.get(B)!
            const pc = positions.get(C)!
            expect(pb).not.toEqual(pc)
        })

        it('relaxes positions to reduce directional contradictions in small cycles', () => {
            // Scenario: C is reached via two constraints:
            //   R --north--> C   (wants C at x=0)
            //   R --east--> B, B --north--> C (wants C at x=BASE_DISTANCE_PX)
            // A pure BFS spanning-tree placement picks the first route it sees (R->north),
            // which makes the B->north edge visually misleading.
            // We expect computePositions to compromise so C shifts partway toward x=BASE_DISTANCE_PX.
            const R = ROOT_ID
            const B = 'node-00000000-0000-0000-0000-000000000020'
            const C = 'node-00000000-0000-0000-0000-000000000021'

            const nodes = [{ id: R }, { id: B }, { id: C }]
            const edges = [
                { fromId: R, toId: C, direction: 'north' },
                { fromId: R, toId: B, direction: 'east' },
                { fromId: B, toId: C, direction: 'north' }
            ]

            const positions = computePositions(nodes, edges, R)
            const posC = positions.get(C)!

            // Both constraints agree on y; x should be pulled away from 0.
            expect(posC.y).toBe(-BASE_DISTANCE_PX)
            expect(posC.x).toBeGreaterThan(0)

            // In a symmetric least-squares compromise, x should converge near half-way.
            expect(posC.x).toBeCloseTo(BASE_DISTANCE_PX / 2, 0)
        })

        it('normalises asymmetric up/down pair to average duration for consistent placement', () => {
            // up:   A→B = 120 000 ms  (climbing is slow)
            // down: B→A = 30 000 ms   (descending is fast)
            // Without normalisation BFS would place B using 120 000 ms and the relaxation
            // would receive a contradictory 30 000 ms constraint from the reverse edge.
            // After normalisation both directions use avg = 75 000 ms so the gap is coherent.
            const A = ROOT_ID
            const B = 'node-00000000-0000-0000-0000-000000000030'

            const ASCENT_MS = 120_000
            const DESCENT_MS = 30_000
            const AVG_MS = (ASCENT_MS + DESCENT_MS) / 2 // 75 000

            const nodes = [{ id: A }, { id: B }]
            const edges = [
                { fromId: A, toId: B, direction: 'up', travelDurationMs: ASCENT_MS },
                { fromId: B, toId: A, direction: 'down', travelDurationMs: DESCENT_MS }
            ]

            const positions = computePositions(nodes, edges, A)
            const posB = positions.get(B)!

            // With the `up` direction vector [0.4, -1] and average duration:
            const upVec = DIRECTION_VECTORS['up']!
            const expectedScale = (AVG_MS / URBAN_MS) * BASE_DISTANCE_PX
            // Relaxation will converge to the average, so values should match after
            // enough iterations – approximate to 1px tolerance.
            expect(posB.x).toBeCloseTo(upVec[0] * expectedScale, 0)
            expect(posB.y).toBeCloseTo(upVec[1] * expectedScale, 0)
        })

        it('leaves unmatched edges (no reverse) unchanged', () => {
            // A single east edge with no west return should still use its own travelDurationMs
            const A = ROOT_ID
            const B = EAST_ID

            const nodes = [{ id: A }, { id: B }]
            const edges = [{ fromId: A, toId: B, direction: 'east', travelDurationMs: URBAN_MS * 3 }]

            const positions = computePositions(nodes, edges, A)
            const posB = positions.get(B)!

            // Should use travelDurationMs directly (no reverse to average with)
            expect(posB.x).toBe(BASE_DISTANCE_PX * 3)
            expect(posB.y).toBe(0)
        })

        it('symmetric pairs (same duration both ways) are unaffected by normalisation', () => {
            // north=60 000, south=60 000 → avg still 60 000
            const A = ROOT_ID
            const B = NORTH_ID

            const nodes = [{ id: A }, { id: B }]
            const edges = [
                { fromId: A, toId: B, direction: 'north', travelDurationMs: 60_000 },
                { fromId: B, toId: A, direction: 'south', travelDurationMs: 60_000 }
            ]

            const positions = computePositions(nodes, edges, A)
            const posB = positions.get(B)!

            const expectedScale = (60_000 / URBAN_MS) * BASE_DISTANCE_PX
            // north vector is (0, -1)
            expect(posB.x).toBeCloseTo(0, 1)
            expect(posB.y).toBeCloseTo(-expectedScale, 0)
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
