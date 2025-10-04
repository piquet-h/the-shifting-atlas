import { __resetPlayerRepositoryForTests, getPlayerRepository } from '@atlas/shared'
import type { HttpRequest } from '@azure/functions'
import assert from 'node:assert'
import { beforeEach, test } from 'node:test'
import { playerBootstrap } from '../src/functions/playerBootstrap.js'
import { playerLink } from '../src/functions/playerLink.js'

function httpRequest(init: { method?: string; headers?: Record<string, string>; body?: unknown }): HttpRequest {
    const headers = new Map<string, string>(Object.entries(init.headers || {}))
    return {
        method: init.method || 'GET',
        url: 'http://localhost',
        headers,
        query: {},
        params: {},
        json: async () => init.body,
        text: async () => (typeof init.body === 'string' ? init.body : JSON.stringify(init.body))
    } as unknown as HttpRequest
}

beforeEach(() => {
    __resetPlayerRepositoryForTests()
})

test('link succeeds for existing guest', async () => {
    const bootstrapRes = await playerBootstrap(httpRequest({}))
    const body = bootstrapRes.jsonBody as { playerGuid: string; created: boolean }
    const guid = body.playerGuid
    assert.ok(guid, 'guid should exist')
    const linkRes = await playerLink(
        httpRequest({
            method: 'POST',
            body: { playerGuid: guid },
            headers: { 'Content-Type': 'application/json', 'x-external-id': 'user-123' }
        })
    )
    assert.equal(linkRes.status, 200)
    const linkBody = linkRes.jsonBody as { playerGuid: string; linked: boolean; alreadyLinked: boolean; externalId: string }
    assert.equal(linkBody.playerGuid, guid)
    assert.equal(linkBody.linked, true)
    assert.equal(linkBody.alreadyLinked, false)
    const repo = await getPlayerRepository()
    const rec = await repo.get(guid)
    assert.ok(rec)
    assert.equal(rec!.guest, false)
    assert.equal(rec!.externalId, 'user-123')
})

test('idempotent second link', async () => {
    const bootstrapRes = await playerBootstrap(httpRequest({}))
    const guid = (bootstrapRes.jsonBody as { playerGuid: string }).playerGuid
    await playerLink(
        httpRequest({
            method: 'POST',
            body: { playerGuid: guid },
            headers: { 'Content-Type': 'application/json', 'x-external-id': 'user-456' }
        })
    )
    const second = await playerLink(
        httpRequest({
            method: 'POST',
            body: { playerGuid: guid },
            headers: { 'Content-Type': 'application/json', 'x-external-id': 'user-789' }
        })
    )
    const linkBody = second.jsonBody as { alreadyLinked: boolean }
    assert.equal(linkBody.alreadyLinked, true)
    const repo = await getPlayerRepository()
    const rec = await repo.get(guid)
    assert.ok(rec)
    assert.equal(rec!.externalId, 'user-456', 'externalId should remain first linked id')
})

test('404 for unknown guid', async () => {
    const res = await playerLink(
        httpRequest({
            method: 'POST',
            body: { playerGuid: '00000000-0000-4000-8000-000000000000' },
            headers: { 'Content-Type': 'application/json' }
        })
    )
    assert.equal(res.status, 404)
})

test('400 when missing guid', async () => {
    const res = await playerLink(httpRequest({ method: 'POST', body: {}, headers: { 'Content-Type': 'application/json' } }))
    assert.equal(res.status, 400)
})
