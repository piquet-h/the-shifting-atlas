# Telemetry Event Catalog

> **Implementation**: `shared/src/telemetryEvents.ts`  
> **Destination**: Application Insights  
> **Naming Convention**: `Domain.Subject.Action` (2-3 PascalCase segments)

## Purpose

Central registry documenting all game domain telemetry events, including when they fire, what dimensions are tracked, and their operational significance.

## Event Categories

### Core Service / Utility

#### `Ping.Invoked`

**Trigger:** HTTP GET `/api/ping`  
**Dimensions:** `timestamp`, `latency_ms`  
**Severity:** Informational  
**Purpose:** Health check; validate service availability and response time  
**Retention:** 30 days

---

### Onboarding & Auth

#### `Onboarding.GuestGuid.Started`

**Trigger:** Player bootstrap initiated  
**Dimensions:** `correlation_id`  
**Severity:** Informational  
**Purpose:** Track bootstrap funnel start  
**Retention:** 90 days

#### `Onboarding.GuestGuid.Created`

**Trigger:** Player GUID generated successfully  
**Dimensions:** `player_id`, `display_name`, `correlation_id`  
**Severity:** Informational  
**Purpose:** Track player creation success rate  
**Retention:** 90 days

#### `Onboarding.GuestGuid.Completed`

**Trigger:** Bootstrap response sent to client  
**Dimensions:** `player_id`, `latency_ms`, `correlation_id`  
**Severity:** Informational  
**Purpose:** Measure end-to-end bootstrap latency  
**Alert:** >500ms (p95) for 5 consecutive minutes  
**Retention:** 90 days

#### `Auth.Player.Upgraded`

**Trigger:** Guest account linked to OAuth2 identity (future)  
**Dimensions:** `player_id`, `provider`, `correlation_id`  
**Severity:** Informational  
**Purpose:** Track auth upgrade adoption  
**Retention:** 365 days

---

### Player Lifecycle

#### `Player.Get`

**Trigger:** HTTP GET `/api/player/{id}`  
**Dimensions:** `player_id`, `location_assigned` (boolean), `latency_ms`, `correlation_id`  
**Severity:** Informational  
**Purpose:** Track player fetch patterns; identify first-time vs returning players  
**Alert:** >200ms (p95) for Cosmos SQL reads  
**Retention:** 90 days

#### `Player.Created`

**Trigger:** Player document persisted to Cosmos SQL (deprecated — use `Onboarding.GuestGuid.Created`)  
**Dimensions:** `player_id`, `correlation_id`  
**Severity:** Informational  
**Purpose:** Legacy event; superseded by onboarding funnel events  
**Retention:** 30 days

---

### Player Traversal & Location Access

#### `Location.Get`

**Trigger:** Location vertex fetched from Gremlin graph  
**Dimensions:** `location_id`, `player_id`, `latency_ms`, `correlation_id`  
**Severity:** Informational  
**Purpose:** Track location access patterns; measure Gremlin query performance  
**Alert:** >300ms (p95) for single vertex queries  
**Retention:** 90 days

#### `Navigation.Move.Success`

**Trigger:** Player movement completes successfully (destination resolved & player heading updated)  
**Dimensions:** `player_id`, `from_location_id`, `to_location_id`, `direction`, `raw_input` (if normalized), `latency_ms`, `correlation_id`  
**Severity:** Informational  
**Purpose:** Primary traversal success KPI; used for success rate denominator; latency forms part of core loop performance dashboards.  
**Alert:** P95 latency >400ms for 5 consecutive minutes  
**Retention:** 180 days

#### `Navigation.Move.Blocked`

**Trigger:** Movement attempt rejected (invalid direction, missing origin, absent exit, repository error)  
**Dimensions:** `player_id`, `from_location_id`, `direction`, `reason` (invalid-direction|from-missing|no-exit|move-failed), `status` (HTTP status), `latency_ms`, `correlation_id`  
**Severity:** Warning (operational); individual reasons may be informational for player input quality  
**Purpose:** Tracks friction sources in traversal; enables breakdown dashboards by reason to guide UX copy & world design fixes.  
**Alert:** Blocked rate >10% over 15 min OR invalid-direction >5% (typo normalization tuning)  
**Retention:** 180 days

