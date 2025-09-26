import assert from 'node:assert'
import test from 'node:test'
import {GAME_EVENT_NAMES, TELEMETRY_NAME_REGEX, isGameEventName} from '../src/telemetryEvents.js'

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
