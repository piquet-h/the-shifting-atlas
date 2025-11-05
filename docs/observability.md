# Observability & Telemetry (Essentials)

Lean specification for game/domain telemetry. Focus: consistent event grammar + minimal dimension set. Historical migration notes & phased expansion tables removed to keep this doc stable and referenceable.

## Goals

1. Consistent, low‑cardinality event names.
2. Dimensions capture outcome & correlation—not narrative prose.
3. Maintain cheap ingestion (free/low tier friendly) while enabling debugging.

## Event Naming Convention (Unified)

No legacy compatibility required; ALL events adopt the same structure immediately.

Pattern: `<Domain>.<Subject?>.<Action>` (segments separated by `.`; each segment in PascalCase)

Rules:

1. Minimum two segments (`Domain.Action`) – add `Subject` only when it materially disambiguates.
2. Use PascalCase for every segment; no lowercase or snake_case.
3. Prefer singular nouns (`Location`, `Player`, `NPC`).
4. Actions are verbs in Past tense for completed facts (`Created`, `Upgraded`, `Moved`) or Present tense for instantaneous queries (`Get`, `List`). Be consistent within a domain.
5. Avoid encoding outcome or status in the name; use dimensions (`status`, `reason`).
6. Do not append "Event" or duplicate context (no `Location.LocationMoved`).
7. Stick to three segments maximum for MVP unless a truly separate facet is needed (e.g., `Economy.Trade.Executed`).

Approved Domains (initial):
| Domain | Scope |
| -------- | ------------------------------------------ |
| Onboarding | Guest GUID issuance & session bootstrap |
| Auth | Account / identity upgrades |
| Location | Location retrieval & traversal |
| Ping | Diagnostic latency / echo |
| NPC | (Future) autonomous character ticks |
| Economy | (Future) trade / currency operations |
| Dialogue | (Future) branching narrative interactions |

Examples (canonical):

-   `Onboarding.GuestGuid.Created`
-   `Onboarding.GuestGuid.Started`
-   `Auth.Player.Upgraded`
-   `Location.Get` (idempotent fetch)
-   `Location.Move` (attempted traversal; success/failure in `status`)
-   `Ping.Invoked`

Reserved Suffixes:

-   `Started`, `Completed` for lifecycle flows.
-   `Get`, `List` for read-only operations.
-   `Created`, `Deleted`, `Updated` for CRUD writes.
-   `Move` (domain-specific action – movement attempt).

Anti-Patterns (DO NOT):

-   `room.get` (wrong casing)
-   `Room.Get.200` (status baked into name)
-   `OnboardingGuestGuidCreated` (no dots)
-   `AuthUpgradeSuccess` (no segmentation, inconsistent verb form)

Decision Matrix:

-   If action mutates: Past tense (`Created`, `Upgraded`).
-   If action queries: Base verb (`Get`, `List`).
-   If action may fail but we always want a single series: Keep one name; differentiate with `status` and optional `reason` dimension.

Event Name Grammar Quick Sheet:

```
<Domain>[.<Subject>].<Action>
Domain: PascalCase noun grouping.
Subject (optional): Specific entity category inside domain.
Action: Verb (Get/List) or Past-tense result (Created/Upgraded/Moved).
```

## Standard Dimensions

| Key               | Purpose                                                   | Example   |
| ----------------- | --------------------------------------------------------- | --------- |
| `service`         | Emitting logical service (`backend-functions`, `swa-api`) | `swa-api` |
| `requestId`       | Correlates to function invocation id                      | `abc123`  |
| `playerGuid`      | Player identity (guest or linked)                         | `9d2f...` |
| `fromLocation`    | Origin location id for movement                           | (UUID)    |
| `toLocation`      | Destination location id                                   | (UUID)    |
| `direction`       | Movement direction keyword                                | `north`   |
| `status`          | Numeric or enum outcome (200, 404, `no-exit`)             | `200`     |
| `persistenceMode` | Storage backend (`memory`, `cosmos`)                      | `memory`  |
| `latencyMs`       | Basic measured duration                                   | `17`      |

Add dimensions sparingly; prefer a single event with multiple dimensions over many granular events that fragment analysis.

