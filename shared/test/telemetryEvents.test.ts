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
    assert.ok(descriptionEvents.length === 14, `Expected 14 Description events, found ${descriptionEvents.length}`)

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

// Navigation telemetry events tests (Issue #594)
test('Navigation.Exit.GenerationRequested is registered', () => {
    assert.ok(isGameEventName('Navigation.Exit.GenerationRequested'), 'Navigation.Exit.GenerationRequested should be recognized')
})

test('Navigation.SoftDenial.Displayed is registered', () => {
    assert.ok(isGameEventName('Navigation.SoftDenial.Displayed'), 'Navigation.SoftDenial.Displayed should be recognized')
})

test('Navigation.SoftDenial.Retry is registered', () => {
    assert.ok(isGameEventName('Navigation.SoftDenial.Retry'), 'Navigation.SoftDenial.Retry should be recognized')
})

test('Navigation.SoftDenial.Explored is registered', () => {
    assert.ok(isGameEventName('Navigation.SoftDenial.Explored'), 'Navigation.SoftDenial.Explored should be recognized')
})

test('Navigation.SoftDenial.Quit is registered', () => {
    assert.ok(isGameEventName('Navigation.SoftDenial.Quit'), 'Navigation.SoftDenial.Quit should be recognized')
})

test('Navigation.SoftDenial events match telemetry pattern', () => {
    const softDenialEvents = GAME_EVENT_NAMES.filter((name) => name.startsWith('Navigation.SoftDenial.'))
    assert.ok(softDenialEvents.length === 4, `Expected 4 Navigation.SoftDenial events, found ${softDenialEvents.length}`)

    for (const event of softDenialEvents) {
        assert.ok(TELEMETRY_NAME_REGEX.test(event), `${event} should match telemetry pattern`)
    }
})

test('unknown Navigation.SoftDenial.* variant rejected', () => {
    assert.equal(isGameEventName('Navigation.SoftDenial.Unknown'), false, 'Unknown Navigation.SoftDenial.* variant should be rejected')
    assert.equal(
        isGameEventName('Navigation.SoftDenial.Cancelled'),
        false,
        'Unregistered Navigation.SoftDenial.* variant should be rejected'
    )
})

// Arrival pause telemetry events tests (Issue #809 - Immersive arrival pause)
test('Navigation.ArrivalPause.Shown is registered', () => {
    assert.ok(isGameEventName('Navigation.ArrivalPause.Shown'), 'Navigation.ArrivalPause.Shown should be recognized')
})

test('Navigation.ArrivalPause.AutoRefresh is registered', () => {
    assert.ok(isGameEventName('Navigation.ArrivalPause.AutoRefresh'), 'Navigation.ArrivalPause.AutoRefresh should be recognized')
})

test('Navigation.ArrivalPause.Ready is registered', () => {
    assert.ok(isGameEventName('Navigation.ArrivalPause.Ready'), 'Navigation.ArrivalPause.Ready should be recognized')
})

test('Navigation.ArrivalPause.Exhausted is registered', () => {
    assert.ok(isGameEventName('Navigation.ArrivalPause.Exhausted'), 'Navigation.ArrivalPause.Exhausted should be recognized')
})

test('Navigation.ArrivalPause events match telemetry pattern', () => {
    const arrivalPauseEvents = GAME_EVENT_NAMES.filter((name) => name.startsWith('Navigation.ArrivalPause.'))
    assert.ok(arrivalPauseEvents.length === 4, `Expected 4 Navigation.ArrivalPause events, found ${arrivalPauseEvents.length}`)

    for (const event of arrivalPauseEvents) {
        assert.ok(TELEMETRY_NAME_REGEX.test(event), `${event} should match telemetry pattern`)
    }
})

test('unknown Navigation.ArrivalPause.* variant rejected', () => {
    assert.equal(isGameEventName('Navigation.ArrivalPause.Unknown'), false, 'Unknown Navigation.ArrivalPause.* variant should be rejected')
    assert.equal(isGameEventName('Navigation.ArrivalPause.Retry'), false, 'Manual-retry event not registered for arrival pause')
})

// Temporal telemetry events tests (M3c Temporal PI-0 - Issue #506)
test('World.Clock.Advanced is registered', () => {
    assert.ok(isGameEventName('World.Clock.Advanced'), 'World.Clock.Advanced should be recognized')
})

test('World.Clock.Queried is registered', () => {
    assert.ok(isGameEventName('World.Clock.Queried'), 'World.Clock.Queried should be recognized')
})

test('Player.Clock.Advanced is registered', () => {
    assert.ok(isGameEventName('Player.Clock.Advanced'), 'Player.Clock.Advanced should be recognized')
})

