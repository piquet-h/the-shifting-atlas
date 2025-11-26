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

// Description telemetry events tests
test('Description.Generate.Start is registered', () => {
    assert.ok(isGameEventName('Description.Generate.Start'), 'Description.Generate.Start should be recognized')
})

test('Description.Generate.Success is registered', () => {
    assert.ok(isGameEventName('Description.Generate.Success'), 'Description.Generate.Success should be recognized')
})

test('Description.Generate.Failure is registered', () => {
    assert.ok(isGameEventName('Description.Generate.Failure'), 'Description.Generate.Failure should be recognized')
})

test('Description.Cache.Hit is registered', () => {
    assert.ok(isGameEventName('Description.Cache.Hit'), 'Description.Cache.Hit should be recognized')
})

test('Description.Cache.Miss is registered', () => {
    assert.ok(isGameEventName('Description.Cache.Miss'), 'Description.Cache.Miss should be recognized')
})

test('Description events match telemetry pattern', () => {
    const descriptionEvents = GAME_EVENT_NAMES.filter((name) => name.startsWith('Description.'))
    assert.ok(descriptionEvents.length === 10, `Expected 10 Description events, found ${descriptionEvents.length}`)

    for (const event of descriptionEvents) {
        assert.ok(TELEMETRY_NAME_REGEX.test(event), `${event} should match telemetry pattern`)
    }
})

// DM (Dungeon Master) humor telemetry events tests
test('DM.Humor.QuipShown is registered', () => {
    assert.ok(isGameEventName('DM.Humor.QuipShown'), 'DM.Humor.QuipShown should be recognized')
})

test('DM.Humor.QuipSuppressed is registered', () => {
    assert.ok(isGameEventName('DM.Humor.QuipSuppressed'), 'DM.Humor.QuipSuppressed should be recognized')
})

test('DM.Humor events match telemetry pattern', () => {
    const humorEvents = GAME_EVENT_NAMES.filter((name) => name.startsWith('DM.Humor.'))
    assert.ok(humorEvents.length === 2, `Expected 2 DM.Humor events, found ${humorEvents.length}`)

    for (const event of humorEvents) {
        assert.ok(TELEMETRY_NAME_REGEX.test(event), `${event} should match telemetry pattern`)
    }
})

test('unknown DM.Humor.* variant rejected', () => {
    assert.equal(isGameEventName('DM.Humor.Unknown'), false, 'Unknown DM.Humor.* variant should be rejected')
    assert.equal(isGameEventName('DM.Humor.InvalidEvent'), false, 'Invalid DM.Humor.* variant should be rejected')
})

// Dual persistence telemetry events tests (Issue #525)
// Player lifecycle (SQL authoritative post ADR-004)
test('Player.GetOrCreate is registered', () => {
    assert.ok(isGameEventName('Player.GetOrCreate'), 'Player.GetOrCreate should be recognized')
})
test('Player.LinkExternalId is registered', () => {
    assert.ok(isGameEventName('Player.LinkExternalId'), 'Player.LinkExternalId should be recognized')
})
test('Player.FindByExternalId is registered', () => {
    assert.ok(isGameEventName('Player.FindByExternalId'), 'Player.FindByExternalId should be recognized')
})
test('removed dual persistence events not registered', () => {
    for (const removed of [
        'Player.Migrate.Success',
        'Player.Migrate.Failed',
        'Player.WriteThrough.Success',
        'Player.WriteThrough.Failed',
        'Player.Get.SourceSql',
        'Player.Get.SourceGremlinFallback'
    ]) {
        assert.equal(isGameEventName(removed), false, `${removed} should be removed from GAME_EVENT_NAMES`)
    }
})

// World Event Lifecycle telemetry events tests (Issue #395)
test('World.Event.Emitted is registered', () => {
    assert.ok(isGameEventName('World.Event.Emitted'), 'World.Event.Emitted should be recognized')
})

test('World.Event.Processed is registered', () => {
    assert.ok(isGameEventName('World.Event.Processed'), 'World.Event.Processed should be recognized')
})

test('World.Event.Failed is registered', () => {
    assert.ok(isGameEventName('World.Event.Failed'), 'World.Event.Failed should be recognized')
})

test('World.Event.Retried is registered', () => {
    assert.ok(isGameEventName('World.Event.Retried'), 'World.Event.Retried should be recognized')
})

test('World.Event lifecycle events match telemetry pattern', () => {
    const lifecycleEvents = ['World.Event.Emitted', 'World.Event.Processed', 'World.Event.Failed', 'World.Event.Retried']
    for (const event of lifecycleEvents) {
        assert.ok(TELEMETRY_NAME_REGEX.test(event), `${event} should match telemetry pattern`)
        assert.ok(isGameEventName(event), `${event} should be registered`)
    }
})

test('unknown World.Event.* variant rejected', () => {
    assert.equal(isGameEventName('World.Event.Unknown'), false, 'Unknown World.Event.* variant should be rejected')
    assert.equal(isGameEventName('World.Event.Started'), false, 'Unregistered World.Event.* variant should be rejected')
})
