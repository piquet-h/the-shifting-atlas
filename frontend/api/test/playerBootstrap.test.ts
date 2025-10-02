import { __resetPlayerRepositoryForTests, STARTER_LOCATION_ID } from '@atlas/shared'
import type { HttpRequest, InvocationContext } from '@azure/functions'
import assert from 'node:assert'
import { beforeEach, test } from 'node:test'
import { playerBootstrap } from '../src/functions/playerBootstrap.js'

function makeContext(): InvocationContext {
    return { log: () => undefined } as unknown as InvocationContext
}

function httpRequest(init: { headers?: Record<string, string> }): HttpRequest {
    const headers = new Map<string, string>(Object.entries(init.headers || {}))
    return {
        method: 'GET',
        url: 'http://localhost/api/player/bootstrap',
        headers,
        query: new Map(),
        params: {},
        json: async () => ({}),
        text: async () => ''
    } as unknown as HttpRequest
}

beforeEach(() => {
    __resetPlayerRepositoryForTests()
})

test('new player creation returns 200 with playerGuid and created=true', async () => {
    const res = await playerBootstrap(httpRequest({}), makeContext())
    assert.equal(res.status, 200)
    const body = res.jsonBody as { playerGuid: string; created: boolean; currentLocationId: string; name?: string }
    assert.ok(body.playerGuid, 'playerGuid should be present')
    assert.equal(typeof body.playerGuid, 'string')
    assert.equal(body.created, true, 'created flag should be true for new player')
    assert.equal(body.currentLocationId, STARTER_LOCATION_ID, 'should start at STARTER_LOCATION_ID')
    // Verify x-player-guid header is set in response
    assert.equal(res.headers?.['x-player-guid'], body.playerGuid, 'x-player-guid header should match playerGuid')
})

test('idempotent bootstrap: same x-player-guid returns existing player with created=false', async () => {
    // First call - create player
    const firstRes = await playerBootstrap(httpRequest({}), makeContext())
    const firstBody = firstRes.jsonBody as { playerGuid: string; created: boolean }
    assert.equal(firstBody.created, true, 'first call should create player')
    const playerGuid = firstBody.playerGuid

    // Second call with same x-player-guid - should return existing
    const secondRes = await playerBootstrap(httpRequest({ headers: { 'x-player-guid': playerGuid } }), makeContext())
    assert.equal(secondRes.status, 200)
    const secondBody = secondRes.jsonBody as { playerGuid: string; created: boolean; currentLocationId: string }
    assert.equal(secondBody.playerGuid, playerGuid, 'should return same playerGuid')
    assert.equal(secondBody.created, false, 'created flag should be false for existing player')
    assert.equal(secondBody.currentLocationId, STARTER_LOCATION_ID, 'location should be preserved')
})

test('idempotent bootstrap: multiple calls with same guid maintain stability', async () => {
    // Create player
    const firstRes = await playerBootstrap(httpRequest({}), makeContext())
    const playerGuid = (firstRes.jsonBody as { playerGuid: string }).playerGuid

    // Call multiple times with same guid
    const secondRes = await playerBootstrap(httpRequest({ headers: { 'x-player-guid': playerGuid } }), makeContext())
    const thirdRes = await playerBootstrap(httpRequest({ headers: { 'x-player-guid': playerGuid } }), makeContext())

    const secondBody = secondRes.jsonBody as { playerGuid: string; created: boolean }
    const thirdBody = thirdRes.jsonBody as { playerGuid: string; created: boolean }

    assert.equal(secondBody.playerGuid, playerGuid, 'second call should return same guid')
    assert.equal(thirdBody.playerGuid, playerGuid, 'third call should return same guid')
    assert.equal(secondBody.created, false, 'second call should not create')
    assert.equal(thirdBody.created, false, 'third call should not create')
})

test('different players get different guids', async () => {
    const res1 = await playerBootstrap(httpRequest({}), makeContext())
    const res2 = await playerBootstrap(httpRequest({}), makeContext())

    const body1 = res1.jsonBody as { playerGuid: string; created: boolean }
    const body2 = res2.jsonBody as { playerGuid: string; created: boolean }

    assert.notEqual(body1.playerGuid, body2.playerGuid, 'different bootstrap calls should create different players')
    assert.equal(body1.created, true)
    assert.equal(body2.created, true)
})

test('response includes required fields', async () => {
    const res = await playerBootstrap(httpRequest({}), makeContext())
    const body = res.jsonBody as {
        playerGuid: string
        created: boolean
        currentLocationId: string
        name?: string
        latencyMs?: number
    }

    assert.ok(body.playerGuid, 'playerGuid is required')
    assert.equal(typeof body.created, 'boolean', 'created must be boolean')
    assert.ok(body.currentLocationId, 'currentLocationId is required')
    assert.equal(typeof body.latencyMs, 'number', 'latencyMs should be included')
})

test('response headers include correlation and cache-control', async () => {
    const res = await playerBootstrap(
        httpRequest({ headers: { 'x-correlation-id': 'test-correlation-123' } }),
        makeContext()
    )

    assert.ok(res.headers, 'headers should be present')
    assert.equal(res.headers['Content-Type'], 'application/json; charset=utf-8')
    assert.equal(res.headers['Cache-Control'], 'no-store')
    assert.equal(res.headers['x-correlation-id'], 'test-correlation-123')
    assert.ok(res.headers['x-player-guid'], 'x-player-guid header should be set')
})
