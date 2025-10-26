/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Player Bootstrap Flow Tests (Envelope Variant)
 * Ensures bootstrap returns ApiSuccessEnvelope with expected data fields.
 */
import type { InvocationContext } from '@azure/functions'
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { bootstrapPlayerHandler } from '../../src/functions/bootstrapPlayer.handler.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'
import { makeHttpRequest } from '../helpers/testUtils.js'

describe('Player Bootstrap Flow (Envelope)', () => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    async function callBootstrap(options?: { playerGuidHeader?: string }) {
        const container = await fixture.getContainer()
        const mockContext = {
            invocationId: 'test-invocation',
            functionName: 'playerBootstrap',
            extraInputs: new Map([['container', container]]),
            log: () => {},
            error: () => {},
            warn: () => {},
            info: () => {},
            debug: () => {},
            trace: () => {}
        } as unknown as InvocationContext

        return bootstrapPlayerHandler(makeHttpRequest(options), mockContext)
    }

    test('initial bootstrap returns envelope + created=true', async () => {
        const response = await callBootstrap()
        assert.strictEqual(response.status, 200)
        const body = response.jsonBody as Record<string, unknown>
        assert.strictEqual(body.success, true)
        const data = body.data as Record<string, unknown>
        assert.ok(data.playerGuid)
        assert.strictEqual(typeof data.playerGuid, 'string')
        assert.strictEqual(data.created, true)
        assert.ok(data.currentLocationId)
        const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        assert.match(data.playerGuid as string, guidRegex)
    })

    test('repeat bootstrap with header returns same GUID created=false', async () => {
        const first = await callBootstrap()
        const firstGuid = (first.jsonBody as any).data.playerGuid as string

        const second = await callBootstrap({ playerGuidHeader: firstGuid })
        assert.strictEqual(second.status, 200)
        const secondData = (second.jsonBody as any).data
        assert.strictEqual(secondData.playerGuid, firstGuid)
        assert.strictEqual(secondData.created, false)
        const headers = second.headers as Record<string, string>
        assert.strictEqual(headers['x-player-guid'], firstGuid)
    })

    test('latencyMs present and reasonable', async () => {
        const res = await callBootstrap()
        const data = (res.jsonBody as any).data
        assert.ok(typeof data.latencyMs === 'number')
        assert.ok(data.latencyMs >= 0)
        assert.ok(data.latencyMs < 30000)
    })

    test('malformed GUID header creates new GUID', async () => {
        for (const malformed of ['not-a-guid', '12345', 'invalid-uuid-format', 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx']) {
            const res = await callBootstrap({ playerGuidHeader: malformed })
            const data = (res.jsonBody as any).data
            assert.ok(data.playerGuid)
            assert.notStrictEqual(data.playerGuid, malformed)
            assert.strictEqual(data.created, true)
        }
    })

    test('empty GUID header creates new GUID', async () => {
        for (const empty of ['', '   ', '\t', '\n']) {
            const res = await callBootstrap({ playerGuidHeader: empty })
            const data = (res.jsonBody as any).data
            assert.ok(data.playerGuid)
            assert.strictEqual(data.created, true)
        }
    })

    test('rapid repeat calls idempotent', async () => {
        const first = await callBootstrap()
        const guid = (first.jsonBody as any).data.playerGuid as string

        const responses = await Promise.all(Array.from({ length: 5 }, () => callBootstrap({ playerGuidHeader: guid })))
        for (const r of responses) {
            const data = (r.jsonBody as any).data
            assert.strictEqual(data.playerGuid, guid)
            assert.strictEqual(data.created, false)
        }
    })

    test('headers include required fields', async () => {
        const res = await callBootstrap()
        const headers = res.headers as Record<string, string>
        assert.match(headers['Content-Type'], /application\/json/)
        assert.strictEqual(headers['Cache-Control'], 'no-store')
        assert.ok(headers['x-player-guid'])
        const body = res.jsonBody as Record<string, unknown>
        const data = body.data as Record<string, unknown>
        assert.ok(headers['x-correlation-id'] || data.playerGuid)
    })

    test('envelope data contains required fields', async () => {
        const res = await callBootstrap()
        const body = res.jsonBody as Record<string, unknown>
        const data = body.data as Record<string, unknown>
        assert.ok(data.playerGuid)
        assert.ok(typeof data.created === 'boolean')
        assert.ok(data.currentLocationId)
        assert.ok(typeof data.latencyMs === 'number')
        if (data.name !== undefined) assert.strictEqual(typeof data.name, 'string')
    })
})
