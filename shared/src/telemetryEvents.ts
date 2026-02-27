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
    // Player lifecycle (post ADR-004: SQL authoritative; dual persistence events removed)
    'Player.Get',
    'Player.GetOrCreate',
    'Player.LinkExternalId',
    'Player.FindByExternalId',
    'Player.Created',
    'Player.Update',
    // PlayerDoc operations (SQL API projection)
    'PlayerDoc.Read', // PlayerDoc read operation from SQL API
    'PlayerDoc.Upsert', // PlayerDoc upsert operation to SQL API
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
    // Exit generation fallback (Issue #35 - N4)
    'Navigation.Exit.GenerationRequested',
    // Soft-denial UX telemetry (Issue #595 - Frontend response to generate status)
    'Navigation.SoftDenial.Displayed',
    'Navigation.SoftDenial.Retry',
    'Navigation.SoftDenial.Explored',
    'Navigation.SoftDenial.Quit',
    // Arrival pause UX telemetry (Issue #809 - Immersive arrival pause for pending paths)
    'Navigation.ArrivalPause.Shown', // Pause overlay displayed on ExitGenerationRequested
    'Navigation.ArrivalPause.AutoRefresh', // Auto-refresh attempt scheduled
    'Navigation.ArrivalPause.Ready', // Pending exit became hard; auto-navigating
    'Navigation.ArrivalPause.Exhausted', // Max refresh attempts reached; falling back
    // Command layer (frontend CLI / parser)
    'Command.Executed',
    // UI interaction telemetry (M2 Observability - frontend correlation)
    'UI.Move.Command', // Movement command dispatched from frontend
    'UI.Location.Look', // Location look request from frontend
    'UI.Error', // Unhandled frontend error (exception or promise rejection)
    // Player action telemetry (frontend-originated, Issue #444 - Frontend Telemetry Integration)
    'Player.Navigate', // Player navigation action dispatched from frontend
    'Player.Command', // Player command input from frontend
    // Session lifecycle telemetry (frontend session tracking)
    'Session.Start', // Frontend session started (page load or reconnect)
    'Session.End', // Frontend session ended (page unload or disconnect)
    'World.Location.Generated',
    'World.Location.Rejected',
    'World.Location.Upsert',
    'World.Layer.Added',
    'World.Exit.Created',
    'World.Exit.Removed',
    // Batch generation telemetry (Issue #759 - BatchGenerateHandler foundation)
    'World.BatchGeneration.Started', // Batch generation initiated - properties: { rootLocationId, batchSize, terrain, correlationId }
    'World.BatchGeneration.Completed', // Batch generation completed - properties: { rootLocationId, correlationId }
    'World.BatchGeneration.Failed', // Batch generation failed - properties: { rootLocationId, reason, correlationId }
    'World.BatchGeneration.Prefetch', // Prefetch triggered on arrival - properties: { rootLocationId, pendingExitCount, correlationId }
    'World.BatchPrefetch.Failed', // Prefetch failed (non-blocking) - properties: { rootLocationId, error, correlationId }
    'World.BatchGeneration.Debounced', // Prefetch debounced (already enqueued recently) - properties: { rootLocationId, correlationId }
    // Area generation telemetry (operator-triggered area generation via AreaGenerationOrchestrator)
    'World.AreaGeneration.Started', // Area generation initiated - properties: { anchorLocationId, mode, budgetLocations, idempotencyKey, correlationId }
    'World.AreaGeneration.Completed', // Area generation completed - properties: { anchorLocationId, mode, batchSize, terrain, clamped, idempotencyKey, correlationId, durationMs }
    'World.AreaGeneration.Failed', // Area generation failed - properties: { anchorLocationId, mode, reason, idempotencyKey, correlationId, durationMs }
    // Reconnection telemetry (exit reconnection outcomes within a realm)
    'World.Reconnection.Started', // Reconnection pass initiated - properties: { realmKey }
    'World.Reconnection.Completed', // Reconnection pass completed - properties: { realmKey, reconnectedCount, durationMs }
    'World.Reconnection.Failed', // Reconnection pass failed - properties: { realmKey, reason, durationMs }
    // Exit availability metadata integrity (Issue #849 - exitAvailability Cosmos persistence)
    'World.ExitAvailability.Malformed', // exitAvailability JSON property malformed on read - properties: { locationId, property }
    'World.ExitAvailability.HardConflict', // Hard exit edge and pending/forbidden entry for same direction - properties: { locationId, conflictDirections }
    // Realm hierarchy and relationship telemetry
    'World.Realm.Upsert',
    'World.Realm.EdgeCreated',
    // World Event Lifecycle Telemetry (Issue #395 - World Event Telemetry Constants)
    'World.Event.Emitted',
    'World.Event.QueuePublish', // Queue message published to Service Bus with correlationId
    'World.Event.Processed',
    'World.Event.Failed',
    'World.Event.Retried',
    'World.Event.Duplicate',
    'World.Event.DeadLettered',
    'World.Event.RegistryCheckFailed',
    'World.Event.RegistryWriteFailed',
    // Handler invocation (Issue #258 - type-specific payload handlers)
    'World.Event.HandlerInvoked',
    'Prompt.Genesis.Issued',
    'Prompt.Genesis.Rejected',
    'Prompt.Genesis.Crystallized',
    'Prompt.Layer.Generated',
    'Prompt.Cost.BudgetThreshold',
    // Prompt template registry (M4a AI Infrastructure - Issue #626)
    'PromptTemplate.Get', // Prompt template retrieved by id/version/hash - properties: { templateId, version, hash, status, cached? }
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
    // Feature flag configuration (startup validation and state logging)
    'FeatureFlag.Loaded', // Feature flag state loaded at startup (includes all flag values)
    'FeatureFlag.ValidationWarning', // Invalid flag value detected, using default
    // Graph operations (Gremlin RU & latency tracking for ADR-002 partition thresholds)
    'Graph.Query.Executed',
    'Graph.Query.Failed',
    // SQL API operations (Cosmos SQL API RU & latency tracking for dual persistence)
    'SQL.Query.Executed',
    'SQL.Query.Failed',
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
    // Hero prose telemetry (Issue #738 - Hero Prose Telemetry)
    'Description.Hero.CacheHit', // Hero prose retrieved from cache - properties: { locationId, latencyMs }
    'Description.Hero.CacheMiss', // Hero prose not in cache - properties: { locationId, latencyMs }
    'Description.Hero.GenerateSuccess', // Hero prose generated successfully - properties: { locationId, latencyMs, model, tokenUsage }
    'Description.Hero.GenerateFailure', // Hero prose generation failed - properties: { locationId, latencyMs, outcomeReason, model? }
    // Description integrity telemetry (M5 Systems - Issue #153)
    'Description.Integrity.JobStart', // Integrity hash job started
    'Description.Integrity.JobComplete', // Integrity hash job completed
    'Description.Integrity.Computed', // Hash computed for a description
    'Description.Integrity.Unchanged', // Description unchanged, hash skipped
    'Description.Integrity.Mismatch', // Hash mismatch detected (potential corruption)
    // DM (Dungeon Master) humor telemetry (M5 Quality & Depth - Issue #393)
    'DM.Humor.QuipShown', // Quip shown to player (includes quipId, actionType, probabilityUsed)
    'DM.Humor.QuipSuppressed', // Quip suppressed (includes suppressionReason: serious|exhausted|probability)
    // Temporal telemetry (M3c Temporal PI-0 - Issue #506)
    // World Clock events - properties: { durationMs, newTick, reason }
    'World.Clock.Advanced', // World clock advanced by duration
    'World.Clock.Queried', // World clock queried
    // Player Clock events
    'Player.Clock.Advanced', // Player clock advanced by action - properties: { playerId, actionType, durationMs, newTick }
    'Player.Clock.DriftApplied', // Idle drift applied to player clock - properties: { playerId, realTimeElapsedMs, driftMs, newTick }
    'Player.Clock.Reconciled', // Player clock reconciled to location anchor - properties: { playerId, locationId, method, offsetMs, narrativeGenerated }
    // Temporal narrative generation
    'Temporal.Narrative.Generated', // Temporal narrative generated for wait/compress - properties: { durationMs, bucket, templateUsed }
    // MCP (Model Context Protocol) telemetry (M4 AI Read - Issue #428)
    'MCP.Tool.Invoked', // MCP tool invocation (read-only) - properties: { toolName, clientAppId, clientSubscriptionId, latencyMs }
    'MCP.Auth.Allowed', // MCP auth decision: allowed - properties: { toolName, clientAppId, clientSubscriptionId }
    'MCP.Auth.Denied', // MCP auth decision: denied - properties: { toolName, clientAppId, clientSubscriptionId, reason }
    'MCP.Throttled', // MCP request throttled/rate-limited - properties: { toolName, clientAppId, throttleReason, retryAfterMs }
    'MCP.Failed', // MCP unexpected failure - properties: { toolName, clientAppId, failureReason, errorCode }
    // World map graph telemetry (WorldMap UI)
    'World.Map.Fetched' // World graph fetched for map view - properties: { nodeCount, edgeCount, latencyMs }
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
