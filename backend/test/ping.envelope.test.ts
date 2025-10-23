import assert from 'node:assert'
import { test } from 'node:test'
import { backendHealth } from '../src/functions/health.js'
import { ping } from '../src/functions/ping.js'

function makeHeaders() {
    return { get: () => null }
}

function makePingReq(): unknown {
    return {
        method: 'GET',
        url: 'http://localhost/api/ping',
        query: { get: () => null },
        headers: makeHeaders(),
        text: async () => ''
    }
}

function makeHealthReq(): unknown {
    return {
        method: 'GET',
        url: 'http://localhost/api/backend/health',
        query: { get: () => null },
        headers: makeHeaders(),
        text: async () => ''
    }
}

interface ResponseWithBody {
    status?: number
    jsonBody?: {
        success?: boolean
        data?: Record<string, unknown>
        correlationId?: string
    }
    headers?: Record<string, string>
}

test('ping function returns success envelope with service + latency', async () => {
    const req = makePingReq()
    const ctx = { invocationId: 'test-invocation' } as unknown
    const res = (await ping(req as never, ctx as never)) as ResponseWithBody
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
    const req = makeHealthReq()
    const res = (await backendHealth(req as never)) as ResponseWithBody
    const body = res.jsonBody
    assert.equal(res.status ?? 200, 200)
    assert.equal(body?.success, true)
    assert.equal(body?.data?.status, 'ok')
    assert.ok(body?.correlationId)
})