test('Player.Clock.DriftApplied is registered', () => {
    assert.ok(isGameEventName('Player.Clock.DriftApplied'), 'Player.Clock.DriftApplied should be recognized')
})

test('Player.Clock.Reconciled is registered', () => {
    assert.ok(isGameEventName('Player.Clock.Reconciled'), 'Player.Clock.Reconciled should be recognized')
})

test('Temporal.Narrative.Generated is registered', () => {
    assert.ok(isGameEventName('Temporal.Narrative.Generated'), 'Temporal.Narrative.Generated should be recognized')
})

test('World.Clock events match telemetry pattern', () => {
    const worldClockEvents = GAME_EVENT_NAMES.filter((name) => name.startsWith('World.Clock.'))
    assert.ok(worldClockEvents.length === 2, `Expected 2 World.Clock events, found ${worldClockEvents.length}`)

    for (const event of worldClockEvents) {
        assert.ok(TELEMETRY_NAME_REGEX.test(event), `${event} should match telemetry pattern`)
    }
})

test('Player.Clock events match telemetry pattern', () => {
    const playerClockEvents = GAME_EVENT_NAMES.filter((name) => name.startsWith('Player.Clock.'))
    assert.ok(playerClockEvents.length === 3, `Expected 3 Player.Clock events, found ${playerClockEvents.length}`)

    for (const event of playerClockEvents) {
        assert.ok(TELEMETRY_NAME_REGEX.test(event), `${event} should match telemetry pattern`)
    }
})

test('Temporal.Narrative events match telemetry pattern', () => {
    const temporalNarrativeEvents = GAME_EVENT_NAMES.filter((name) => name.startsWith('Temporal.Narrative.'))
    assert.ok(temporalNarrativeEvents.length === 1, `Expected 1 Temporal.Narrative event, found ${temporalNarrativeEvents.length}`)

    for (const event of temporalNarrativeEvents) {
        assert.ok(TELEMETRY_NAME_REGEX.test(event), `${event} should match telemetry pattern`)
    }
})

test('unknown World.Clock.* variant rejected', () => {
    assert.equal(isGameEventName('World.Clock.Unknown'), false, 'Unknown World.Clock.* variant should be rejected')
    assert.equal(isGameEventName('World.Clock.Rewound'), false, 'Unregistered World.Clock.* variant should be rejected')
})

test('unknown Player.Clock.* variant rejected', () => {
    assert.equal(isGameEventName('Player.Clock.Unknown'), false, 'Unknown Player.Clock.* variant should be rejected')
    assert.equal(isGameEventName('Player.Clock.Stopped'), false, 'Unregistered Player.Clock.* variant should be rejected')
})

test('unknown Temporal.Narrative.* variant rejected', () => {
    assert.equal(isGameEventName('Temporal.Narrative.Unknown'), false, 'Unknown Temporal.Narrative.* variant should be rejected')
    assert.equal(isGameEventName('Temporal.Narrative.Failed'), false, 'Unregistered Temporal.Narrative.* variant should be rejected')
})

// MCP (Model Context Protocol) telemetry events tests
test('MCP.Tool.Invoked is registered', () => {
    assert.ok(isGameEventName('MCP.Tool.Invoked'), 'MCP.Tool.Invoked should be recognized')
})

test('MCP.Auth.Allowed is registered', () => {
    assert.ok(isGameEventName('MCP.Auth.Allowed'), 'MCP.Auth.Allowed should be recognized')
})

test('MCP.Auth.Denied is registered', () => {
    assert.ok(isGameEventName('MCP.Auth.Denied'), 'MCP.Auth.Denied should be recognized')
})

test('MCP.Throttled is registered', () => {
    assert.ok(isGameEventName('MCP.Throttled'), 'MCP.Throttled should be recognized')
})

test('MCP.Failed is registered', () => {
    assert.ok(isGameEventName('MCP.Failed'), 'MCP.Failed should be recognized')
})

test('MCP events match telemetry pattern', () => {
    const mcpEvents = GAME_EVENT_NAMES.filter((name) => name.startsWith('MCP.'))
    assert.ok(mcpEvents.length === 5, `Expected 5 MCP events, found ${mcpEvents.length}`)

    for (const event of mcpEvents) {
        assert.ok(TELEMETRY_NAME_REGEX.test(event), `${event} should match telemetry pattern`)
    }
})

test('unknown MCP.* variant rejected', () => {
    assert.equal(isGameEventName('MCP.Unknown'), false, 'Unknown MCP.* variant should be rejected')
    assert.equal(isGameEventName('MCP.Tool.Unknown'), false, 'Unregistered MCP.Tool.* variant should be rejected')
    assert.equal(isGameEventName('MCP.Started'), false, 'Unregistered MCP.* variant should be rejected')
})