## Domain-Specific Attribute Naming Convention

To improve queryability and correlation, domain-specific attributes follow a structured naming pattern: `game.<domain>.<attribute>`. These attributes complement standard dimensions and enable precise filtering by gameplay dimensions.

### Approved Attribute Keys

| Attribute Key                 | Purpose                                      | Example Value                          | Events                                   |
| ----------------------------- | -------------------------------------------- | -------------------------------------- | ---------------------------------------- |
| `game.player.id`              | Player GUID for identity correlation         | `9d2f...`                              | Navigation, Player, Auth events          |
| `game.location.id`            | Location GUID (current or target)            | `a4d1c3f1-...`                         | Location, Navigation events              |
| `game.location.from`          | Origin location ID for movement              | `a4d1c3f1-...`                         | Navigation.Move.Success/Blocked          |
| `game.location.to`            | Destination location ID (when resolved)      | `b5e2d4g2-...`                         | Navigation.Move.Success                  |
| `game.world.exit.direction`   | Movement direction (canonical)               | `north`, `south`, `east`, `west`       | Navigation.Move.Success/Blocked          |
| `game.event.type`             | World event type for event processing        | `player.move`, `npc.action`            | World.Event.Processed/Duplicate          |
| `game.event.actor.kind`       | Actor type (player, npc, system)             | `player`, `npc`, `system`              | World.Event.Processed                    |
| `game.error.code`             | Domain error classification                  | `no-exit`, `from-missing`              | Navigation.Move.Blocked, error events    |

### Attribute Naming Rules

1. **Prefix Pattern**: All game domain attributes use `game.<domain>.<attribute>` namespace.
2. **Lowercase Segments**: Use lowercase with dot separators (not camelCase in key names).
3. **Semantic Clarity**: Attribute name should indicate entity type and role (e.g., `game.location.from` vs `game.location.to`).
4. **Conditional Presence**: Omit attribute if value unavailable (e.g., `game.player.id` omitted when player context missing).
5. **Type Consistency**: GUID attributes contain UUIDs; enums contain lowercase kebab-case values.

### Usage Guidelines

- **Movement Events**: Always include `game.player.id` (if known), `game.location.from`, `game.world.exitDirection`. Add `game.location.to` on success.
- **World Events**: Always include `game.event.type`, `game.event.actorKind`. Add target entity IDs as `game.location.id` or `game.player.id` depending on scope.
- **Error Events**: Include `game.error.code` for domain error classification; use `status` dimension for HTTP codes.
- **Backward Compatibility**: Standard dimension names (`playerGuid`, `fromLocation`, `toLocation`, `direction`) remain present alongside game.* attributes during transition.

### Implementation

Attribute enrichment implemented via centralized helper in `shared/src/telemetryAttributes.ts`. Backend handlers call enrichment helper before emitting events. See acceptance tests in `backend/test/integration/performMove.telemetry.test.ts` and `backend/test/unit/worldEventAttributes.test.ts`.

## Canonical Event Set (Current)

| Event Name                                  | Purpose                                           |
| ------------------------------------------- | ------------------------------------------------- |
| `Ping.Invoked`                              | Health / latency probe                            |
| `Onboarding.GuestGuid.Started`              | Begin guest bootstrap attempt                     |
| `Onboarding.GuestGuid.Created`              | New guest GUID allocated                          |
| `Auth.Player.Upgraded`                      | Guest upgraded / linked identity                  |
| `Location.Get`                              | Location fetch (status dimension for 200/404)     |
| `Location.Move`                             | Movement attempt outcome                          |
| `Command.Executed`                          | Frontend command lifecycle (ad-hoc CLI)           |
| `World.Location.Generated`                  | AI genesis accepted (future)                      |
| `World.Location.Rejected`                   | AI genesis rejected (future)                      |
| `World.Layer.Added`                         | Description / ambience layer persisted (future)   |
| `World.Exit.Created`                        | Exit creation (manual or AI)                      |
| `Prompt.Genesis.Issued`                     | Prompt sent to model (future)                     |
| `Prompt.Genesis.Rejected`                   | Prompt output rejected during validation (future) |
| `Prompt.Genesis.Crystallized`               | Accepted prompt output stored                     |
| `Prompt.Layer.Generated`                    | Non-structural layer generation event             |
| `Prompt.Cost.BudgetThreshold`               | Cost budget threshold crossed                     |
| `Extension.Hook.Invoked`                    | Extension hook invocation                         |
| `Extension.Hook.Veto`                       | Extension prevented operation                     |
| `Extension.Hook.Mutation`                   | Extension mutated draft entity                    |
| `Multiplayer.LayerDelta.Sent`               | Multiplayer layer diff broadcast (future)         |
| `Multiplayer.LocationSnapshot.HashMismatch` | Client/server snapshot divergence                 |
| `Multiplayer.Movement.Latency`              | Movement latency decomposition (future)           |
| `Graph.Query.Executed`                      | Gremlin query success with RU & latency (M2)      |
| `Graph.Query.Failed`                        | Gremlin query failure with error details (M2)     |
| `Telemetry.EventName.Invalid`               | Guard rail emission for invalid names             |

