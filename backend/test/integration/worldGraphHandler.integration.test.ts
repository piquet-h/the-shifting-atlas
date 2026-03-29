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
import type { ForbiddenExitMotif } from '@piquet-h/shared'
import type { PendingExitMetadata } from '../../src/services/frontierContext.js'
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

    it('includes forbidden exits as forbidden graph edges distinguishable from pending edges', async () => {
        const sourceId = '99990000-aaaa-bbbb-cccc-111111111111'

        await locationRepo.upsert({
            id: sourceId,
            name: 'Frontier With Barrier',
            description: 'A coastal node with a pending exit and a forbidden sea barrier.',
            exits: [],
            exitAvailability: {
                pending: {
                    north: 'open plains ahead'
                },
                forbidden: {
                    west: { reason: 'Open sea bars passage', motif: 'water' }
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
            invocationId: 'test-world-graph-forbidden-distinguishable'
        }) as unknown as InvocationContext
        ;(context.extraInputs as unknown as Map<string, unknown>).set('container', container)

        const response = await handler.handle(req, context)
        assert.equal(response.status, 200)

        const body = response.jsonBody as {
            success: boolean
            data?: {
                nodes: Array<{ id: string; name: string; tags?: string[] }>
                edges: Array<{
                    fromId: string
                    toId: string
                    direction: string
                    pending?: boolean
                    forbidden?: boolean
                    forbiddenContext?: { reason: string; motif?: ForbiddenExitMotif }
                }>
            }
        }

        assert.equal(body.success, true)
        assert.ok(body.data)

        const sourceEdges = body.data!.edges.filter((e) => e.fromId === sourceId)

        // Pending north exit must be marked pending, not forbidden
        const northEdge = sourceEdges.find((e) => e.direction === 'north')
        assert.ok(northEdge, 'Expected north pending edge')
        assert.equal(northEdge!.pending, true, 'North edge should be marked pending=true')
        assert.equal(northEdge!.forbidden, undefined, 'North pending edge must not carry forbidden flag')

        // Forbidden west exit must be marked forbidden, not pending
        const westEdge = sourceEdges.find((e) => e.direction === 'west')
        assert.ok(westEdge, 'Expected west forbidden edge')
        assert.equal(westEdge!.forbidden, true, 'West edge should be marked forbidden=true')
        assert.equal(westEdge!.pending, undefined, 'West forbidden edge must not carry pending flag')

        // Forbidden edge must carry structured barrier context
        assert.ok(westEdge!.forbiddenContext, 'Forbidden edge should carry forbiddenContext')
        assert.equal(westEdge!.forbiddenContext!.motif, 'water', 'forbiddenContext.motif should be "water"')

        // Synthetic nodes must be tagged appropriately so consumers can distinguish
        const pendingNode = body.data!.nodes.find((n) => n.id === northEdge!.toId)
        const forbiddenNode = body.data!.nodes.find((n) => n.id === westEdge!.toId)
        assert.ok(pendingNode?.tags?.includes('pending:synthetic'), 'Pending node must carry pending:synthetic tag')
        assert.ok(forbiddenNode?.tags?.includes('forbidden:synthetic'), 'Forbidden node must carry forbidden:synthetic tag')
    })

    it('includes frontierContext with overland route-continuity metadata for macro-tagged pending exits', async () => {
        const sourceId = '99990000-aaaa-bbbb-cccc-222222222222'

        await locationRepo.upsert({
            id: sourceId,
            name: 'Mosswell Route Node',
            description: 'A frontier node on the harbor-to-northgate route.',
            exits: [],
            // Tags carry macro area + route lineage: no water tag → north should be overland
            tags: ['settlement:mosswell', 'macro:area:lr-area-mosswell-fiordhead', 'macro:route:mw-route-harbor-to-northgate'],
            exitAvailability: {
                pending: {
                    north: 'route continuation toward the northgate approach'
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
            invocationId: 'test-world-graph-overland-route-continuity'
        }) as unknown as InvocationContext
        ;(context.extraInputs as unknown as Map<string, unknown>).set('container', container)

        const response = await handler.handle(req, context)
        assert.equal(response.status, 200)

        const body = response.jsonBody as {
            success: boolean
            data?: {
                nodes: Array<{ id: string; name: string }>
                edges: Array<{
                    fromId: string
                    toId: string
                    direction: string
                    pending?: boolean
                    frontierContext?: PendingExitMetadata
                }>
            }
        }

        assert.equal(body.success, true)
        assert.ok(body.data)

        const northEdge = body.data!.edges.find((e) => e.fromId === sourceId && e.direction === 'north')
        assert.ok(northEdge, 'Expected pending north edge from macro-tagged source')
        assert.equal(northEdge!.pending, true)

        const ctx = northEdge!.frontierContext
        assert.ok(ctx, 'Expected frontierContext on pending edge with macro-tagged source')

        // Overland route-continuity: no water tag so archetype must be overland
        assert.equal(ctx!.structuralArchetype, 'overland', 'North exit from non-water source must be overland')

        // Atlas area and route lineage must be propagated into frontier context
        assert.equal(ctx!.macroAreaRef, 'lr-area-mosswell-fiordhead', 'frontierContext must carry macro area ref')
        assert.ok(ctx!.routeLineage?.includes('mw-route-harbor-to-northgate'), 'frontierContext must carry route lineage from source tags')
    })

    it('includes frontierContext with waterfront and barrier semantics for water-tagged pending exits', async () => {
        const sourceId = '99990000-aaaa-bbbb-cccc-333333333333'

        await locationRepo.upsert({
            id: sourceId,
            name: 'Fiordhead Coastal Node',
            description: 'A coastal frontier node framed by the fjord and cliffwall.',
            exits: [],
            // Tags carry macro area + water context: west exit should be waterfront
            tags: ['settlement:mosswell', 'macro:area:lr-area-mosswell-fiordhead', 'macro:water:fjord-sound-head'],
            exitAvailability: {
                pending: {
                    west: 'coastal path framed by the fiord walls'
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
            invocationId: 'test-world-graph-waterfront-barrier'
        }) as unknown as InvocationContext
        ;(context.extraInputs as unknown as Map<string, unknown>).set('container', container)

        const response = await handler.handle(req, context)
        assert.equal(response.status, 200)

        const body = response.jsonBody as {
            success: boolean
            data?: {
                nodes: Array<{ id: string; name: string }>
                edges: Array<{
                    fromId: string
                    toId: string
                    direction: string
                    pending?: boolean
                    frontierContext?: PendingExitMetadata
                }>
            }
        }

        assert.equal(body.success, true)
        assert.ok(body.data)

        const westEdge = body.data!.edges.find((e) => e.fromId === sourceId && e.direction === 'west')
        assert.ok(westEdge, 'Expected pending west edge from water-tagged source')
        assert.equal(westEdge!.pending, true)

        const ctx = westEdge!.frontierContext
        assert.ok(ctx, 'Expected frontierContext on pending edge from water-tagged source')

        // Waterfront: cardinal direction with water context → waterfront archetype
        assert.equal(ctx!.structuralArchetype, 'waterfront', 'West exit with water context must be waterfront')

        // Water semantics must be propagated from source tags
        assert.equal(ctx!.waterSemantics, 'fjord-sound-head', 'frontierContext must carry water semantics from source tags')

        // Barrier semantics from atlas edges must appear in frontier context
        assert.ok(ctx!.barrierSemantics && ctx!.barrierSemantics.length > 0, 'frontierContext must carry barrier semantics from atlas')
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