---

### Navigation & Direction Normalization

#### `Navigation.Input.Parsed`

**Trigger:** Direction input normalized (success or failure)  
**Dimensions:** `raw_input`, `status` (ok|ambiguous|unknown), `direction` (if ok), `candidates` (if ambiguous), `latency_ms`, `correlation_id`  
**Severity:** Informational (ok); Warning (unknown)  
**Purpose:** Track normalization accuracy; identify common typos; tune edit distance threshold  
**Alert:** Unknown rate >10% sustained  
**Retention:** 90 days

#### `Navigation.Input.Ambiguous`

**Trigger:** Direction input matches multiple semantic candidates (N2 feature)  
**Dimensions:** `raw_input`, `candidates`, `player_id`, `location_id`, `correlation_id`  
**Severity:** Warning  
**Purpose:** Identify ambiguous exit configurations requiring clarification  
**Alert:** >5% of normalization attempts ambiguous  
**Retention:** 90 days

#### `Navigation.Look.Issued`

**Trigger:** HTTP GET `/api/location/look`  
**Dimensions:** `player_id`, `location_id`, `exit_count`, `latency_ms`, `correlation_id`  
**Severity:** Informational  
**Purpose:** Track location inspection patterns; measure LOOK query performance  
**Alert:** >200ms (p95) for location + exits query  
**Retention:** 90 days

---

### Command Layer

#### `Command.Executed`

**Trigger:** Client-side command parser executed (frontend)  
**Dimensions:** `command`, `args`, `status`, `latency_ms`, `session_id`  
**Severity:** Informational  
**Purpose:** Track command usage patterns; identify parsing failures  
**Retention:** 30 days

---

### World State & Generation

#### `World.Location.Generated`

**Trigger:** New location vertex created via AI or script  
**Dimensions:** `location_id`, `external_id`, `kind`, `source` (ai|seed|manual), `correlation_id`  
**Severity:** Informational  
**Purpose:** Track world expansion rate; measure generation source distribution  
**Retention:** 365 days

#### `World.Location.Rejected`

**Trigger:** AI-generated location failed validation  
**Dimensions:** `reason`, `validation_error`, `correlation_id`  
**Severity:** Warning  
**Purpose:** Track AI generation quality; tune validation rules  
**Alert:** Rejection rate >20% sustained  
**Retention:** 90 days

#### `World.Location.Upsert`

**Trigger:** Location vertex upserted (idempotent create/update)  
**Dimensions:** `location_id`, `operation` (created|updated), `latency_ms`, `correlation_id`  
**Severity:** Informational  
**Purpose:** Track persistence operations; measure Gremlin write performance  
**Alert:** >500ms (p95) for upserts  
**Retention:** 90 days

#### `World.Layer.Added`

**Trigger:** Description layer added to location (M4 feature)  
**Dimensions:** `location_id`, `layer_id`, `layer_type`, `source` (ai|manual), `correlation_id`  
**Severity:** Informational  
**Purpose:** Track layering adoption; measure AI layer generation rate  
**Retention:** 180 days

#### `World.Exit.Created`

**Trigger:** Exit edge added between locations  
**Dimensions:** `from_location_id`, `to_location_id`, `direction`, `reciprocal` (boolean), `correlation_id`  
**Severity:** Informational  
**Purpose:** Track world connectivity growth; validate reciprocal exits  
**Retention:** 365 days

#### `World.Exit.Removed`

**Trigger:** Exit edge deleted (cleanup or retcon)  
**Dimensions:** `from_location_id`, `to_location_id`, `direction`, `reason`, `correlation_id`  
**Severity:** Warning  
**Purpose:** Track world structure changes; investigate unexpected removals  
**Alert:** >10 removals/hour (potential bug or abuse)  
**Retention:** 365 days

---

### World Event Processing

#### `World.Event.Processed`

