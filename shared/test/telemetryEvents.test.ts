import assert from 'node:assert'
import test from 'node:test'
import { GAME_EVENT_NAMES, TELEMETRY_NAME_REGEX, isGameEventName } from '../src/telemetryEvents.js'

// Ensure every declared event name matches the enforced pattern
for (const name of GAME_EVENT_NAMES) {
    test(`event name pattern: ${name}`, () => {
        assert.ok(TELEMETRY_NAME_REGEX.test(name), `Name ${name} does not match pattern`)
        assert.ok(isGameEventName(name), `isGameEventName failed for ${name}`)
    })
}

// Negative check
test('unrecognized event name', () => {
    assert.equal(isGameEventName('world.location.generated'), false)
})

// AI.Cost.* specific tests
test('AI.Cost.Estimated is registered', () => {
    assert.ok(isGameEventName('AI.Cost.Estimated'), 'AI.Cost.Estimated should be recognized')
})

test('AI.Cost.WindowSummary is registered', () => {
    assert.ok(isGameEventName('AI.Cost.WindowSummary'), 'AI.Cost.WindowSummary should be recognized')
})

test('AI.Cost.OverrideRejected is registered', () => {
    assert.ok(isGameEventName('AI.Cost.OverrideRejected'), 'AI.Cost.OverrideRejected should be recognized')
})

test('AI.Cost.InputAdjusted is registered', () => {
    assert.ok(isGameEventName('AI.Cost.InputAdjusted'), 'AI.Cost.InputAdjusted should be recognized')
})

test('AI.Cost.InputCapped is registered', () => {
    assert.ok(isGameEventName('AI.Cost.InputCapped'), 'AI.Cost.InputCapped should be recognized')
})

test('AI.Cost.SoftThresholdCrossed is registered', () => {
    assert.ok(isGameEventName('AI.Cost.SoftThresholdCrossed'), 'AI.Cost.SoftThresholdCrossed should be recognized')
})

test('unknown AI.Cost.* variant rejected', () => {
    assert.equal(isGameEventName('AI.Cost.Unknown'), false, 'Unknown AI.Cost.* variant should be rejected')
    assert.equal(isGameEventName('AI.Cost.InvalidEvent'), false, 'Invalid AI.Cost.* variant should be rejected')
    assert.equal(isGameEventName('AI.Cost.NotRegistered'), false, 'Unregistered AI.Cost.* variant should be rejected')
})

test('AI.Cost events match telemetry pattern', () => {
    const aiCostEvents = GAME_EVENT_NAMES.filter((name) => name.startsWith('AI.Cost.'))
    assert.ok(aiCostEvents.length === 6, `Expected 6 AI.Cost events, found ${aiCostEvents.length}`)

    for (const event of aiCostEvents) {
        assert.ok(TELEMETRY_NAME_REGEX.test(event), `${event} should match telemetry pattern`)
    }
})
