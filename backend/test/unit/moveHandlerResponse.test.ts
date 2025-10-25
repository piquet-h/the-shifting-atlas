/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from 'node:assert'
import { test } from 'node:test'
import type { MoveResult } from '../../src/functions/moveHandlerCore.js'
import { buildMoveResponse } from '../../src/functions/moveHandlerResponse.js'

function makeErrorResult(type: MoveResult['error']['type'], statusCode: number, clarification?: string, reason?: string): MoveResult {
    return {
        success: false,
        error: { type, statusCode, clarification, reason },
        latencyMs: 5
    }
}

test('buildMoveResponse maps ambiguous error', () => {
    const res = buildMoveResponse(makeErrorResult('ambiguous', 400, 'Need cardinal direction'), 'corr-1')
    assert.equal(res.status, 400)
    const body: any = res.jsonBody
    assert.equal(body.success, false)
    assert.equal(body.error.code, 'AmbiguousDirection')
    assert.equal(body.error.message, 'Need cardinal direction')
})

test('buildMoveResponse maps invalid-direction error', () => {
    const res = buildMoveResponse(makeErrorResult('invalid-direction', 400, 'Unknown direction'), 'corr-2')
    assert.equal(res.status, 400)
    const body: any = res.jsonBody
    assert.equal(body.success, false)
    assert.equal(body.error.code, 'InvalidDirection')
    assert.equal(body.error.message, 'Unknown direction')
})

test('buildMoveResponse maps from-missing error', () => {
    const res = buildMoveResponse(makeErrorResult('from-missing', 404), 'corr-3')
    assert.equal(res.status, 404)
    const body: any = res.jsonBody
    assert.equal(body.success, false)
    assert.equal(body.error.code, 'FromNotFound')
    assert.equal(body.error.message, 'Current location not found')
})

test('buildMoveResponse maps no-exit error', () => {
    const res = buildMoveResponse(makeErrorResult('no-exit', 400), 'corr-4')
    assert.equal(res.status, 400)
    const body: any = res.jsonBody
    assert.equal(body.success, false)
    assert.equal(body.error.code, 'NoExit')
    assert.equal(body.error.message, 'No such exit')
})

test('buildMoveResponse maps move-failed error', () => {
    const res = buildMoveResponse(makeErrorResult('move-failed', 500, undefined, 'target-missing'), 'corr-5')
    assert.equal(res.status, 500)
    const body: any = res.jsonBody
    assert.equal(body.success, false)
    assert.equal(body.error.code, 'MoveFailed')
    assert.equal(body.error.message, 'target-missing')
})

test('buildMoveResponse success path wraps location', () => {
    const success: MoveResult = { success: true, location: { id: 'X', name: 'Place X', description: 'A place' }, latencyMs: 12 }
    const res = buildMoveResponse(success, 'corr-6')
    assert.equal(res.status, 200)
    const body: any = res.jsonBody
    assert.equal(body.success, true)
    assert.ok(body.data)
    assert.equal(body.data.id, 'X')
})

test('buildMoveResponse sets correlation header', () => {
    const success: MoveResult = { success: true, location: { id: 'Y', name: 'Loc Y', description: 'Desc' }, latencyMs: 3 }
    const res = buildMoveResponse(success, 'corr-h')
    const headers = res.headers as Record<string, string>
    assert.equal(headers['x-correlation-id'], 'corr-h')
})
