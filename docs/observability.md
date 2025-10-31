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

## Open Questions

Tracked externally in issues; keep this section empty or remove if stale.

_Last updated: 2025-10-19 (condensed; removed historical migration & roadmap sections)_

---

## AI Telemetry Pointer (Stage M3+)

AI / MCP specific event emissions and required dimensions are defined in `architecture/agentic-ai-and-mcp.md` (section: _AI Telemetry Implementation_). Do **not** invent ad-hoc AI event names outside the canonical enumeration in `shared/src/telemetryEvents.ts`; propose additions via PR updating that file + this doc if classification changes are needed.

Canonical enumeration source of truth:

-   `shared/src/telemetryEvents.ts` – `GAME_EVENT_NAMES`

Planned lint rule: enforce membership & regex validation for any string literal passed to telemetry helpers.

## Tracing (OpenTelemetry Baseline & Roadmap)

Baseline HTTP span tracing is initialized (issue #41) capturing request lifecycle with a safeguard against double `end()` calls. Correlation IDs flow through events but span attributes are intentionally minimal for now.

Upcoming enrichment (Epic #310) will introduce:

-   Production exporter configuration (OTLP / Application Insights)
-   Span attribute enrichment (playerGuid, location IDs, persistenceMode, RU/latency metrics)
-   Outbound traceparent propagation to queued world events & AI cost telemetry flows
-   Error status mapping and standardized naming taxonomy

Until #310 lands, avoid ad-hoc span attribute proliferation—defer to the enrichment plan for consistency.
