import type { HttpRequest, InvocationContext } from '@azure/functions'
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { MoveHandler } from '../../src/handlers/moveCore.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'
import { makeMoveRequest } from '../helpers/testUtils.js'

describe('PerformMove Core', () => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    /** Helper to create a mock InvocationContext with container */
    async function createMockContext(fixture: IntegrationTestFixture): Promise<InvocationContext> {
        const container = await fixture.getContainer()
        return {
            invocationId: 'test-invocation',
            functionName: 'test-function',
            extraInputs: new Map([['container', container]]),
            log: () => {},
            error: () => {},
            warn: () => {},
            info: () => {},
            debug: () => {},
            trace: () => {}
        } as unknown as InvocationContext
    }

    test('performMove returns ambiguous for relative direction without heading', async () => {
        const ctx = await createMockContext(fixture)
        const req = makeMoveRequest({ dir: 'forward' }) as HttpRequest

        const container = await fixture.getContainer()
        const handler = container.get(MoveHandler)
        // Initialize handler context via handle() then call performMove() for the result
        await handler.handle(req, ctx)
        const res = await handler.performMove(req)

        assert.equal(res.success, false)
        assert.equal(res.error?.type, 'ambiguous')
        assert.equal(res.error?.statusCode, 400)
    })

    test('performMove returns invalid-direction for unknown input', async () => {
        const ctx = await createMockContext(fixture)
        const req = makeMoveRequest({ dir: 'zzz' }) as HttpRequest

        const container = await fixture.getContainer()
        const handler = container.get(MoveHandler)
        // Initialize handler context via handle() then call performMove() for the result
        await handler.handle(req, ctx)
        const res = await handler.performMove(req)

        assert.equal(res.success, false)
        assert.equal(res.error?.type, 'invalid-direction')
        assert.equal(res.error?.statusCode, 400)
    })
})
