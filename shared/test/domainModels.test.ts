import assert from 'node:assert'
import test from 'node:test'
import { DIRECTIONS, err, isDirection, isWorldEventStatus, isWorldEventType, ok } from '../src/domainModels.js'

for (const d of DIRECTIONS) {
    test(`direction valid: ${d}`, () => {
        assert.ok(isDirection(d))
    })
}

test('direction invalid', () => {
    assert.equal(isDirection('diagonal-north'), false)
})

test('world event type guard', () => {
    assert.ok(isWorldEventType('PlayerMoved'))
    assert.ok(!isWorldEventType('playerMoved'))
})

test('world event status guard', () => {
    assert.ok(isWorldEventStatus('Pending'))
    assert.ok(!isWorldEventStatus('pending'))
})

test('api envelope helpers', () => {
    const success = ok({ value: 1 }, 'corr')
    assert.equal(success.success, true)
    assert.equal(success.correlationId, 'corr')
    const failure = err('Bad', 'Something broke')
    assert.equal(failure.success, false)
    assert.equal(failure.error.code, 'Bad')
})
