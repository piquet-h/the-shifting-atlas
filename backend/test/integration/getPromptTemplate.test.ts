/**
 * Integration tests for GET /api/prompts/{id}
 *
 * Issue #626 acceptance criteria:
 * - retrieves latest or version
 * - supports ?hash
 * - supports ETag/304
 * - 404 not found
 * - 400 when version+hash both provided
 */

import type { HttpRequest, InvocationContext } from '@azure/functions'
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { getPromptTemplateHandler } from '../../src/handlers/getPromptTemplate.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'
import { MockTelemetryClient } from '../mocks/MockTelemetryClient.js'

describe('GET /api/prompts/{id} (GetPromptTemplate) integration', () => {
    let fixture: IntegrationTestFixture
    let originalPromptCacheTtlSeconds: string | undefined

    beforeEach(async () => {
        originalPromptCacheTtlSeconds = process.env.PROMPT_TEMPLATE_CACHE_TTL_SECONDS
        fixture = new IntegrationTestFixture('memory')
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
        if (originalPromptCacheTtlSeconds === undefined) {
            delete process.env.PROMPT_TEMPLATE_CACHE_TTL_SECONDS
        } else {
            process.env.PROMPT_TEMPLATE_CACHE_TTL_SECONDS = originalPromptCacheTtlSeconds
        }
    })

    async function createMockContext(): Promise<InvocationContext> {
        const container = await fixture.getContainer()
        return {
            invocationId: 'test-invocation',
            functionName: 'GetPromptTemplate',
            extraInputs: new Map([['container', container]]),
            log: () => {},
            error: () => {},
            warn: () => {},
            info: () => {},
            debug: () => {},
            trace: () => {}
        } as unknown as InvocationContext
    }

    function createMockRequest(options: {
        params?: Record<string, string>
        query?: Record<string, string>
        headers?: Record<string, string>
    }): HttpRequest {
        return {
            method: 'GET',
            url: 'http://localhost/api/prompts/test',
            params: options.params || {},
            query: {
                get: (key: string) => options.query?.[key] || null
            },
            headers: {
                get: (name: string) => options.headers?.[name] || null
            }
        } as unknown as HttpRequest
    }

    async function getTelemetryClient(): Promise<MockTelemetryClient> {
        const client = await fixture.getTelemetryClient()
        return client as MockTelemetryClient
    }

    test('returns 200 and ETag for known template id (latest)', async () => {
        const ctx = await createMockContext()

        const telemetry = await getTelemetryClient()
        telemetry.clear()

        const req = createMockRequest({ params: { id: 'location' } })
        const res = await getPromptTemplateHandler(req, ctx)

        assert.strictEqual(res.status, 200)
        const headers = res.headers as Record<string, string>
        assert.ok(headers?.ETag, 'Should include ETag header')
        assert.ok(headers?.['Cache-Control']?.includes('max-age='), 'Should include Cache-Control max-age')

        const body = JSON.parse(JSON.stringify(res.jsonBody)) as {
            success: boolean
            data?: { id: string; hash: string }
            error?: { code: string }
        }
        assert.strictEqual(body.success, true)
        assert.ok(body.data)
        assert.strictEqual(body.data.id, 'location')
        assert.ok(typeof body.data.hash === 'string' && body.data.hash.length > 0)

        const events = telemetry.events.filter((e) => e.name === 'PromptTemplate.Get')
        assert.strictEqual(events.length, 1)
        assert.ok(events[0].properties)
        assert.strictEqual(events[0].properties.status, 200)
    })

    test('respects PROMPT_TEMPLATE_CACHE_TTL_SECONDS for Cache-Control max-age', async () => {
        process.env.PROMPT_TEMPLATE_CACHE_TTL_SECONDS = '12'

        // Re-create fixture so DI picks up the new TTL for repo caching too.
        await fixture.teardown()
        fixture = new IntegrationTestFixture('memory')
        await fixture.setup()

        const ctx = await createMockContext()

        const req = createMockRequest({ params: { id: 'location' } })
        const res = await getPromptTemplateHandler(req, ctx)

        assert.strictEqual(res.status, 200)
        const headers = res.headers as Record<string, string>
        assert.strictEqual(headers['Cache-Control'], 'public, max-age=12')
    })

    test('returns 304 when If-None-Match matches template hash', async () => {
        const ctx = await createMockContext()

        // First call to get ETag/hash
        const first = await getPromptTemplateHandler(createMockRequest({ params: { id: 'location' } }), ctx)
        assert.strictEqual(first.status, 200)
        const etag = (first.headers as Record<string, string>).ETag
        assert.ok(etag)

        const telemetry = await getTelemetryClient()
        telemetry.clear()

        const req = createMockRequest({ params: { id: 'location' }, headers: { 'if-none-match': etag } })
        const res = await getPromptTemplateHandler(req, ctx)

        assert.strictEqual(res.status, 304)
        const headers = res.headers as Record<string, string>
        assert.strictEqual(headers.ETag, etag)
        assert.ok(headers['x-correlation-id'])

        const events = telemetry.events.filter((e) => e.name === 'PromptTemplate.Get')
        assert.strictEqual(events.length, 1)
        assert.ok(events[0].properties)
        assert.strictEqual(events[0].properties.status, 304)
        assert.strictEqual(events[0].properties.cached, true)
    })

    test('returns 400 when both version and hash provided', async () => {
        const ctx = await createMockContext()

        const req = createMockRequest({
            params: { id: 'location' },
            query: { version: '1.0.0', hash: 'deadbeef' }
        })
        const res = await getPromptTemplateHandler(req, ctx)

        assert.strictEqual(res.status, 400)
        const body = JSON.parse(JSON.stringify(res.jsonBody)) as {
            success: boolean
            error?: { code: string }
        }
        assert.strictEqual(body.success, false)
        assert.ok(body.error)
        assert.strictEqual(body.error.code, 'ConflictingParameters')
    })

    test('returns 404 for unknown template id', async () => {
        const ctx = await createMockContext()

        const req = createMockRequest({ params: { id: 'definitely-not-a-template' } })
        const res = await getPromptTemplateHandler(req, ctx)

        assert.strictEqual(res.status, 404)
        const body = JSON.parse(JSON.stringify(res.jsonBody)) as {
            success: boolean
            error?: { code: string }
        }
        assert.strictEqual(body.success, false)
        assert.ok(body.error)
        assert.strictEqual(body.error.code, 'NotFound')
    })
})