**Trigger:** World event successfully consumed from queue  
**Dimensions:** `event_id`, `event_type`, `actor_kind`, `idempotency_key_hash`, `latency_ms`, `correlation_id`, `causation_id`  
**Severity:** Informational  
**Purpose:** Track async event processing rate; measure queue latency  
**Alert:** Latency >5s (p95)  
**Retention:** 90 days

#### `World.Event.Duplicate`

**Trigger:** Idempotency key matched existing processed event  
**Dimensions:** `event_id`, `idempotency_key_hash`, `original_event_id`, `correlation_id`  
**Severity:** Informational  
**Purpose:** Validate idempotency logic; detect duplicate submissions  
**Alert:** Duplicate rate >5% (potential upstream issue)  
**Retention:** 30 days

---

### AI Prompt & Generation

#### `Prompt.Genesis.Issued`

**Trigger:** AI prompt sent for world genesis (initial location generation)  
**Dimensions:** `prompt_id`, `model`, `token_count`, `correlation_id`  
**Severity:** Informational  
**Purpose:** Track AI generation requests; measure prompt token usage  
**Retention:** 90 days

#### `Prompt.Genesis.Rejected`

**Trigger:** Genesis prompt response failed validation  
**Dimensions:** `prompt_id`, `rejection_reason`, `correlation_id`  
**Severity:** Warning  
**Purpose:** Track AI output quality; identify validation gaps  
**Alert:** Rejection rate >15%  
**Retention:** 90 days

#### `Prompt.Genesis.Crystallized`

**Trigger:** Genesis prompt result persisted to world graph  
**Dimensions:** `prompt_id`, `location_id`, `latency_ms`, `correlation_id`  
**Severity:** Informational  
**Purpose:** Track successful AI contributions to world state  
**Retention:** 180 days

#### `Prompt.Layer.Generated`

**Trigger:** AI-generated description layer created (M4 feature)  
**Dimensions:** `location_id`, `layer_id`, `model`, `token_count`, `correlation_id`  
**Severity:** Informational  
**Purpose:** Track layer generation patterns; measure AI token costs  
**Retention:** 90 days

#### `Prompt.Cost.BudgetThreshold`

**Trigger:** AI operation exceeded cost/token budget  
**Dimensions:** `operation`, `cost_usd`, `threshold_usd`, `correlation_id`  
**Severity:** Warning  
**Purpose:** Cost governance; prevent runaway AI spending  
**Alert:** Triggered >3 times/hour  
**Retention:** 365 days

---

### Extension Hooks (M5 Systems)

#### `Extension.Hook.Invoked`

**Trigger:** Extension hook called by core system  
**Dimensions:** `hook_name`, `extension_id`, `latency_ms`, `correlation_id`  
**Severity:** Informational  
**Purpose:** Track extension usage; measure hook invocation patterns  
**Retention:** 90 days

#### `Extension.Hook.Veto`

**Trigger:** Extension vetoed proposed action  
**Dimensions:** `hook_name`, `extension_id`, `veto_reason`, `correlation_id`  
**Severity:** Warning  
**Purpose:** Track extension policy enforcement; identify veto patterns  
**Retention:** 90 days

#### `Extension.Hook.Mutation`

**Trigger:** Extension modified core system behavior  
**Dimensions:** `hook_name`, `extension_id`, `mutation_type`, `correlation_id`  
**Severity:** Informational  
**Purpose:** Track extension impact on gameplay; audit mutations  
**Retention:** 180 days

---

### Multiplayer (Future)

#### `Multiplayer.LayerDelta.Sent`

**Trigger:** Layer delta broadcasted to party members  
**Dimensions:** `location_id`, `layer_id`, `party_size`, `latency_ms`, `correlation_id`  
**Severity:** Informational  
**Purpose:** Track layer sync performance; measure broadcast latency  
**Retention:** 30 days

#### `Multiplayer.LocationSnapshot.HashMismatch`

**Trigger:** Client/server snapshot divergence detected  
**Dimensions:** `player_id`, `location_id`, `client_hash`, `server_hash`, `correlation_id`  
**Severity:** Error  
**Purpose:** Detect sync bugs; trigger reconciliation  
**Alert:** Any occurrence (critical consistency issue)  
**Retention:** 180 days

#### `Multiplayer.Movement.Latency`

