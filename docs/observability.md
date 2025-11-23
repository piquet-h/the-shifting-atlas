# Observability & Telemetry (Essentials)

Lean specification for game/domain telemetry. Focus: consistent event grammar + minimal dimension set. Historical migration notes & phased expansion tables removed to keep this doc stable and referenceable.

**Related Documentation:**

-   [Telemetry Event Catalog](./observability/telemetry-catalog.md) — Complete event definitions and dimensions
-   [Alerts Catalog](./observability/alerts-catalog.md) — Azure Monitor alert configurations and response guidance
-   [Infrastructure README](../infrastructure/README.md) — Bicep deployment and parameters

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

| Attribute Key               | Purpose                                 | Example Value                    | Events                                |
| --------------------------- | --------------------------------------- | -------------------------------- | ------------------------------------- |
| `game.player.id`            | Player GUID for identity correlation    | `9d2f...`                        | Navigation, Player, Auth events       |
| `game.location.id`          | Location GUID (current or target)       | `a4d1c3f1-...`                   | Location, Navigation events           |
| `game.location.from`        | Origin location ID for movement         | `a4d1c3f1-...`                   | Navigation.Move.Success/Blocked       |
| `game.location.to`          | Destination location ID (when resolved) | `b5e2d4g2-...`                   | Navigation.Move.Success               |
| `game.world.exit.direction` | Movement direction (canonical)          | `north`, `south`, `east`, `west` | Navigation.Move.Success/Blocked       |
| `game.event.type`           | World event type for event processing   | `player.move`, `npc.action`      | World.Event.Processed/Duplicate       |
| `game.event.actor.kind`     | Actor type (player, npc, system)        | `player`, `npc`, `system`        | World.Event.Processed                 |
| `game.error.code`           | Domain error classification             | `no-exit`, `from-missing`        | Navigation.Move.Blocked, error events |

### Attribute Naming Rules

1. **Prefix Pattern**: All game domain attributes use `game.<domain>.<attribute>` namespace.
2. **Lowercase Segments**: Use lowercase with dot separators (not camelCase in key names).
3. **Semantic Clarity**: Attribute name should indicate entity type and role (e.g., `game.location.from` vs `game.location.to`).
4. **Conditional Presence**: Omit attribute if value unavailable (e.g., `game.player.id` omitted when player context missing).
5. **Type Consistency**: GUID attributes contain UUIDs; enums contain lowercase kebab-case values.

### Usage Guidelines

-   **Movement Events**: Always include `game.player.id` (if known), `game.location.from`, `game.world.exit.direction`. Add `game.location.to` on success.
-   **World Events**: Always include `game.event.type`, `game.event.actor.kind`. Add target entity IDs as `game.location.id` or `game.player.id` depending on scope.
-   **Error Events**: Include `game.error.code` for domain error classification; use `status` dimension for HTTP codes.
-   **Backward Compatibility**: Standard dimension names (`playerGuid`, `fromLocation`, `toLocation`, `direction`) remain present alongside game.\* attributes during transition.

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

Application Insights sampling is configured during backend initialization to balance cost and diagnostic fidelity.

### Configuration

**Environment Variable:** `APPINSIGHTS_SAMPLING_PERCENTAGE`

-   Accepts percentage values (0-100) or ratios (0.0-1.0)
-   Values ≤1 are treated as ratios and converted to percentages (e.g., 0.15 → 15%)
-   Out-of-range values are clamped to [0, 100] with a `Telemetry.Sampling.ConfigAdjusted` warning event
-   Non-numeric values trigger fallback to environment default with warning

**Defaults:**

-   **Development/Test:** 100% sampling (complete visibility for debugging)
-   **Production:** 15% sampling (balances cost with sufficient signal for monitoring)

### Rationale

-   **15% production sampling** provides adequate sample size for monitoring trends, latency percentiles, and error rates while reducing ingestion costs by 85%
-   **100% dev/test sampling** ensures all events are captured during development and testing for comprehensive debugging
-   Environment-based defaults eliminate configuration overhead for standard deployments

### Kusto Query Adjustments

When querying sampled data, adjust counts to estimate total population:

```kusto
// Adjust event counts for 15% sampling
customEvents
| where timestamp > ago(24h)
| summarize sampledCount = count() by name
| extend estimatedTotal = sampledCount / 0.15
| project name, sampledCount, estimatedTotal
```

For accurate rate calculations (errors/requests), use ratios instead of raw counts:

```kusto
// Error rate is accurate even with sampling
let totalRequests = requests | where timestamp > ago(1h) | count;
let errorRequests = requests | where timestamp > ago(1h) and resultCode >= 400 | count;
print errorRate = todouble(errorRequests) / todouble(totalRequests)
```

