import { buildExternalId, ensurePlayerForRequest, parseClientPrincipal } from '@piquet-h/shared/auth'
import assert from 'node:assert'
import test from 'node:test'
import { __resetPlayerRepositoryForTests, getPlayerRepository } from '../../src/repos/playerRepository.js'
import { HeaderBag, makePrincipalPayload } from '../helpers/testUtils.js'

test('parseClientPrincipal returns object for valid header', () => {
    const { b64 } = makePrincipalPayload()
    const headers = new HeaderBag()
    headers.set('x-ms-client-principal', b64)
    const parsed = parseClientPrincipal(headers)
    assert.ok(parsed)
    assert.equal(parsed?.userId, 'ABC123')
})

test('ensurePlayerForRequest creates and reuses player for SWA principal', async () => {
    __resetPlayerRepositoryForTests()
    const repo = await getPlayerRepository()
    const { b64 } = makePrincipalPayload({ userId: 'UserXYZ' })
    const headers1 = new HeaderBag()
    headers1.set('x-ms-client-principal', b64)

    const first = await ensurePlayerForRequest(headers1, repo)
    assert.ok(first.created, 'First call should create player')
    const headers2 = new HeaderBag()
    headers2.set('x-ms-client-principal', b64)
    const second = await ensurePlayerForRequest(headers2, repo)
    assert.equal(second.playerGuid, first.playerGuid, 'Player GUID should be stable for same principal')
    assert.equal(second.created, false, 'Second call should not mark created')
})

test('buildExternalId stable format', () => {
    const principal = { userId: 'UserXYZ', identityProvider: 'GitHub' } as { userId: string; identityProvider: string }
    const ext = buildExternalId(principal)
    assert.equal(ext, 'github:userxyz')
})