**Trigger:** Player movement round-trip measured  
**Dimensions:** `player_id`, `direction`, `latency_ms`, `correlation_id`  
**Severity:** Informational  
**Purpose:** Track movement responsiveness; identify network issues  
**Alert:** >1000ms (p95)  
**Retention:** 30 days

---

### Secrets & Infrastructure

#### `Secret.Fetch.Retry`

**Trigger:** Key Vault fetch retry attempted  
**Dimensions:** `secret_name`, `attempt`, `reason`, `correlation_id`  
**Severity:** Warning  
**Purpose:** Track transient Key Vault failures  
**Alert:** >10 retries/minute  
**Retention:** 30 days

#### `Secret.Cache.Hit`

**Trigger:** Secret retrieved from in-memory cache  
**Dimensions:** `secret_name`, `correlation_id`  
**Severity:** Informational  
**Purpose:** Validate caching effectiveness  
**Retention:** 7 days

#### `Secret.Cache.Miss`

**Trigger:** Secret not in cache (fetch required)  
**Dimensions:** `secret_name`, `correlation_id`  
**Severity:** Informational  
**Purpose:** Track cache miss rate; tune TTL  
**Retention:** 7 days

#### `Secret.Fetch.Success`

**Trigger:** Secret successfully fetched from Key Vault  
**Dimensions:** `secret_name`, `latency_ms`, `correlation_id`  
**Severity:** Informational  
**Purpose:** Track Key Vault operation success rate  
**Retention:** 30 days

#### `Secret.Fetch.Failure`

**Trigger:** Key Vault fetch failed permanently  
**Dimensions:** `secret_name`, `error_code`, `correlation_id`  
**Severity:** Error  
**Purpose:** Critical: secret unavailability blocks operations  
**Alert:** Any occurrence (immediate escalation)  
**Retention:** 90 days

#### `Secret.Fetch.Fallback`

**Trigger:** Fallback to environment variable after Key Vault failure  
**Dimensions:** `secret_name`, `correlation_id`  
**Severity:** Warning  
**Purpose:** Track degraded secret access mode  
**Alert:** Sustained fallback >10 minutes  
**Retention:** 30 days

#### `Secret.Cache.Clear`

**Trigger:** In-memory cache manually cleared  
**Dimensions:** `reason`, `correlation_id`  
**Severity:** Informational  
**Purpose:** Track cache invalidation events  
**Retention:** 30 days

---

### Operation Latency Monitoring (M2 Observability)

#### `Monitoring.OperationLatency.Alert`

**Trigger:** P95 latency for a monitored operation exceeded threshold for 3 consecutive 10-minute windows  
**Dimensions:** `operationName`, `currentP95Ms`, `baselineP95Ms`, `sampleSize`, `alertLevel` (warning|critical), `thresholdMs`, `consecutiveWindows`  
**Severity:** Warning (500ms threshold) or Critical (600ms threshold)  
**Purpose:** Detect persistence degradation for non-movement operations before it impacts player experience  
**Alert:** Immediate notification on critical alerts; aggregate warnings for review  
**Retention:** 90 days

**Monitored Operations:**
- `location.upsert.check` - Location vertex existence check
- `location.upsert.write` - Location vertex upsert
- `exit.ensureExit.check` - Exit edge existence check
- `exit.ensureExit.create` - Exit edge creation
- `player.create` - Player vertex creation

**Thresholds:**
| Level | P95 Latency | Consecutive Windows | Impact |
|-------|-------------|---------------------|--------|
| Warning | >500ms | 3 | Degrading performance, investigate |
| Critical | >600ms | 3 | Severe degradation, immediate action |
| Resolved | <450ms | 2 | Auto-resolve after healthy windows |

**Minimum Sample Size:** 20 calls per 10-minute window (windows with fewer calls emit `InsufficientData` diagnostic)

#### `Monitoring.OperationLatency.Resolved`

**Trigger:** P95 latency for a monitored operation dropped below 450ms for 2 consecutive 10-minute windows  
**Dimensions:** `operationName`, `currentP95Ms`, `baselineP95Ms`, `sampleSize`, `thresholdMs`, `consecutiveWindows`  
**Severity:** Informational  
**Purpose:** Auto-resolve alerts when latency returns to healthy levels  
**Retention:** 90 days

