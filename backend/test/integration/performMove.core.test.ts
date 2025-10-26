import type { HttpRequest, InvocationContext } from '@azure/functions'
import assert from 'node:assert'
import { test } from 'node:test'
import { performMove } from '../../src/functions/moveHandlerCore.js'
import { getTestContainer } from '../helpers/testContainer.js'
import { makeMoveRequest } from '../helpers/testUtils.js'

/** Helper to create a mock InvocationContext with container */
async function makeMockContext(): Promise<InvocationContext> {
    const container = await getTestContainer('memory')
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
    const ctx = await makeMockContext()
    const req = makeMoveRequest({ dir: 'forward' }) as HttpRequest
    const res = await performMove(req, ctx)
    assert.equal(res.success, false)
    assert.equal(res.error?.type, 'ambiguous')
    assert.equal(res.error?.statusCode, 400)
})

test('performMove returns invalid-direction for unknown input', async () => {
    const ctx = await makeMockContext()
    const req = makeMoveRequest({ dir: 'zzz' }) as HttpRequest
    const res = await performMove(req, ctx)
    assert.equal(res.success, false)
    assert.equal(res.error?.type, 'invalid-direction')
    assert.equal(res.error?.statusCode, 400)
})