## Emission Guidelines

1. Emit on boundary decisions (success vs error) rather than every internal step.
2. Include `persistenceMode` once repository abstraction exists.
3. Reserve high-cardinality values (raw descriptions, large GUID sets) for logs—not custom events.
4. Use consistent casing; avoid introducing both `fromLocation` and `from_location`.
5. Failures should share the same event name with a differentiating `status` or `reason` dimension.

## Sampling & Quotas

-   Default: no sampling (MVP volume negligible).
-   Introduce probabilistic sampling (e.g., 0.5) only if monthly ingestion nears free tier.
-   NEVER sample security/audit events (future auth-critical events).

## Partition Signals (Reference)

Scaling thresholds live in `adr/ADR-002-graph-partition-strategy.md`. Emit partition health only if a decision boundary nears—do not pre‑emptively stream RU/vertex counts each request.

### Gremlin RU & Latency Tracking (M2 Observability)

Starting in M2, critical Gremlin operations emit `Graph.Query.Executed` and `Graph.Query.Failed` events with RU consumption and latency metrics. This enables pre-migration monitoring of partition pressure (ADR-002 thresholds: >50k vertices OR sustained RU >70% for 3 days OR 429 throttling).

**Instrumented Operations:**

-   `location.upsert.check` / `location.upsert.write` - Location vertex upserts
-   `exit.ensureExit.check` / `exit.ensureExit.create` - Exit edge creation
-   `player.create` - Player vertex creation

**Event Schema:**

```typescript
// Success event
{
  eventName: 'Graph.Query.Executed',
  operationName: 'location.upsert.write',
  latencyMs: 45,
  ruCharge: 5.2,  // Request Units consumed (if available from Cosmos DB)
  resultCount: 1
}

// Failure event
{
  eventName: 'Graph.Query.Failed',
  operationName: 'exit.ensureExit.check',
  latencyMs: 120,
  errorMessage: 'Connection timeout'
}
```

**Query Snippet (Application Insights Analytics):**

```kusto
customEvents
| where name in ('Graph.Query.Executed', 'Graph.Query.Failed')
| extend operationName = tostring(customDimensions.operationName),
         latencyMs = todouble(customDimensions.latencyMs),
         ruCharge = todouble(customDimensions.ruCharge)
| summarize
    totalOps = count(),
    failures = countif(name == 'Graph.Query.Failed'),
    avgLatency = avg(latencyMs),
    p95Latency = percentile(latencyMs, 95),
    totalRU = sum(ruCharge),
    avgRU = avg(ruCharge)
  by operationName, bin(timestamp, 1h)
| order by timestamp desc
```

**Alert Thresholds (ADR-002):**

-   RU consumption sustained >70% of provisioned throughput for 3 consecutive days
-   Repeated 429 (throttled) responses at <50 RPS
-   P95 latency >500ms for critical operations

## Current Event Mapping (Old → New)

