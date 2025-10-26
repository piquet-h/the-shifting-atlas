import { ensurePlayerForRequest } from '@piquet-h/shared/auth'
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'
import { HeaderBag, makePrincipalPayload } from '../helpers/testUtils.js'

describe('Player Auth', () => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    test('ensurePlayerForRequest creates and reuses player for SWA principal', async () => {
        const repo = await fixture.getPlayerRepository()
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
})
