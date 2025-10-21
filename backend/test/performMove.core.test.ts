import assert from 'node:assert'
import { test } from 'node:test'
import { performMove } from '../src/functions/moveHandlerCore.js'

function makeReq(query: Record<string, string>): any {
    return {
        method: 'GET',
        url: 'http://localhost/api/player/move',
        query: { get: (k: string) => query[k] || null },
        headers: { get: (name: string) => null }
    }
}

test('performMove returns ambiguous for relative direction without heading', async () => {
    const req = makeReq({ dir: 'forward' })
    const res = await performMove(req)
    assert.equal(res.success, false)
    assert.equal(res.error?.type, 'ambiguous')
    assert.equal(res.error?.statusCode, 400)
})

test('performMove returns invalid-direction for unknown input', async () => {
    const req = makeReq({ dir: 'zzz' })
    const res = await performMove(req)
    assert.equal(res.success, false)
    assert.equal(res.error?.type, 'invalid-direction')
    assert.equal(res.error?.statusCode, 400)
})