### Dashboard Guidance

**Count Tiles:** Multiply displayed counts by `1/samplingPercentage` (e.g., × 6.67 for 15% sampling)

**Rate/Percentage Tiles:** No adjustment needed—ratios remain accurate

**Latency Percentiles:** No adjustment needed—distribution shape preserved

**Example Workbook Parameter:**

```json
{
    "name": "SamplingMultiplier",
    "type": 1,
    "value": "6.67",
    "label": "Sampling multiplier (15% = 6.67x)"
}
```

### Verification

Check effective sampling configuration:

```kusto
customEvents
| where name == "Telemetry.Sampling.ConfigAdjusted"
| project timestamp, requestedValue=customDimensions.requestedValue,
          appliedPercentage=customDimensions.appliedPercentage,
          reason=customDimensions.reason
| order by timestamp desc
```

### Sampling Rules

-   **NEVER** sample security/audit events (auth, rate limiting)—these use separate ingestion paths if needed
-   Sampling applies uniformly to all telemetry types (requests, dependencies, events, traces)
-   Request sampling decisions are correlated—all telemetry for a sampled request is included

## Partition Signals (Reference)

Scaling thresholds live in `adr/ADR-002-graph-partition-strategy.md`. Emit partition health only if a decision boundary nears—do not pre‑emptively stream RU/vertex counts each request.

### SQL API Partition Key Monitoring (M2 Observability)

Starting in M2, SQL API operations emit partition key values in telemetry to enable partition distribution monitoring and hot partition detection. See [Partition Key Monitoring](./observability/partition-key-monitoring.md) for comprehensive guidance on partition key strategies, validation queries, and remediation procedures.

**Instrumented Containers:**

-   `players` - Partition key: `/id` (player GUID)
-   `inventory` - Partition key: `/playerId` (player GUID)
-   `descriptionLayers` - Partition key: `/locationId` (location GUID)
-   `worldEvents` - Partition key: `/scopeKey` (scope pattern: `loc:<id>` or `player:<id>`)

**Event Schema:**

```typescript
// Success event with partition key
{
  eventName: 'SQL.Query.Executed',
  operationName: 'players.GetById',
  containerName: 'players',
  partitionKey: '9d2f7c8a-...',  // Partition key value used
  latencyMs: 12,
  ruCharge: 2.8,
  resultCount: 1
}

// Failure event
{
  eventName: 'SQL.Query.Failed',
  operationName: 'inventory.Query',
  containerName: 'inventory',
  partitionKey: 'a4d1c3f1-...',
  latencyMs: 85,
  httpStatusCode: 429  // Throttling
}

// Cross-partition query (no specific partition key)
{
  eventName: 'SQL.Query.Executed',
  operationName: 'players.Query',
  containerName: 'players',
  crossPartitionQuery: true,  // Indicates spans multiple partitions
  latencyMs: 150,
  ruCharge: 25.4,
  resultCount: 50
}
```

**Query Snippet (Application Insights Analytics):**

```kusto
// Partition key cardinality by container
customEvents
| where name == 'SQL.Query.Executed'
| where timestamp > ago(24h)
| extend containerName = tostring(customDimensions.containerName),
         partitionKey = tostring(customDimensions.partitionKey)
| where isnotempty(partitionKey)
| summarize
    uniquePartitions = dcount(partitionKey),
    totalOps = count(),
    totalRU = sum(todouble(customDimensions.ruCharge))
  by containerName
| project containerName, uniquePartitions, totalOps, totalRU,
          avgOpsPerPartition = round(todouble(totalOps) / uniquePartitions, 1)
```

**Alert Thresholds:**

-   Single partition >80% of total RU in 5-minute window (hot partition)
-   Container with <10 unique partition keys and >1000 operations
-   Partition key cardinality decreasing over time (consolidation indicator)

**Validation Script:**

```bash
# Analyze partition distribution across all containers
npm run validate:partitions

# Analyze specific container
npm run validate:partitions -- --container players

# Export report to CSV for analysis
npm run validate:partitions -- --format=csv > partition-report.csv
```

See [Partition Key Monitoring](./observability/partition-key-monitoring.md) for detailed queries, alert configuration, and migration guidance.

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
| Stable Paths         | All workbook JSON artifacts reside under `infrastructure/workbooks/` with slug pattern `<domain>-<focus>-dashboard.workbook.json`.                  |
| Additive Panels      | New metrics extend existing domain dashboard instead of creating a new workbook, unless a distinct audience or retention policy demands separation. |
| Issue Linking        | Dashboard issues reference the consolidated slug rather than creating parallel artifacts.                                                           |

### Movement Navigation Dashboard