#### `Monitoring.OperationLatency.InsufficientData`

**Trigger:** Monitoring window had fewer than 20 calls for an operation  
**Dimensions:** `operationName`, `sampleSize`, `minimumRequired`, `windowMinutes`  
**Severity:** Informational  
**Purpose:** Track low-volume windows that are skipped from alert evaluation to prevent false positives  
**Retention:** 30 days

#### `Monitoring.OperationLatency.Error`

**Trigger:** Error during latency monitoring execution for a specific operation  
**Dimensions:** `operationName`, `errorMessage`  
**Severity:** Error  
**Purpose:** Detect monitoring system failures  
**Alert:** Multiple errors in 1 hour  
**Retention:** 90 days

#### `Monitoring.OperationLatency.Complete`

**Trigger:** Monitoring cycle completed (every 10 minutes)  
**Dimensions:** `monitored` (count), `alerts` (count), `resolutions` (count), `insufficientData` (count), `durationMs`, `success`, `errorMessage` (if failed)  
**Severity:** Informational  
**Purpose:** Track monitoring job health and execution metrics  
**Alert:** Success rate <95% over 1 hour  
**Retention:** 30 days

---

### Internal / Diagnostics

#### `Telemetry.EventName.Invalid`

**Trigger:** Telemetry call with non-canonical event name  
**Dimensions:** `invalid_name`, `callsite`, `correlation_id`  
**Severity:** Error  
**Purpose:** Detect telemetry misuse; enforce naming convention  
**Alert:** Any occurrence (breaks observability)  
**Retention:** 90 days

---

## Adding New Events

### Process

1. Choose canonical name following `Domain.Subject.Action` pattern (2-3 PascalCase segments)
2. Add to `GAME_EVENT_NAMES` array in `shared/src/telemetryEvents.ts`
3. Document in this catalog (copy template below)
4. Update tests in `shared/test/telemetryEvents.test.ts`
5. Verify ESLint rule passes (`no-direct-track-event`)

### Template

```markdown
#### `New.Event.Name`

**Trigger:** When does this fire?  
**Dimensions:** `dimension1`, `dimension2`, `correlation_id`  
**Severity:** Informational | Warning | Error  
**Purpose:** Why do we track this?  
**Alert:** Alert threshold (if any)  
**Retention:** Days to keep data
```

---

## Querying in Application Insights

### Example: Movement Success Rate (Last 24h)

```kusto
customEvents
| where timestamp > ago(24h)
| where name in ("Navigation.Move.Success", "Navigation.Move.Blocked")
| summarize Success=countif(name == "Navigation.Move.Success"),
            Blocked=countif(name == "Navigation.Move.Blocked"),
            Total=Success + Blocked,
            SuccessRate = 100.0 * Success / (Total == 0 ? 1 : Total),
            BlockedRate = 100.0 * Blocked / (Total == 0 ? 1 : Total)
```

### Example: Blocked Reasons Breakdown (Last 24h)

```kusto
// Movement Blocked Reasons Breakdown - Last 24h
// Groups Navigation.Move.Blocked events by reason and calculates percentages
let timeRange = 24h;
let knownReasons = dynamic(['invalid-direction', 'from-missing', 'no-exit', 'move-failed']);
let reasonCounts = customEvents
| where timestamp > ago(timeRange)
| where name == 'Navigation.Move.Blocked'
| extend reason = tostring(customDimensions.reason)
| extend normalizedReason = iff(reason in (knownReasons), reason, 'other')
| summarize Count = count() by normalizedReason;
let totalCount = toscalar(reasonCounts | summarize sum(Count));
reasonCounts
| extend TotalCount = totalCount
| extend PercentageShare = round(100.0 * Count / iff(TotalCount == 0, 1, TotalCount), 2)
| extend IsHighConcentration = iff(PercentageShare > 50.0, '⚠️ HIGH', '')
| project 
    Reason = normalizedReason,
    Count,
    PercentageShare,
    Alert = IsHighConcentration
| order by Count desc
```

