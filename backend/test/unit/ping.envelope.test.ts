import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { backendHealth } from '../../src/handlers/health.handler.js'
import { ping } from '../../src/handlers/ping.handler.js'
import { UnitTestFixture } from '../helpers/UnitTestFixture.js'

interface ResponseWithBody {
    status?: number
    jsonBody?: {
        success?: boolean
        data?: Record<string, unknown>
        correlationId?: string
    }
    headers?: Record<string, string>
}

describe('Ping and Health Envelope Tests', () => {
    let fixture: UnitTestFixture

    beforeEach(async () => {
        fixture = new UnitTestFixture()
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    test('ping function returns success envelope with service + latency', async () => {
        const req = fixture.createHttpRequest({
            method: 'GET',
            url: 'http://localhost/api/ping'
        })
        const ctx = await fixture.createInvocationContext()
        const res = (await ping(req as never, ctx)) as ResponseWithBody

        assert.equal(res.status, 200)
        assert.ok(res.headers)
        assert.ok(res.headers?.['Content-Type'])
        const body = res.jsonBody
        assert.equal(body?.success, true)
        assert.ok(body?.data)
        assert.equal(body?.data?.service, 'backend-functions')
        assert.ok(typeof body?.data?.latencyMs === 'number')
        assert.ok(body?.correlationId)
    })

    test('backend health returns success envelope with status ok', async () => {
        const req = fixture.createHttpRequest({
            method: 'GET',
            url: 'http://localhost/api/backend/health'
        })
        const ctx = await fixture.createInvocationContext()
        const res = (await backendHealth(req as never, ctx)) as ResponseWithBody
        const body = res.jsonBody

        assert.equal(res.status ?? 200, 200)
        assert.equal(body?.success, true)
        assert.equal(body?.data?.status, 'ok')
        assert.ok(body?.correlationId)
    })
})