| Old                           | New                            | Notes                                  |
| ----------------------------- | ------------------------------ | -------------------------------------- |
| `Onboarding.GuestGuidCreated` | `Onboarding.GuestGuid.Created` | Adds Subject segment for clarity       |
| `Onboarding.Start`            | `Onboarding.GuestGuid.Started` | Clarifies what started                 |
| `Auth.UpgradeSuccess`         | `Auth.Player.Upgraded`         | Standard Past-tense verb; adds Subject |
| `ping.invoked`                | `Ping.Invoked`                 | Casing + Domain normalization          |
| `room.get`                    | `Location.Get`                 | Terminology + casing normalized        |
| `room.move`                   | `Location.Move`                | Terminology + casing normalized        |

All old names are to be replaced in a single refactor (no dual emission mandated).

## Deferred Events

Future domains (NPC, Economy, Dialogue, Multiplayer layers) are placeholders; add only when code ships. Avoid speculative enumeration—keeps dashboards noise‑free.

## Enforcement

Static source of truth: `shared/src/telemetryEvents.ts`. Any addition requires:

1. Justification in PR description (why needed, why existing name insufficient).
2. Update to this doc (Event Set table) if not obviously derivative.
3. Passing lint rule (planned regex check: `^[A-Z][A-Za-z]+(\.[A-Z][A-Za-z]+){1,2}$`).

## Dashboards (Starter Ideas)

1. Movement success ratio (`Location.Move` grouped by `status`).
2. Guest onboarding funnel (`Onboarding.GuestGuid.Started` → `Onboarding.GuestGuid.Created`).
3. Command latency percentile (custom metric or derived from traces) – add only if latency becomes an issue.

## Operational Dashboards (Consolidated Pattern)

To avoid proliferation of narrowly scoped workbooks, operational analytics adopt a **consolidated-per-domain** model:

### Principles

| Principle            | Description                                                                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Single Pane          | Combine closely related KPIs (rate, reasons, trends, summary) in one workbook file.                                                                 |
| Deterministic Naming | Bicep resource name uses `guid('<slug>', name)` for idempotent deployments.                                                                         |
| Stable Paths         | All workbook JSON artifacts reside under `docs/observability/workbooks/` with slug pattern `<domain>-<focus>-dashboard.workbook.json`.              |
| Additive Panels      | New metrics extend existing domain dashboard instead of creating a new workbook, unless a distinct audience or retention policy demands separation. |
| Issue Linking        | Dashboard issues reference the consolidated slug rather than creating parallel artifacts.                                                           |

### Movement Navigation Dashboard

