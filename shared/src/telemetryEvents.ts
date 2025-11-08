// Canonical game telemetry event names (Domain.[Subject].Action) with 2-3 PascalCase segments.
// These align documentation across navigation, AI prompt engineering, extensions, and multiplayer modules.
//
// CRITICAL: This file is for GAME DOMAIN events ONLY (player actions, world events, gameplay).
// DO NOT add build/CI automation events here - those belong in scripts/shared/build-telemetry.mjs.
// See docs/developer-workflow/build-telemetry.md for separation rules.
//
// NO INLINE LITERALS: All event names must be referenced from this registry.
// To verify no inline usage outside registry:
// grep -r "AI\.Cost\." --include="*.ts" --exclude-dir=node_modules --exclude-dir=dist | \
//   grep -v "shared/src/telemetryEvents.ts" | grep -v "\.test\.ts"
// (Adjust pattern for other event domains as needed)

export const GAME_EVENT_NAMES = [
    // Core service / utility
    'Ping.Invoked',
    'Health.Gremlin.Check',
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
    // Deprecated (2025-10-30): Location.Move → replaced by Navigation.Move.Success / Navigation.Move.Blocked.
    // Retained until historical retention window (180d) expires; do not emit new events.
    'Location.Move',
    // Navigation & direction normalization
    'Navigation.Input.Parsed',
    'Navigation.Input.Ambiguous',
    // Movement outcome events (added M2 Observability)
    'Navigation.Move.Success',
    'Navigation.Move.Blocked',
    'Navigation.Look.Issued',
    // Command layer (frontend CLI / parser)
    'Command.Executed',
    // UI interaction telemetry (M2 Observability - frontend correlation)
    'UI.Move.Command', // Movement command dispatched from frontend
    'UI.Location.Look', // Location look request from frontend
    'World.Location.Generated',
    'World.Location.Rejected',
    'World.Location.Upsert',
    'World.Layer.Added',
    'World.Exit.Created',
    'World.Exit.Removed',
    'World.Event.Processed',
    'World.Event.Duplicate',
    'World.Event.DeadLettered',
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
    // Persistence / infrastructure
    'Persistence.Mode.StrictFail',
    // Graph operations (Gremlin RU & latency tracking for ADR-002 partition thresholds)
    'Graph.Query.Executed',
    'Graph.Query.Failed',
    // Security
    'Security.RateLimit.Exceeded',
    'Security.Validation.Failed',
    // AI Cost Tracking (M2 Observability)
    // Track AI operation cost estimation, windowed summaries, and threshold events
    // Key dimensions: model, operation type, token counts, USD estimate, timestamp
    'AI.Cost.Estimated', // Pre-execution cost estimate for AI calls (prompt + completion tokens)
    'AI.Cost.WindowSummary', // Hourly or windowed cost aggregation (total spend, operation count)
    'AI.Cost.OverrideRejected', // Cost limit override attempt rejected by policy
    'AI.Cost.InputAdjusted', // Input size adjusted to fit within cost constraints
    'AI.Cost.InputCapped', // Input capped at maximum token limit
    'AI.Cost.SoftThresholdCrossed', // Soft budget threshold warning (does not block operation)
    // Internal / fallback diagnostics
    'Telemetry.EventName.Invalid',
    'Telemetry.Sampling.ConfigAdjusted', // Sampling configuration adjusted (clamping or fallback)
    // Timing telemetry (M2 Observability - Issue #353)
    'Timing.Op', // Ad-hoc operation timing measurement (op, ms, category?, error?)
    // Description layer telemetry (M4 Layering & Enrichment)
    'Description.Generate.Start', // Description generation initiated
    'Description.Generate.Success', // Description generated successfully
    'Description.Generate.Failure', // Description generation failed
    'Description.Cache.Hit', // Description retrieved from cache
    'Description.Cache.Miss', // Description not in cache, will generate
    // Description integrity telemetry (M5 Systems - Issue #153)
    'Description.Integrity.JobStart', // Integrity hash job started
    'Description.Integrity.JobComplete', // Integrity hash job completed
    'Description.Integrity.Computed', // Hash computed for a description
    'Description.Integrity.Unchanged', // Description unchanged, hash skipped
    'Description.Integrity.Mismatch', // Hash mismatch detected (potential corruption)
    // Operation latency monitoring telemetry (M2 Observability - Issue #10)
    'Monitoring.OperationLatency.Alert', // P95 latency exceeded threshold for consecutive windows
    'Monitoring.OperationLatency.Resolved', // P95 latency returned to healthy levels
    'Monitoring.OperationLatency.InsufficientData', // Window had insufficient sample size (<20 calls)
    'Monitoring.OperationLatency.Error', // Error during monitoring execution
    'Monitoring.OperationLatency.Complete' // Monitoring cycle completed (success or failure)
] as const

// Future deprecations or renames should follow the pattern above:
// - Add comment with date and reason: "Deprecated (YYYY-MM-DD): OldName → NewName. Reason."
// - Keep old event in array until retention window expires (180d standard)
// - Document in observability docs when adding replacement

export type GameEventName = (typeof GAME_EVENT_NAMES)[number]

export function isGameEventName(name: string): name is GameEventName {
    return (GAME_EVENT_NAMES as readonly string[]).includes(name)
}

// Regex used by ESLint rule (duplicated here for tests)
export const TELEMETRY_NAME_REGEX = /^[A-Z][A-Za-z]+(\.[A-Z][A-Za-z]+){1,2}$/
