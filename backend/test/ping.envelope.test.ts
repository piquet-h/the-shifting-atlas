import assert from 'node:assert'
import { test } from 'node:test'
import { backendHealth } from '../src/functions/health.js'
import { ping } from '../src/functions/ping.js'

function makeHeaders(): any {
    return { get: () => null }
}

function makePingReq(): any {
    return {
        method: 'GET',
        url: 'http://localhost/api/ping',
        query: { get: (k: string) => null },
        headers: makeHeaders(),
        text: async () => ''
    }
}

function makeHealthReq(): any {
    return {
        method: 'GET',
        url: 'http://localhost/api/backend/health',
        query: { get: () => null },
        headers: makeHeaders(),
        text: async () => ''
    }
}

test('ping function returns success envelope with service + latency', async () => {
    const req = makePingReq()
    const ctx = { invocationId: 'test-invocation' } as any
    const res = await ping(req, ctx)
    assert.equal(res.status, 200)
    assert.ok(res.headers)
    assert.ok((res.headers as any)['Content-Type'])
    const body: any = res.jsonBody
    assert.equal(body.success, true)
    assert.ok(body.data)
    assert.equal(body.data.service, 'backend-functions')
    assert.ok(typeof body.data.latencyMs === 'number')
    assert.ok(body.correlationId)
})

test('backend health returns success envelope with status ok', async () => {
    const req = makeHealthReq()
    const res = await backendHealth(req)
    const body: any = res.jsonBody
    assert.equal(res.status ?? 200, 200)
    assert.equal(body.success, true)
    assert.equal(body.data.status, 'ok')
    assert.ok(body.correlationId)
})