Replaces prior separate movement success rate (#281) and blocked reasons (#282) workbook files with a unified artifact:

-   File: `infrastructure/workbooks/movement-navigation-dashboard.workbook.json`
-   Infra: `infrastructure/workbook-movement-navigation-dashboard.bicep`
-   Panels included: success rate tiles & summary, blocked reasons table, blocked rate trend (7d), summary statistics, interpretation guide.
-   Future additions (latency distribution, percentile overlays) should modify this file (see issue #283) rather than produce a new workbook.

### Performance Operations Dashboard

Consolidated workbook for Gremlin operation RU consumption, latency percentiles, partition pressure, and reliability monitoring:

-   File: `infrastructure/workbooks/performance-operations-dashboard.workbook.json`
-   Infra: `infrastructure/workbook-performance-operations-dashboard.bicep`
-   Issues consolidated: #289 (RU & Latency Overview), #290 (RU vs Latency Correlation), #291 (Partition Pressure Trend), #296 (Success/Failure Rate & RU Cost)
-   Panels included:
    -   **Gremlin Operation RU & Latency Overview**: Top operations by call volume with RU charge and latency percentiles (P50/P95/P99). Conditional formatting for latency >500ms (amber), >600ms (red); AvgRU thresholds (placeholder values, tune via #297).
    -   **RU vs Latency Correlation**: Scatter plot and Pearson correlation coefficient to detect pressure-induced slowdowns. Displays correlation when sample ≥30 events.
    -   **Partition Pressure Trend**: Time-series RU% with 429 overlay, threshold bands at 70% (amber) and 80% (red). Requires MAX_RU_PER_INTERVAL workbook parameter (calculated as: provisioned RU/s × bucket size in seconds, e.g., 1000 RU/s × 300s = 300000). Includes sustained pressure alert panel that triggers when RU% exceeds 70% for 3+ consecutive 5-minute intervals. Shows configuration banner when MAX_RU parameter not set. Handles zero-RU intervals and sparse 429 occurrences gracefully.
-   **Operation Success/Failure & RU Cost**: Reliability and cost efficiency table showing success vs failure rates, AvgRU(Success), RU/Call ratio, and P95 latency. Columns: OperationName, SuccessCalls, FailedCalls, FailureRate%, AvgRU(Success), RU/Call Ratio, P95 Latency, Category. Failure rate >2% (amber), >5% (red). RU metrics show "n/a" if >30% missing data. Includes RU data quality check banner and optimization priority assessment based on overall failure rate (<1% suggests low priority).
-   References: ADR-002 (partition pressure thresholds), telemetry events `Graph.Query.Executed` and `Graph.Query.Failed`.

### SQL API Partition Monitoring Dashboard

Dedicated workbook for SQL API partition key distribution monitoring and hot partition troubleshooting (Issue #387):

-   File: `infrastructure/workbooks/sql-partition-monitoring-dashboard.workbook.json`
-   Infra: `infrastructure/workbook-sql-partition-monitoring-dashboard.bicep`
-   **Purpose**: Detect partition skew and hot partitions before throttling impacts users. Complements `alert-sql-hot-partition` alert.
-   **Panels included**:
    -   **Partition Key Cardinality**: Unique partition keys per container with health indicators (green: >10, amber: 5-10, red: <5)
    -   **Top Hot Partitions**: Partitions consuming >5% of operations, ranked by RU consumption with percentage thresholds
    -   **Partition Distribution Chart**: Visual RU split across top 10 partitions
    -   **RU Consumption Trend**: Hourly RU trend for top 5 partitions
    -   **429 Throttling Analysis**: Throttling errors by partition key
    -   **Latency Percentiles**: P50/P95/P99 latency for hot partitions
    -   **Alert Troubleshooting Guide**: Step-by-step response workflow when hot partition alert fires
-   **When to Use**:
    -   After hot partition alert fires (immediate troubleshooting)
    -   Weekly partition health reviews
    -   Before/after partition key migrations
    -   Capacity planning for high-growth containers
-   **Filters**: Time range (1h-7d), container selection (All or specific)
-   References: docs/observability/partition-key-monitoring.md, ADR-002 (partition strategy principles)

#### Recent Enhancements (Nov 2025)

| Area               | Enhancement                                   | Rationale                                     | Edge Case Handling                                        |
| ------------------ | --------------------------------------------- | --------------------------------------------- | --------------------------------------------------------- |
| Partition Pressure | Dynamic thresholds (Base + Offset parameters) | Tune red threshold without redeploy           | Missing baseline → info banner; blank offset → default 10 |
| Partition Pressure | High overlay series (`RUPercentHigh`)         | Visual salience for critical exceedances      | Null unless RU% > high threshold & baseline valid         |
| Sustained Alerts   | Baseline guard + informative row              | Avoids misleading % when baseline unset       | Emits info row instead of empty result                    |
| Parameters UX      | Tooltips + defaults for all threshold params  | Immediate usability & consistent onboarding   | Defaults applied automatically                            |
| Reliability Table  | RU data quality banner (>30% missing)         | Prevents misinterpretation of RU/Call metrics | Switches AvgRU/RUPerCall to "n/a"                         |
| Correlation Panel  | Sample-size suppression (<30)                 | Blocks statistically weak correlations        | Warning explains missing RU counts                        |
| Percentiles        | Unified conditional color thresholds          | Consistent cross-panel visual grammar         | Stability notice for low volume                           |
| Query Safety       | Defensive coalesce / null guards              | Keeps panels rendering under sparse data      | RU% null when baseline invalid                            |

Principles Reinforced:

1. Parameter-first adaptability (threshold tuning via workbook params, not code).
2. Explicit informational states (baseline missing, sparse samples) instead of silent blanks.
3. Layered signal design: primary series (RU%), overlay for critical breach, annotation for sustained conditions.
4. Fail-soft queries (no divide-by-zero, null-safe arithmetic) preserving user trust.

Recommended Future Iterations:

-   Outlier filtering toggle for RU vs Latency (median × factor) when noise obscures trend.
-   Optional amber overlay (`RUPercentBase`) mirroring high overlay pattern.
-   Telemetry emission on parameter change (`Dashboard.Parameter.Changed`) for audit.
-   Heuristic auto-suggestion of baseline from observed peak RU when unset.

Closed Issues Backreferenced: #289 #290 #291 #296 (all folded improvements reflected here; future tuning notes should extend this subsection rather than duplicating rationale in new issues).

##### Workbook Parameter Architecture Reference

For technical implementation rules (dual parameter surfaces, placeholder guarding, deploy-time defaults, descriptive tooltips) see `architecture/workbook-parameter-guidelines.md`. Future panels must conform to P1–P4 principles before adding new metrics.

#### Export Instructions

To export RU vs Latency Correlation panel queries and configuration for external analysis:

**Query Export (Kusto/KQL):**

1. Navigate to Application Insights → Logs
2. Copy the correlation coefficient query from the workbook:
    ```kusto
    let timeRange = 2h;
    let minSampleSize = 30;
    let events = customEvents
    | where timestamp > ago(timeRange)
    | where name == 'Graph.Query.Executed'
    | extend operationName = tostring(customDimensions.operationName),
             latencyMs = todouble(customDimensions.latencyMs),
             ruCharge = todouble(customDimensions.ruCharge)
    | where isnotempty(operationName) and isnotnull(ruCharge) and isnotnull(latencyMs) and latencyMs > 0;
    events
    | summarize
        n = count(),
        sumX = sum(ruCharge),
        sumY = sum(latencyMs),
        sumXY = sum(ruCharge * latencyMs),
        sumX2 = sum(ruCharge * ruCharge),
        sumY2 = sum(latencyMs * latencyMs)
      by operationName
    | extend
        numerator = (n * sumXY) - (sumX * sumY),
        denomX = sqrt((n * sumX2) - (sumX * sumX)),
        denomY = sqrt((n * sumY2) - (sumY * sumY))
    | extend correlation = iff(denomX == 0 or denomY == 0, 0.0, numerator / (denomX * denomY))
    | extend correlation = round(correlation, 3)
    | project operationName, correlation, SampleSize = n
    | where SampleSize >= minSampleSize
    | order by correlation desc
    ```
3. Export results via "Export to CSV" or "Export to Excel" buttons
4. For scatter plot data, use the scatter query (replace timeRange as needed)

**Workbook Configuration Export:**

1. Open Performance Operations Dashboard in Azure Portal
2. Navigate to Advanced Editor (toolbar icon)
3. Copy JSON for the "RU vs Latency Correlation" section (items at indices for scatter plot, correlation table, trend chart)
4. Save locally or import into another Application Insights workbook

**Programmatic Export (Azure CLI):**

```bash
# Export workbook template
az resource show \
  --resource-group <rg-name> \
  --resource-type "Microsoft.Insights/workbooks" \
  --name <workbook-guid> \
  --query properties.serializedData \
  --output json > performance-dashboard-export.json
```

**Data Export for Analysis Tools:**

For external correlation analysis (R, Python, Excel):

1. Run scatter plot query with extended timeRange (e.g., 24h or 7d)
2. Remove `| take 1000` limit if full dataset needed
3. Export to CSV
4. Import into analysis tool maintaining columns: operationName, ruCharge, latencyMs, timestamp

**Note:** Exported queries may need adjustment for different Application Insights instances (e.g., update customDimensions key names if telemetry schema differs).

##### Partition Pressure Trend Export

To export Partition Pressure Trend data and queries for capacity planning:

**Query Export (Kusto/KQL):**

1. Navigate to Application Insights → Logs
2. Copy the partition pressure query from the workbook:
    ```kusto
    let timeRange = 24h;
    let bucketSize = 5m;
    let maxRuPerInterval = 300000.0; // Replace with your MAX_RU_PER_INTERVAL value
    let ruEvents = customEvents
    | where timestamp > ago(timeRange)
    | where name == 'Graph.Query.Executed'
    | extend ruCharge = todouble(customDimensions.ruCharge)
    | where isnotnull(ruCharge);
    let failures = customEvents
    | where timestamp > ago(timeRange)
    | where name == 'Graph.Query.Failed'
    | extend statusCode = toint(customDimensions.statusCode)
    | where statusCode == 429;
    let allBuckets = range timestamp from ago(timeRange) to now() step bucketSize
    | project bucket = bin(timestamp, bucketSize);
    let ruByBucket = ruEvents
    | summarize TotalRU = sum(ruCharge) by bucket = bin(timestamp, bucketSize);
    let throttleByBucket = failures
    | summarize ThrottleCount = count() by bucket = bin(timestamp, bucketSize);
    allBuckets
    | join kind=leftouter ruByBucket on bucket
    | join kind=leftouter throttleByBucket on bucket
    | extend TotalRU = coalesce(TotalRU, 0.0),
             ThrottleCount = coalesce(ThrottleCount, 0),
             RUPercent = round(100.0 * coalesce(TotalRU, 0.0) / maxRuPerInterval, 2)
    | project timestamp = bucket, RUPercent, ThrottleCount, TotalRU
    | order by timestamp asc
    ```
3. Export to CSV for historical trend analysis
4. Adjust `timeRange` for longer analysis periods (7d, 30d)

**Sustained Pressure Detection Query:**

```kusto
let timeRange = 24h;
let bucketSize = 5m;
let maxRuPerInterval = 300000.0; // Replace with your value
let ruEvents = customEvents
| where timestamp > ago(timeRange)
| where name == 'Graph.Query.Executed'
| extend ruCharge = todouble(customDimensions.ruCharge)
| where isnotnull(ruCharge);
let allBuckets = range timestamp from ago(timeRange) to now() step bucketSize
| project bucket = bin(timestamp, bucketSize);
let ruByBucket = ruEvents
| summarize TotalRU = sum(ruCharge) by bucket = bin(timestamp, bucketSize);
let pressureData = allBuckets
| join kind=leftouter ruByBucket on bucket
| extend TotalRU = coalesce(TotalRU, 0.0),
         RUPercent = round(100.0 * coalesce(TotalRU, 0.0) / maxRuPerInterval, 2)
| project timestamp = bucket, RUPercent
| order by timestamp asc;
pressureData
| extend IsHigh = RUPercent > 70.0
| serialize rn = row_number()
| extend prevIsHigh1 = prev(IsHigh, 1), prevIsHigh2 = prev(IsHigh, 2)
| where IsHigh and prevIsHigh1 and prevIsHigh2
| summarize
    StartTime = min(timestamp),
    EndTime = max(timestamp),
    ConsecutiveIntervals = count(),
    MaxRU = max(RUPercent),
    AvgRU = round(avg(RUPercent), 1)
| project StartTime, EndTime, ConsecutiveIntervals, AvgRU, MaxRU
```

**Configuration Notes:**

-   `MAX_RU_PER_INTERVAL` = Provisioned RU/s × bucket size in seconds
-   Example: 1000 RU/s × 300 seconds = 300,000
-   For auto-scale accounts, use maximum RU/s
-   Adjust `bucketSize` for different granularities (1m, 5m, 15m)

**Edge Cases Verified:**

-   Zero RU intervals: Display as 0% (no divide-by-zero errors)
-   Sparse 429 occurrences: Rendered correctly with appropriate Y-axis scaling
-   Missing baseline: Chart displays with null RU% and configuration banner shown

##### Operation Success/Failure Rate & RU Cost Table Export

To export reliability and cost efficiency data for operational review:

**Query Export (Kusto/KQL):**

1. Navigate to Application Insights → Logs
2. Copy the reliability table query from the workbook:
    ```kusto
    let timeRange = 24h;
    let minCalls = 10;
    let successEvents = customEvents
    | where timestamp > ago(timeRange)
    | where name == 'Graph.Query.Executed'
    | extend operationName = tostring(customDimensions.operationName),
             ruCharge = todouble(customDimensions.ruCharge),
             latencyMs = todouble(customDimensions.latencyMs)
    | where isnotempty(operationName);
    let failureEvents = customEvents
    | where timestamp > ago(timeRange)
    | where name == 'Graph.Query.Failed'
    | extend operationName = tostring(customDimensions.operationName)
    | where isnotempty(operationName);
    let successAgg = successEvents
    | summarize
        SuccessCalls = count(),
        TotalRU = sum(ruCharge),
        MissingRU = countif(isnull(ruCharge)),
        P95Latency = percentile(latencyMs, 95)
      by operationName;
    let failureAgg = failureEvents
    | summarize FailedCalls = count() by operationName;
    successAgg
    | join kind=leftouter failureAgg on operationName
    | extend FailedCalls = coalesce(FailedCalls, 0)
    | extend TotalCalls = SuccessCalls + FailedCalls
    | extend FailureRate = round(100.0 * FailedCalls / TotalCalls, 2)
    | extend AvgRUSuccess = iff(MissingRU > 0.3 * SuccessCalls, 0.0, TotalRU / SuccessCalls)
    | extend AvgRU = round(AvgRUSuccess, 2)
    | extend RUPerCall = iff(AvgRUSuccess > 0, round(AvgRUSuccess, 2), 0.0)
    | extend Category = iff(TotalCalls < minCalls, "Low Volume", "Normal")
    | project operationName, SuccessCalls, FailedCalls, FailureRate, AvgRU, RUPerCall, P95Latency = round(P95Latency, 0), Category
    | order by TotalCalls = SuccessCalls + FailedCalls desc
    ```
3. Export results via "Export to CSV" or "Export to Excel" buttons
4. Adjust `timeRange` for historical analysis (7d, 30d)

**Automated Alerting Setup:**

Create alert rules for high-failure operations:

```kusto
// Alert when any operation exceeds 5% failure rate with ≥50 calls in 1h
let timeRange = 1h;
let minCalls = 50;
let failureThreshold = 5.0;
let successEvents = customEvents
| where timestamp > ago(timeRange)
| where name == 'Graph.Query.Executed'
| extend operationName = tostring(customDimensions.operationName)
| where isnotempty(operationName);
let failureEvents = customEvents
| where timestamp > ago(timeRange)
| where name == 'Graph.Query.Failed'
| extend operationName = tostring(customDimensions.operationName)
| where isnotempty(operationName);
let successAgg = successEvents | summarize SuccessCalls = count() by operationName;
let failureAgg = failureEvents | summarize FailedCalls = count() by operationName;
successAgg
| join kind=leftouter failureAgg on operationName
| extend FailedCalls = coalesce(FailedCalls, 0)
| extend TotalCalls = SuccessCalls + FailedCalls
| extend FailureRate = round(100.0 * FailedCalls / TotalCalls, 2)
| where TotalCalls >= minCalls and FailureRate > failureThreshold
| project operationName, SuccessCalls, FailedCalls, FailureRate, TotalCalls
| order by FailureRate desc
```

Use this query in Application Insights Alerts with appropriate threshold and notification channel.

**Optimization Priority Assessment:**

Export the priority assessment query for reporting:

```kusto
let timeRange = 24h;
let successEvents = customEvents
| where timestamp > ago(timeRange)
| where name == 'Graph.Query.Executed';
let failureEvents = customEvents
| where timestamp > ago(timeRange)
| where name == 'Graph.Query.Failed';
let totalSuccess = toscalar(successEvents | count);
let totalFailure = toscalar(failureEvents | count);
let totalCalls = totalSuccess + totalFailure;
let overallFailureRate = iff(totalCalls > 0, round(100.0 * totalFailure / totalCalls, 2), 0.0);
datatable(Metric:string, Value:string) [
    "Total Success Calls", tostring(totalSuccess),
    "Total Failed Calls", tostring(totalFailure),
    "Overall Failure Rate (%)", tostring(overallFailureRate),
    "Priority Level", iff(overallFailureRate < 1.0 and totalCalls >= 100, "Low (defer optimization)", "Monitor (review high-failure ops)")
]
```

**Edge Cases Verified:**

-   All success (0% failure): RU metrics displayed normally
-   Missing RU >30%: "n/a" shown for AvgRU and RU/Call columns; warning banner displayed
-   Single failure in many successes: No amber if <2% threshold
-   Low volume operations (<10 calls): Listed in "Low Volume" category, not excluded

#### Future Enhancements

**Outlier Removal Toggle:**

The RU vs Latency Correlation panel currently displays all data points without outlier filtering. A future enhancement could add an optional outlier removal toggle to help identify core patterns:

-   **Concept**: Filter out RU values exceeding `median_RU × OUTLIER_FACTOR` (e.g., OUTLIER_FACTOR = 3.0)
-   **Implementation approach**: Add workbook parameter for OUTLIER_FACTOR with default value and checkbox toggle
-   **Query modification**:
    ```kusto
    let medianRU = toscalar(events | summarize percentile(ruCharge, 50));
    let outlierThreshold = medianRU * outlierFactor;
    events | where ruCharge <= outlierThreshold
    ```
-   **Use case**: Focus correlation analysis on typical operations when occasional extreme RU spikes obscure patterns
-   **Tradeoff**: May hide legitimate high-cost operations that contribute to partition pressure

This enhancement is **not required** for initial implementation (issue #290). Document as optional feature for future iteration if scatter plots show significant outlier noise affecting interpretation.

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

### AI Cost Telemetry (M2 Observability)

AI cost tracking telemetry events, pricing configuration, token buckets, and dashboard queries are documented in:

-   `observability/ai-cost-telemetry.md` – Comprehensive guide to AI cost instrumentation

Events include: `AI.Cost.Estimated`, `AI.Cost.WindowSummary`, `AI.Cost.SoftThresholdCrossed`, `AI.Cost.OverrideRejected`, `AI.Cost.InputAdjusted`, `AI.Cost.InputCapped`.

## Consolidated Telemetry Mode (Application Insights Only)

OpenTelemetry span tracing has been removed (issue #311). The system now relies solely on Application Insights automatic collection plus custom events. No span exporter or traceparent continuation is active.

### Correlation Strategy

-   `correlationId`: Always emitted (UUID generated if not supplied). Present in every custom event.
-   `operationId`: Emitted when Application Insights request context has been initialized (may be absent in early init or certain async flows). Queries should guard with `isnotempty(customDimensions.operationId)`.

#### Kusto Query Examples for Event Correlation

##### Join custom events with HTTP requests via operationId

Correlate domain events (Location.Move, Location.Get) with their originating HTTP request to analyze end-to-end latency and status:

```kusto
let recentRequests = requests
  | where timestamp > ago(1h)
  | project operation_Id, requestName = name, requestDuration = duration, resultCode;
customEvents
| where timestamp > ago(1h)
| where name in ('Location.Move', 'Location.Get', 'World.Event.Processed')
| extend operationId = tostring(customDimensions.operationId),
         correlationId = tostring(customDimensions.correlationId),
         eventLatencyMs = todouble(customDimensions.latencyMs)
| where isnotempty(operationId)
| join kind=leftouter recentRequests on $left.operationId == $right.operation_Id
| project timestamp, name, correlationId, operationId, requestName, requestDuration, resultCode, eventLatencyMs
| order by timestamp desc
```

##### Track event chain across queue processing via correlationId

Follow a correlationId across HTTP trigger → queue message → event processing to trace async workflows:

```kusto
let eventCorrelationId = "your-correlation-id-here";
union customEvents, requests, dependencies
| where timestamp > ago(24h)
| extend correlationId = coalesce(
    tostring(customDimensions.correlationId),
    tostring(customProperties.correlationId),
    ""
)
| where correlationId == eventCorrelationId
| project timestamp,
         itemType = iff(itemType == "", "customEvent", itemType),
         name,
         correlationId,
         operationId = coalesce(operation_Id, tostring(customDimensions.operationId)),
         duration = coalesce(duration, todouble(customDimensions.latencyMs)),
         resultCode = coalesce(resultCode, tostring(customDimensions.status))
| order by timestamp asc
```

##### Identify queue-triggered events without request context

Find events emitted from queue handlers where operationId is unavailable (useful for validating correlation coverage):

```kusto
customEvents
| where timestamp > ago(1h)
| where name in ('World.Event.Processed', 'World.Event.Duplicate')
| extend operationId = tostring(customDimensions.operationId),
         correlationId = tostring(customDimensions.correlationId)
| where isempty(operationId) or isnull(operationId)
| summarize count() by name, bin(timestamp, 5m)
| render timechart
```

##### Join custom events with dependencies (external calls)

Correlate game events with outbound dependencies (Cosmos DB, Service Bus) via operationId:

```kusto
let recentDependencies = dependencies
  | where timestamp > ago(1h)
  | where type in ("Azure blob", "Azure table", "Azure Service Bus", "HTTP")
  | project operation_Id, dependencyType = type, target, dependencyDuration = duration, success;
customEvents
| where timestamp > ago(1h)
| where name startswith "Location." or name startswith "World."
| extend operationId = tostring(customDimensions.operationId)
| where isnotempty(operationId)
| join kind=inner recentDependencies on $left.operationId == $right.operation_Id
| project timestamp, name, operationId, dependencyType, target, dependencyDuration, success
| order by timestamp desc
```

##### Analyze request-to-event latency distribution

Measure time between HTTP request start and domain event emission (useful for performance analysis):

```kusto
let eventsWithOp = customEvents
  | where timestamp > ago(1h)
  | where name in ('Location.Move', 'Location.Get')
  | extend operationId = tostring(customDimensions.operationId)
  | where isnotempty(operationId)
  | project eventTimestamp = timestamp, name, operationId;
requests
| where timestamp > ago(1h)
| join kind=inner eventsWithOp on $left.operation_Id == $right.operationId
| extend latencyMs = datetime_diff('millisecond', eventTimestamp, timestamp)
| summarize
    count = count(),
    p50 = percentile(latencyMs, 50),
    p95 = percentile(latencyMs, 95),
    p99 = percentile(latencyMs, 99)
  by name
| order by p95 desc
```

### Internal Timing Events

`Timing.Op` is an internal helper event emitted by the timing utility (Issue #353) for ad-hoc latency measurement without spans. Properties:

| Key             | Description                               | Required |
| --------------- | ----------------------------------------- | -------- |
| `op`            | Operation label (developer set)           | Yes      |
| `ms`            | Elapsed time in milliseconds              | Yes      |
| `category`      | Operation category (e.g., 'repository')   | No       |
| `error`         | Boolean flag when operation threw error   | No       |
| `correlationId` | Auto-generated or provided correlation ID | Yes      |

#### Usage Pattern (withTiming API)

Preferred for new code - automatically wraps sync/async functions:

```typescript
import { withTiming } from '../telemetry/timing.js'

// Basic usage
const result = await withTiming('PlayerRepository.get', async () => {
    return await playerRepo.get(id)
})

// With category and correlation
const result = await withTiming('PlayerRepository.get', () => playerRepo.get(id), {
    category: 'repository',
    correlationId: req.correlationId
})

// With error tracking (error flag set, exception re-thrown)
try {
    await withTiming('RiskyOperation', () => riskyCall(), { includeErrorFlag: true })
} catch (err) {
    // Error was tracked with error: true flag before re-throw
    handleError(err)
}
```

#### Legacy Usage Pattern (startTiming API)

Manual start/stop pattern (retained for backward compatibility):

```typescript
import { startTiming } from '../telemetry/timing.js'

const t = startTiming('ContainerSetup')
// ... work ...
t.stop({ extra: 'value' })
```

#### Kusto Query Examples

**Percentile latency by operation:**

```kusto
customEvents
| where name == 'Timing.Op'
| where timestamp > ago(24h)
| extend op = tostring(customDimensions.op),
         ms = todouble(customDimensions.ms),
         category = tostring(customDimensions.category),
         error = tobool(customDimensions.error)
| summarize
    count = count(),
    errors = countif(error == true),
    p50 = percentile(ms, 50),
    p95 = percentile(ms, 95),
    p99 = percentile(ms, 99),
    avg = avg(ms),
    max = max(ms)
  by op, category
| order by p95 desc
```

**Slow operations (p95 > 500ms):**

```kusto
customEvents
| where name == 'Timing.Op'
| where timestamp > ago(7d)
| extend op = tostring(customDimensions.op),
         ms = todouble(customDimensions.ms)
| summarize p95 = percentile(ms, 95), count = count() by op
| where p95 > 500
| order by p95 desc
```

**Error rate by operation:**

```kusto
customEvents
| where name == 'Timing.Op'
| where timestamp > ago(24h)
| extend op = tostring(customDimensions.op),
         error = tobool(customDimensions.error)
| summarize
    total = count(),
    errors = countif(error == true),
    errorRate = round(100.0 * countif(error == true) / count(), 2)
  by op
| where errorRate > 0
| order by errorRate desc
```

**Latency trend over time:**

```kusto
customEvents
| where name == 'Timing.Op'
| where timestamp > ago(7d)
| extend op = tostring(customDimensions.op),
         ms = todouble(customDimensions.ms)
| summarize p95 = percentile(ms, 95) by op, bin(timestamp, 1h)
| render timechart
```

#### Usage Guidance

-   Prefer using existing domain events' `latencyMs` dimension when measuring request/command duration.
-   Use `Timing.Op` for ad-hoc internal instrumentation or detailed operation profiling.
-   Avoid high-cardinality `op` values (do not embed dynamic IDs or user data).
-   Use `category` to group related operations (e.g., 'repository', 'handler', 'external-api').
-   Enable `includeErrorFlag: true` for operations where failure tracking is important.
-   Very fast operations (<1ms) may round to 0 or 1ms due to Date.now() precision.

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
