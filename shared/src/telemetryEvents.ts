// Canonical telemetry event names (Domain.[Subject].Action) with 2-3 PascalCase segments.
// These align documentation across navigation, AI prompt engineering, extensions, and multiplayer modules.

export const GAME_EVENT_NAMES = [
    // Core service / utility
    'Ping.Invoked',
    // Onboarding & Auth
    'Onboarding.GuestGuid.Started',
    'Onboarding.GuestGuid.Created',
    'Auth.Player.Upgraded',
    // Player lifecycle
    'Player.Get',
    'Player.Created',
    // Player traversal + location access (non-genesis)
    'Location.Get',
    'Location.Move',
    // Command layer (frontend CLI / parser)
    'Command.Executed',
    'World.Location.Generated',
    'World.Location.Rejected',
    'World.Location.Upsert',
    'World.Layer.Added',
    'World.Exit.Created',
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
    // Internal / fallback diagnostics
    'Telemetry.EventName.Invalid'
] as const

export type GameEventName = (typeof GAME_EVENT_NAMES)[number]

export function isGameEventName(name: string): name is GameEventName {
    return (GAME_EVENT_NAMES as readonly string[]).includes(name)
}

// Regex used by ESLint rule (duplicated here for tests)
export const TELEMETRY_NAME_REGEX = /^[A-Z][A-Za-z]+(\.[A-Z][A-Za-z]+){1,2}$/
