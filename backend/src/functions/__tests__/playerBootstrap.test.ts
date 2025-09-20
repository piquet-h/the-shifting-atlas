import type {HttpRequest, InvocationContext} from '@azure/functions'
import assert from 'node:assert'
import {__players, playerBootstrap} from '../playerBootstrap.js'

interface MinimalHttpRequest {
    method: string
    url: string
    headers: Map<string, string>
    query: Map<string, string>
    text(): Promise<string>
}

class TestHttpRequest implements MinimalHttpRequest {
    method = 'GET'
    url = 'http://localhost/api/player/bootstrap'
    headers = new Map<string, string>()
    query = new Map<string, string>()
    async text(): Promise<string> {
        return ''
    }
}

const context: InvocationContext = {
    invocationId: 'test-invocation',
    log: () => {
        /* noop */
    }
} as unknown as InvocationContext

;(async () => {
    // First call (no header) => created true
    const req1 = new TestHttpRequest()
    const res1 = await playerBootstrap(req1 as unknown as HttpRequest, context)
    assert.equal(res1.status, 200)
    assert.ok(res1.jsonBody.playerGuid)
    assert.equal(res1.jsonBody.created, true)
    const guid = res1.jsonBody.playerGuid as string
    assert.ok(__players.has(guid), 'player stored')

    // Second call with header should reuse existing (created false)
    const req2 = new TestHttpRequest()
    req2.headers.set('x-player-guid', guid)
    const res2 = await playerBootstrap(req2 as unknown as HttpRequest, context)
    assert.equal(res2.jsonBody.playerGuid, guid)
    assert.equal(res2.jsonBody.created, false, 'should not recreate existing player')

    // Third call with unknown guid header should create new (created true)
    const fakeGuid = '00000000-0000-4000-8000-000000000abc'
    const req3 = new TestHttpRequest()
    req3.headers.set('x-player-guid', fakeGuid)
    const res3 = await playerBootstrap(req3 as unknown as HttpRequest, context)
    assert.equal(res3.jsonBody.playerGuid, fakeGuid)
    assert.equal(res3.jsonBody.created, true, 'unknown provided guid should create')
})()