**Interpretation:**
- `invalid-direction` >30% → Tune direction normalization
- `no-exit` >40% → World connectivity gaps
- `from-missing` >5% → Data integrity issue (critical)
- `move-failed` >10% → System reliability concern
- Any reason >50% → Immediate investigation (⚠️ HIGH)

### Example: Direction Normalization Failures

```kusto
customEvents
| where timestamp > ago(7d)
| where name == "Navigation.Input.Parsed"
| where customDimensions.status == "unknown"
| summarize Count = count() by tostring(customDimensions.raw_input)
| order by Count desc
| take 20
```

### Example: P95 Latency by Operation

```kusto
customEvents
| where timestamp > ago(1h)
| where name in ("Player.Get", "Navigation.Move.Success", "Navigation.Move.Blocked", "Navigation.Look.Issued")
| extend latency = todouble(customDimensions.latency_ms)
| summarize P95 = percentile(latency, 95) by name
```

---

## Related Documentation

-   [Observability Overview](../observability.md) — High-level monitoring strategy
-   [Telemetry Implementation](../../shared/src/telemetryEvents.ts) — Event name registry
-   [ESLint Telemetry Rules](../../eslint-rules/telemetry-event-name.mjs) — Naming convention enforcement
-   [Application Insights Setup](../../README.md#telemetry-application-insights) — Azure configuration

---

### Dashboard Recommendations (M2 Observability)

| Panel                         | Query Basis                               | Purpose                                         | Refresh | Workbook File |
| ----------------------------- | ----------------------------------------- | ----------------------------------------------- | ------- | ------------- |
| Movement Success Rate         | Success vs Blocked events                 | Detect traversal friction & regressions         | 5 min   | [movement-success-rate-workbook.json](movement-success-rate-workbook.json) |
| Blocked Reasons Breakdown     | Navigation.Move.Blocked grouped by reason | Prioritize fixes (no-exit vs invalid-direction) | 5 min   | [movement-blocked-reasons.workbook.json](workbooks/movement-blocked-reasons.workbook.json) |
| Movement Latency Distribution | Success event latency_ms percentiles      | Monitor core loop responsiveness                | 5 min   | [#283](https://github.com/piquet-h/the-shifting-atlas/issues/283) |

> **Implementation**: Each panel derives from `customEvents` queries shown above with clear thresholds & annotations referencing issue [#10](https://github.com/piquet-h/the-shifting-atlas/issues/10).
> 
> **Workbook Files:**
> - **Movement Success Rate**: [movement-success-rate-workbook.json](./movement-success-rate-workbook.json) with import guide at [movement-success-rate-import-guide.md](./movement-success-rate-import-guide.md)
> - **Blocked Reasons Breakdown**: [movement-blocked-reasons.workbook.json](workbooks/movement-blocked-reasons.workbook.json) with setup instructions in [workbooks/README.md](workbooks/README.md)
> - **Other Workbooks**: See [docs/observability/workbooks/](workbooks/) directory for additional dashboards

**Last Updated:** 2025-11-08  
**Event Count:** 49 canonical events

## Deprecated Events

#### `Location.Move` (Deprecated 2025-10-30)

**Replaced By:** `Navigation.Move.Success`, `Navigation.Move.Blocked`  
**Status:** No longer emitted after migration in #10; retained in registry for historical query compatibility until data retention window (180 days) lapses.  
**Removal Target:** Not earlier than 2026-04-28 (post 180d) pending verification criteria below.  
**Dimensions (Historical):** `player_id`, `from_location_id`, `to_location_id`, `direction`, `status`, `reason`, `latency_ms`, `correlation_id`  
**Deprecation Rationale:** Split success vs failure semantics improves dashboard clarity and alert threshold calibration.  
**Verification Criteria Before Removal:**

-   [ ] No active workbooks or alerts reference `Location.Move`
-   [ ] 30d telemetry scan shows zero new occurrences
-   [ ] Dashboard panels for movement success & blocked reasons stable (>14d)
-   [ ] Lint rule updated (#TODO issue) to forbid new emissions