Replaces prior separate movement success rate (#281) and blocked reasons (#282) workbook files with a unified artifact:

-   File: `infrastructure/workbooks/movement-navigation-dashboard.workbook.json` (moved from `docs/observability/workbooks/` to colocate infra-managed JSON)
-   Infra: `infrastructure/workbook-movement-navigation-dashboard.bicep`
-   Panels included: success rate tiles & summary, blocked reasons table, blocked rate trend (7d), summary statistics, interpretation guide.
-   Future additions (latency distribution, percentile overlays) should modify this file (see issue #283) rather than produce a new workbook.

### Adding New Panels

When implementing dashboard issues (e.g. partition pressure trend #291, RU vs latency correlation #290, operation RU/latency overview #289, success/failure RU cost table #296):

1. Determine if panel fits an existing consolidated workbook (Movement, Performance, Cost).
2. If yes, extend the JSON and reference the existing slug in the issue resolution.
3. If genuinely distinct (different consumer, retention, or security scope), create a new slug with justification in PR description.

### Deprecated Individual Workbooks

Legacy movement workbook files (`movement-success-rate.workbook.json`, `movement-blocked-reasons.workbook.json`) and their Bicep deployments have been removed in favor of consolidation. Historical references in closed issues remain for audit.

### Implementation Checklist (Dashboard Panel Addition)

```
Given an open dashboard issue
When implementing the panel
Then update existing consolidated workbook JSON (no new file unless justified)
And ensure deterministic guid() naming retained in Bicep
And include brief panel documentation (query purpose, thresholds) in issue comment
```

### Movement Event Naming Alignment

The consolidated dashboard panels assume movement outcome events `Navigation.Move.Success` and `Navigation.Move.Blocked` (replacing the coarse `Location.Move`). Update queries accordingly when migrating panels.

## Open Questions

Tracked externally in issues; keep this section empty or remove if stale.

_Last updated: 2025-10-19 (condensed; removed historical migration & roadmap sections)_

---

## AI Telemetry Pointer (Stage M3+)

AI / MCP specific event emissions and required dimensions are defined in `architecture/agentic-ai-and-mcp.md` (section: _AI Telemetry Implementation_). Do **not** invent ad-hoc AI event names outside the canonical enumeration in `shared/src/telemetryEvents.ts`; propose additions via PR updating that file + this doc if classification changes are needed.

Canonical enumeration source of truth:

-   `shared/src/telemetryEvents.ts` – `GAME_EVENT_NAMES`

Planned lint rule: enforce membership & regex validation for any string literal passed to telemetry helpers.

## Consolidated Telemetry Mode (Application Insights Only)

OpenTelemetry span tracing has been removed (issue #311). The system now relies solely on Application Insights automatic collection plus custom events. No span exporter or traceparent continuation is active.

### Correlation Strategy

-   `correlationId`: Always emitted (UUID generated if not supplied). Present in every custom event.
-   `operationId`: Emitted when Application Insights request context has been initialized (may be absent in early init or certain async flows). Queries should guard with `isnotempty(customDimensions.operationId)`.

Example Kusto pattern to join events with requests:

```kusto
let recentRequests = requests
  | where timestamp > ago(1h)
  | project operation_Id, requestName = name, duration=duration, resultCode;
customEvents
| where timestamp > ago(1h)
| where name in ('Location.Move','Location.Get','World.Event.Processed')
| project operationId = tostring(customDimensions.operationId), correlationId = tostring(customDimensions.correlationId), name, latencyMs=todouble(customDimensions.latencyMs)
| join kind=leftouter recentRequests on $left.operationId == $right.operation_Id
| order by timestamp desc
```

### Internal Timing Events

`Timing.Op` is an internal helper event emitted by the timing utility (Issue #353) for ad-hoc latency measurement without spans. It is deliberately not enumerated in the shared `GAME_EVENT_NAMES` list to keep domain event space clean. Properties:

| Key          | Description                      |
| ------------ | -------------------------------- |
| `opName`     | Operation label (developer set)  |
| `durationMs` | Elapsed time in milliseconds     |
| (extras…)    | Any supplemental diagnostic keys |

Usage guidance:

-   Prefer using existing domain events’ `latencyMs` dimension when measuring request/command duration.
-   Use `Timing.Op` for one-off internal instrumentation unlikely to persist long-term; migrate to a domain event if it becomes permanent.
-   Avoid high-cardinality `opName` values (do not embed dynamic IDs).

### Sampling Configuration

Sampling percentage is set during startup from environment variables (`APPINSIGHTS_SAMPLING_PERCENTAGE`, `APPINSIGHTS_SAMPLING_PERCENT`, `APP_INSIGHTS_SAMPLING_PERCENT`, `APP_INSIGHTS_SAMPLING_RATIO`). Ratio values (<=1) are converted to percentages. Default: 15% (subject to adjustment after initial production data review).

Verification query:

```kusto
customEvents
| where timestamp > ago(24h)
| summarize events=count() by bin(timestamp, 5m)
```

Compare sustained volume to expected request count to validate sampling effect.

### Do / Do Not

| Do                                                               | Reason                                         |
| ---------------------------------------------------------------- | ---------------------------------------------- |
| Use `correlationId` for cross-event linkage                      | Uniform across all custom events               |
| Check `operationId` presence before joining                      | Not guaranteed in early init or non-HTTP flows |
| Keep `Timing.Op` usage sparing                                   | Prevent enumeration pollution                  |
| Document new persistent performance metrics before adding events | Maintains low-cardinality taxonomy             |
| Remove deprecated span code promptly                             | Reduces confusion and dead paths               |

| Do Not                                                                      | Reason                                        |
| --------------------------------------------------------------------------- | --------------------------------------------- |
| Reintroduce OTel exporter ad-hoc                                            | Requires formal ADR & milestone alignment     |
| Add span-style attributes to events (e.g. `messaging.system`) unless needed | Avoid semantic leakage from old tracing layer |
| Enumerate `Timing.Op` prematurely                                           | Internal helper, not domain event             |
