import { buildExternalId, parseClientPrincipal } from '@piquet-h/shared/auth'
import assert from 'node:assert'
import { describe, test } from 'node:test'
import { HeaderBag, makePrincipalPayload } from '../helpers/testUtils.js'

describe('Player Auth Parsing', () => {
    test('parseClientPrincipal returns object for valid header', () => {
        const { b64 } = makePrincipalPayload()
        const headers = new HeaderBag()
        headers.set('x-ms-client-principal', b64)
        const parsed = parseClientPrincipal(headers)
        assert.ok(parsed)
        assert.equal(parsed?.userId, 'ABC123')
    })

    test('buildExternalId stable format', () => {
        const principal = { userId: 'UserXYZ', identityProvider: 'GitHub' } as { userId: string; identityProvider: string }
        const ext = buildExternalId(principal)
        assert.equal(ext, 'github:userxyz')
    })
})
