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
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'
import { TestMocks } from '../helpers/TestFixture.js'

describe('WorldGraphHandler Integration', () => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        // Container is created lazily, but we force it here so the test fails fast if DI is miswired.
        await fixture.getContainer()
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
})
