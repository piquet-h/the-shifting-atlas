/**
 * WorldGraphHandler Integration Tests
 *
 * Validates that GET /api/world/graph works in MEMORY persistence mode.
 *
 * Why: the frontend world map uses this endpoint, and local dev commonly runs in memory mode.
 */

import type { HttpRequest, InvocationContext } from '@azure/functions'
import assert from 'node:assert/strict'
import { after, beforeEach, describe, it } from 'node:test'
import { WorldGraphHandler } from '../../src/handlers/worldGraph.js'
import type { ILocationRepository } from '../../src/repos/locationRepository.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'
import { TestMocks } from '../helpers/TestFixture.js'

describe('WorldGraphHandler Integration', () => {
    let fixture: IntegrationTestFixture
    let locationRepo: ILocationRepository

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        // Container is created lazily, but we force it here so the test fails fast if DI is miswired.
        await fixture.getContainer()
        locationRepo = await fixture.getLocationRepository()
    })

    after(async () => {
        if (fixture) await fixture.teardown()
    })

    it('returns nodes and edges in memory mode', async () => {
        const container = await fixture.getContainer()
        const handler = container.get(WorldGraphHandler)

        const req = TestMocks.createHttpRequest({
            method: 'GET',
            url: 'http://localhost/api/world/graph'
        }) as HttpRequest

        const context = TestMocks.createInvocationContext({
            invocationId: 'test-world-graph'
        }) as unknown as InvocationContext
        ;(context.extraInputs as unknown as Map<string, unknown>).set('container', container)

        const response = await handler.handle(req, context)

        assert.equal(response.status, 200)
        const body = response.jsonBody as unknown as { success: boolean; data?: { nodes: unknown[]; edges: unknown[] } }
        assert.equal(body.success, true)
        assert.ok(body.data, 'Expected ok envelope to include data')
        assert.ok(Array.isArray(body.data.nodes), 'Expected nodes array')
        assert.ok(Array.isArray(body.data.edges), 'Expected edges array')

        // Memory mode seeds starterLocations.json, so we expect at least one location node.
        assert.ok(body.data.nodes.length > 0, 'Expected at least 1 node')
    })

    it('includes pending exits as pending graph edges with synthetic target nodes', async () => {
        const sourceId = '99990000-1111-2222-3333-444444444444'
        const hardTargetId = '99990000-1111-2222-3333-555555555555'

        await locationRepo.upsert({
            id: hardTargetId,
            name: 'Hard Target',
            description: 'Concrete destination',
            exits: [],
            version: 1
        })

        await locationRepo.upsert({
            id: sourceId,
            name: 'Pending Source',
            description: 'A frontier node with pending directions.',
            exits: [{ direction: 'north', to: hardTargetId }],
            exitAvailability: {
                pending: {
                    east: 'edge to be generated',
                    west: 'edge to be generated'
                }
            },
            version: 1
        })

        const container = await fixture.getContainer()
        const handler = container.get(WorldGraphHandler)

        const req = TestMocks.createHttpRequest({
            method: 'GET',
            url: 'http://localhost/api/world/graph'
        }) as HttpRequest

        const context = TestMocks.createInvocationContext({
            invocationId: 'test-world-graph-pending'
        }) as unknown as InvocationContext
        ;(context.extraInputs as unknown as Map<string, unknown>).set('container', container)

        const response = await handler.handle(req, context)
        assert.equal(response.status, 200)

        const body = response.jsonBody as {
            success: boolean
            data?: {
                nodes: Array<{ id: string; name: string }>
                edges: Array<{ fromId: string; toId: string; direction: string; pending?: boolean }>
            }
        }

        assert.equal(body.success, true)
        assert.ok(body.data)

        const sourceEdges = body.data!.edges.filter((e) => e.fromId === sourceId)
        const northHard = sourceEdges.find((e) => e.direction === 'north')
        const eastPending = sourceEdges.find((e) => e.direction === 'east')
        const westPending = sourceEdges.find((e) => e.direction === 'west')

        assert.ok(northHard, 'Expected existing hard north edge')
        assert.equal(northHard?.pending, undefined, 'Hard edge should not be marked pending')

        assert.ok(eastPending, 'Expected pending east edge to be present')
        assert.equal(eastPending?.pending, true, 'Pending edge should be marked pending=true')
        assert.ok(westPending, 'Expected pending west edge to be present')
        assert.equal(westPending?.pending, true, 'Pending edge should be marked pending=true')

        const syntheticTargetIds = [eastPending?.toId, westPending?.toId].filter(Boolean) as string[]
        assert.equal(syntheticTargetIds.length, 2, 'Expected synthetic target node IDs for pending edges')

        const syntheticNodes = body.data!.nodes.filter((n) => syntheticTargetIds.includes(n.id))
        assert.equal(syntheticNodes.length, 2, 'Expected synthetic nodes for pending edges')
        for (const node of syntheticNodes) {
            assert.ok(node.name.toLowerCase().includes('unexplored'), 'Expected synthetic node to be marked unexplored')
        }
    })

    it('uses direction-aware synthetic node names for pending in/out/up/down exits', async () => {
        const sourceId = '99990000-1111-2222-3333-666666666666'

        await locationRepo.upsert({
            id: sourceId,
            name: 'Vertical Pending Source',
            description: 'A structure with vertical and radial pending exits.',
            exits: [],
            exitAvailability: {
                pending: {
                    in: 'A doorway leads inside.',
                    out: 'A threshold leads back out.',
                    up: 'A stair rises to an upper level.',
                    down: 'A hatch descends below.'
                }
            },
            version: 1
        })

        const container = await fixture.getContainer()
        const handler = container.get(WorldGraphHandler)

        const req = TestMocks.createHttpRequest({
            method: 'GET',
            url: 'http://localhost/api/world/graph'
        }) as HttpRequest

        const context = TestMocks.createInvocationContext({
            invocationId: 'test-world-graph-pending-direction-aware-names'
        }) as unknown as InvocationContext
        ;(context.extraInputs as unknown as Map<string, unknown>).set('container', container)

        const response = await handler.handle(req, context)
        assert.equal(response.status, 200)

        const body = response.jsonBody as {
            success: boolean
            data?: {
                nodes: Array<{ id: string; name: string }>
                edges: Array<{ fromId: string; toId: string; direction: string; pending?: boolean }>
            }
        }

        assert.equal(body.success, true)
        assert.ok(body.data)

        const expectedNamesByDirection = {
            in: 'Unexplored Interior',
            out: 'Unexplored Exterior Approach',
            up: 'Unexplored Upper Level',
            down: 'Unexplored Lower Level'
        } as const

        for (const [direction, expectedName] of Object.entries(expectedNamesByDirection)) {
            const pendingEdge = body.data!.edges.find((e) => e.fromId === sourceId && e.direction === direction)
            assert.ok(pendingEdge, `Expected pending ${direction} edge`)
            assert.equal(pendingEdge?.pending, true, `Expected pending ${direction} edge to be marked pending=true`)

            const targetNode = body.data!.nodes.find((n) => n.id === pendingEdge?.toId)
            assert.ok(targetNode, `Expected synthetic node for pending ${direction}`)
            assert.equal(targetNode?.name, expectedName, `Expected pending ${direction} node name to be direction-aware`)
        }
    })
})
