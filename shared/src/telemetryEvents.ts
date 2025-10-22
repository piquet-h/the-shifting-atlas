// Canonical game telemetry event names (Domain.[Subject].Action) with 2-3 PascalCase segments.
// These align documentation across navigation, AI prompt engineering, extensions, and multiplayer modules.
//
// CRITICAL: This file is for GAME DOMAIN events ONLY (player actions, world events, gameplay).
// DO NOT add build/CI automation events here - those belong in scripts/shared/build-telemetry.mjs.
// See docs/developer-workflow/build-telemetry.md for separation rules.

export const GAME_EVENT_NAMES = [
    // Core service / utility
    'Ping.Invoked',
    // Onboarding & Auth
    'Onboarding.GuestGuid.Started',
    'Onboarding.GuestGuid.Created',
    'Onboarding.GuestGuid.Completed',
    'Auth.Player.Upgraded',
    // Player lifecycle
    'Player.Get',
    'Player.Created',
    // Player traversal + location access (non-genesis)
    'Location.Get',
    'Location.Move',
    // Navigation & direction normalization
    'Navigation.Input.Parsed',
    'Navigation.Input.Ambiguous',
    'Navigation.Look.Issued',
    // Command layer (frontend CLI / parser)
    'Command.Executed',
    'World.Location.Generated',
    'World.Location.Rejected',
    'World.Location.Upsert',
    'World.Layer.Added',
    'World.Exit.Created',
    'World.Exit.Removed',
    'World.Event.Processed',
    'World.Event.Duplicate',
    'Prompt.Genesis.Issued',
    'Prompt.Genesis.Rejected',
    'Prompt.Genesis.Crystallized',
    'Prompt.Layer.Generated',
    'Prompt.Cost.BudgetThreshold',
    'Extension.Hook.Invoked',
    'Extension.Hook.Veto',
    'Extension.Hook.Mutation',
    'Multiplayer.LayerDelta.Sent',
    'Multiplayer.LocationSnapshot.HashMismatch',
    'Multiplayer.Movement.Latency',
    // Secrets / infrastructure (still game domain telemetry, not build telemetry)
    'Secret.Fetch.Retry',
    'Secret.Cache.Hit',
    'Secret.Cache.Miss',
    'Secret.Fetch.Success',
    'Secret.Fetch.Failure',
    'Secret.Fetch.Fallback',
    'Secret.Cache.Clear',
    // Internal / fallback diagnostics
    'Telemetry.EventName.Invalid'
] as const

export type GameEventName = (typeof GAME_EVENT_NAMES)[number]

export function isGameEventName(name: string): name is GameEventName {
    return (GAME_EVENT_NAMES as readonly string[]).includes(name)
}

// Regex used by ESLint rule (duplicated here for tests)
export const TELEMETRY_NAME_REGEX = /^[A-Z][A-Za-z]+(\.[A-Z][A-Za-z]+){1,2}$/
