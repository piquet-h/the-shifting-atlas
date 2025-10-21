import assert from 'node:assert'
import { test } from 'node:test'
import { performMove } from '../src/functions/moveHandlerCore.js'
import { makeMoveRequest } from './helpers/testUtils.js'

test('performMove returns ambiguous for relative direction without heading', async () => {
    const req = makeMoveRequest({ dir: 'forward' })
    const res = await performMove(req)
    assert.equal(res.success, false)
    assert.equal(res.error?.type, 'ambiguous')
    assert.equal(res.error?.statusCode, 400)
})

test('performMove returns invalid-direction for unknown input', async () => {
    const req = makeMoveRequest({ dir: 'zzz' })
    const res = await performMove(req)
    assert.equal(res.success, false)
    assert.equal(res.error?.type, 'invalid-direction')
    assert.equal(res.error?.statusCode, 400)
})
