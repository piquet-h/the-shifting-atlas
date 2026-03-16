# Agent Sandbox: Failure Taxonomy & DLQ/Replay Runbook

> **WAF Pillars**: Reliability (failure isolation, graceful degradation) · Operational Excellence (repeatable triage, observable pipelines)

**Purpose**: Make debugging emergent agent sandbox behavior repeatable and safe. This document covers how failures are classified, how to triage them from the dead-letter queue, and how to replay a sequence to understand root cause.

**Prerequisites**:

- [Agent Sandbox Contracts](../architecture/agent-sandbox-contracts.md) — pipeline stages, telemetry events, rejection codes
- [Dead-Letter Storage & Redaction](../architecture/dead-letter-storage.md) — DLQ schema, query script, retry policy
- [Agent Sandbox Dashboard](#dashboard--query-links) — Azure Portal workbook with DLQ panels

---

## Failure Taxonomy

The sandbox has five distinct failure categories. Each has a different root cause, different telemetry signature, and a different remediation path.

### 1 · Schema Violations

**What it means**: The agent produced output that failed the Zod schema parse (`AgentProposalEnvelopeSchema`). The envelope is structurally broken — missing required fields, wrong types, or an unrecognised `actionType`.

**Telemetry signature**:

| Event | Path | Dimensions |
|-------|------|-----------|
| `Agent.Proposal.SchemaInvalid` | HTTP path | `correlationId`, `issueCount` |
| `World.Event.DeadLettered` | Queue path | `errorCode: 'schema-validation'`, `eventType`, `correlationId` |

**Permanent / transient**: **Permanent** — the message is dead-lettered immediately; no retry is attempted.

**Common causes**:
- Agent model produced malformed JSON (truncated output, markdown fencing left in)
- Prompt template updated but `actionType` allow-list in `PROPOSAL_ALLOWED_ACTION_TYPES` not yet updated in `shared/src/agentProposal.ts`
- Breaking schema change deployed to `shared` without re-testing the agent's output shape

**First-look queries** (Application Insights):

```kusto
// Recent schema violations
customEvents
| where timestamp > ago(1h)
| where name == "Agent.Proposal.SchemaInvalid" or
        (name == "World.Event.DeadLettered" and tostring(customDimensions.errorCode) == "schema-validation")
| project timestamp,
    correlationId = tostring(customDimensions.correlationId),
    issueCount = toint(customDimensions.issueCount),
    eventType = tostring(customDimensions.eventType)
| order by timestamp desc
```

**DLQ query**:

```bash
npm run query:deadletters -- \
  --start "2025-10-31T00:00:00Z" --end "2025-10-31T23:59:59Z" \
  --error-code schema-validation
```

---

### 2 · Validation Rejects

**What it means**: The envelope passed schema parse but failed the deterministic business-rule check (`validateAgentProposal`). The proposal was understood by the system but denied — it violated the allow-list, used a forbidden scope key, or omitted a required parameter.

**Telemetry signature**:

| Event | Path | Dimensions |
|-------|------|-----------|
| `Agent.Proposal.Rejected` | HTTP path | `proposalId`, `rejectionCount`, `proposalCorrelationId` |
| `Agent.Step.ActionRejected` | Queue path | `entityId`, `proposalId`, `rejectionCount`, `firstRejectionCode`, `correlationId` |

**Permanent / transient**: **Permanent** — rejection is deterministic. Replaying the same envelope against the same rules will produce the same outcome.

**Common causes**:
- `actionType` not in `PROPOSAL_ALLOWED_ACTION_TYPES` (e.g., structural write attempted before allow-list expanded)
- `scopeKey` prefix not `loc:` or `player:` (global scope reserved for system/timer events)
- Required `params` field missing for the given action type (checked via `PARAM_RULES` in `shared/src/agentProposal.ts`)

**How to read the rejection reason**:

- **HTTP path**: The `400` / `200 rejected` response body contains a `RejectedProposalAuditRecord` with a `rejectionReasons` array. Each entry has `code`, `message`, and `actionType`.
- **Queue path**: `context.warn(...)` in the Function invocation log lists the full `reasons` array. Also visible in `Agent.Step.ActionRejected` with `firstRejectionCode`.

**First-look query**:

```kusto
// Rejection breakdown by code over last 24h
customEvents
| where timestamp > ago(24h)
| where name == "Agent.Step.ActionRejected" or name == "Agent.Proposal.Rejected"
| summarize count() by
    rejectionCode = tostring(customDimensions.firstRejectionCode),
    bin(timestamp, 1h)
| render timechart
```

---

### 3 · Oscillation Loops

**What it means**: The agent step loop is repeatedly triggered for a location that already has an ambient layer. Each step is a no-op (safe), but the volume indicates a scheduling bug or a world-clock tick that is not advancing.

**Telemetry signature**:

| Event | Path | Dimensions |
|-------|------|-----------|
| `Agent.Step.Skipped` | Queue path | `entityId`, `locationId`, `reason: 'ambient-layer-exists'`, `correlationId` |

**Permanent / transient**: Neither — it is a sentinel that the oscillation guard is working correctly. Frequent skips are operationally noisy but not harmful to world state.

**Common causes**:
- Service Bus message scheduled with a repeat interval that is shorter than the ambient layer TTL
- World-clock tick frozen (clock service failing silently), so the same tick is returned on every sense phase and the existing layer never expires
- Multiple agents assigned to the same location without coordination

**First-look query**:

```kusto
// Oscillation rate by location — top 10 most-skipped locations
customEvents
| where timestamp > ago(1h)
| where name == "Agent.Step.Skipped"
| where tostring(customDimensions.reason) == "ambient-layer-exists"
| summarize skipCount = count() by locationId = tostring(customDimensions.locationId)
| top 10 by skipCount desc
```

**Triage heuristic**: If a location shows >10 skips per hour and the world clock is advancing normally (check `WorldClock.Tick.Advanced` events), the scheduling interval is too aggressive. If the clock is not advancing, investigate `WorldClockService`.

---

### 4 · Timeouts (Latency Budget Exceeded)

**What it means**: The agent step completed its work but took longer than `AGENT_STEP_LATENCY_BUDGET_MS` (default 5 000 ms). The step is **not** failed — it finishes and applies its effect — but the latency warning fires to surface degraded throughput.

**Telemetry signature**:

| Event | Path | Dimensions |
|-------|------|-----------|
| `Agent.Step.LatencyExceeded` | Queue path | `entityId`, `entityKind`, `latencyMs`, `budgetMs`, `correlationId` |

**Permanent / transient**: **Transient** — step still succeeds. Sustained budget overruns may indicate capacity or dependency issues.

**Common causes**:
- `ILayerRepository` Cosmos read/write is slow (hot partition, high RU contention)
- `WorldClockService.getCurrentTick()` blocked on a cold-start or contended resource
- Service Bus lock duration (30 s) insufficient for the actual p95 latency — message redelivered before function completes

**First-look query**:

```kusto
// p50 and p95 step latency — last 6h
customEvents
| where timestamp > ago(6h)
| where name == "Agent.Step.Processed"
| summarize
    p50 = percentile(todouble(customDimensions.latencyMs), 50),
    p95 = percentile(todouble(customDimensions.latencyMs), 95)
    by bin(timestamp, 30m)
| render timechart
```

**Also see**: The **Step Latency Percentiles by Agent Type** and **Latency Budget Exceeded** panels in the [Agent Sandbox Dashboard](#dashboard--query-links).

**Tuning**: Adjust the budget via `AGENT_STEP_LATENCY_BUDGET_MS` in the Function app environment variables (not in code). No deployment required — Function app restart picks it up.

---

### 5 · Dependency Throttling

**What it means**: A downstream dependency (Cosmos DB SQL API) returned a 429 or a transient failure. The world event processor retries with exponential backoff (up to 4 times). If all retries exhaust, the message lands in the Service Bus built-in dead-letter queue.

**Telemetry signature**:

| Event | Dimensions |
|-------|-----------|
| `World.Event.DeadLettered` | `errorCode: 'handler-error'`, `retryCount: 4`, `finalError` (truncated to 200 chars), `correlationId` |

**Permanent / transient**: **Transient** — the cause (throttle) resolves when load drops. Messages are **replay-eligible** once capacity recovers.

**Retry schedule** (from `host.json` + Service Bus `maxDeliveryCount: 5`):

| Attempt | Delay |
|---------|-------|
| 1 | 1 s |
| 2 | 2 s |
| 3 | 4 s |
| 4 | 8 s |
| 5 (max) | Dead-lettered |

**First-look query**:

```kusto
// Handler errors with retry counts — potential throttle victims
customEvents
| where timestamp > ago(6h)
| where name == "World.Event.DeadLettered"
| where tostring(customDimensions.errorCode) == "handler-error"
| project timestamp,
    retryCount = toint(customDimensions.retryCount),
    finalError = tostring(customDimensions.finalError),
    eventType = tostring(customDimensions.eventType),
    correlationId = tostring(customDimensions.correlationId)
| order by timestamp desc
```

**DLQ query**:

```bash
npm run query:deadletters -- \
  --start "2025-10-31T00:00:00Z" --end "2025-10-31T23:59:59Z" \
  --error-code handler-error
```

---

## DLQ Triage Runbook

Use this runbook when the **DLQ Entries for Agent Events** panel in the Agent Sandbox Dashboard shows a spike, or when an alert fires on `World.Event.DeadLettered`.

### Step 1 — Orient: understand the scope

```bash
# Summary statistics for the incident window
npm run query:deadletters -- \
  --start "<incident-start-iso>" \
  --end "<incident-end-iso>" \
  --summary
```

The summary output breaks down records by `errorCode`. This immediately tells you:

- `schema-validation` or `json-parse` → **permanent** — schema/code fix required before replay
- `handler-error` → **transient** — investigate dependency health, then replay
- `unknown` → inspect individual records

Also run a quick application-level check:

```kusto
// Failure volume by category — last window
customEvents
| where timestamp between(datetime('<incident-start>') .. datetime('<incident-end>'))
| where name == "World.Event.DeadLettered"
| summarize count() by errorCode = tostring(customDimensions.errorCode), eventType = tostring(customDimensions.eventType)
| order by count_ desc
```

### Step 2 — Inspect individual records

```bash
# Full record details for the window
npm run query:deadletters -- \
  --start "<incident-start-iso>" \
  --end "<incident-end-iso>" \
  --limit 20

# Or retrieve a specific record by ID
npm run query:deadletters -- --id "<dead-letter-record-id>"
```

Look for:
- `failureReason` — plain-text description written at dead-letter time
- `redactedEnvelope._fields` — which payload fields were present
- `error.issues` — Zod validation issues (schema violations)
- `originalCorrelationId` — use this to trace the full pipeline in Application Insights

```kusto
// Full step trace by correlationId
customEvents
| where tostring(customDimensions.correlationId) == "<originalCorrelationId>"
| project timestamp, name, customDimensions
| order by timestamp asc
```

### Step 3 — Classify and decide

| Error code | Root cause confirmed? | Action |
|------------|-----------------------|--------|
| `schema-validation` | Yes (malformed output) | Fix schema / prompt; do **not** replay old records |
| `json-parse` | Yes (corrupted message) | Discard; investigate message producer |
| `handler-error` | Yes (dependency recovered) | Replay via `AgentReplayHarness` |
| `handler-error` | Dependency still unhealthy | Wait for recovery, then replay |
| `unknown` | No | Inspect individual record; escalate if needed |

### Step 4 — Replay (transient failures only)

See [Replay Workflow](#replay-workflow) below.

### Step 5 — Close out

After replay:

1. Re-run the summary query (Step 1) for the same window — confirm no new dead-letters for the same event type.
2. Check the **Applied Effects Trend** panel in the Agent Sandbox Dashboard to verify expected layer writes resumed.
3. If the incident was caused by a code bug, file a follow-up issue and link it to the dead-letter records by `correlationId`.

---

### What NOT to do

| Anti-pattern | Why |
|---|---|
| Replay `schema-validation` records without fixing the schema first | They will fail again with the same error |
| Replay records while the dependency is still throttling | They will be re-dead-lettered, making the DLQ noisier |
| Delete dead-letter records before investigating | Redacted records are the only post-mortem trace |
| Replay records in production to test a schema fix | Use the in-memory replay harness (see below) in a test context first |
| Ignore `unknown` error codes | These indicate unexpected code paths; silent discard loses signal |

---

## Replay Workflow

`AgentReplayHarness` re-runs a stored sequence of proposals through the same validation + apply pipeline without live infrastructure. Use it to:

- Reproduce a failure locally before deploying a fix
- Verify a schema/rule fix will accept previously rejected records
- Audit the correlation chain of a multi-step agent run

### Basic usage

```typescript
import { AgentReplayHarness, type ProposalRecord } from '../services/AgentReplayHarness.js'

const harness = container.get(AgentReplayHarness)

// Construct records from dead-letter data or stored proposal logs
const records: ProposalRecord[] = [
    {
        proposal: storedEnvelope,   // raw proposal (may be unknown/malformed — harness validates)
        tick: 42,                   // world-clock tick to use when applying
        expectedEffects: [
            { actionType: 'Layer.Add', scopeKey: 'loc:<uuid>', applied: true }
        ]
    }
]

const report = await harness.replaySequence(records)
console.log(report)
```

### Reading the `ReplayReport`

| Field | Description |
|-------|-------------|
| `totalSteps` | Records submitted |
| `successCount` | Accepted and applied |
| `rejectedCount` | Schema-valid but rule-rejected |
| `schemaErrorCount` | Structurally invalid (missing or malformed) |
| `duplicateDeliveries` | Records sharing an idempotency key |
| `correlationChain` | All `correlationId` / `causationId` pairs in order |
| `failureReasons` | Plain-text summary per rejected / schema-invalid step |

Each `StepReplayResult` includes `validationOutcome`, `rejectionReasons`, `appliedEffects`, and `diffs` (when `expectedEffects` are declared).

### Interpreting diffs

When `expectedEffects` are provided, each `diffs` entry reports `match: true` or `match: false`. A `match: false` with `applied: true` expected but `applied: false` actual means the replay environment started with different state than the original run (e.g., the layer already existed in the seed). This is expected if you are replaying against a fresh in-memory repository without seeding the prior world state.

### Partial-telemetry replay (missing correlation chain)

If dead-letter records are missing `correlationId` or `causationId` (partial telemetry), the harness still processes them — it records `undefined` in the `correlationChain` array. To reconstruct the causal order when correlation data is incomplete:

1. Sort records by `deadLetteredUtc` as a proxy for processing order
2. Use `firstAttemptTimestamp` (if set) for a tighter ordering
3. Inspect `originalCorrelationId` in the dead-letter record — this is preserved even when the envelope correlation fields are absent
4. Treat the resulting chain as approximate; document the gap in any post-mortem

```kusto
// Find events with partial correlation data in the incident window
customEvents
| where timestamp between(datetime('<start>') .. datetime('<end>'))
| where name startswith "Agent."
| where isempty(tostring(customDimensions.correlationId))
| project timestamp, name, customDimensions
| order by timestamp asc
```

---

## Dashboard & Query Links

### Agent Sandbox Dashboard

**Location**: Azure Portal → Application Insights → Workbooks → *Agent Sandbox Dashboard*

**Key panels for incident triage**:

| Panel | What to look at |
|-------|----------------|
| Step Latency Percentiles by Agent Type | p95 spikes indicate dependency slowdowns |
| Latency Budget Exceeded (1h buckets) | Sustained budget overruns before incident window |
| Proposal Outcomes Summary | Rejection rate vs acceptance rate |
| Top Rejection Reason Codes | Which `ProposalRejectionCode` is firing most |
| DLQ Entries for Agent Events | Volume trend; filter by `eventType` |
| DLQ Volume Trend for Agent Events | Spike pattern vs gradual rise |
| **DLQ Entries by Error Code (Permanent vs Transient)** | First stop when alert fires — classifies failures immediately |
| **Oscillation Guard: Top Skipped Locations** | Locations with the most no-op steps — spot scheduling bugs |
| **Schema Violations Trend (1h buckets)** | Agent output quality over time — tracks model/prompt regressions |

**Definition file**: `docs/observability/workbooks/agent-sandbox-dashboard.workbook.json`

### Alert

The **Agent Sandbox DLQ Spike** alert (`infrastructure/alert-agent-dlq-spike.bicep`) fires when `World.Agent.*` dead-letter entries exceed 5 in a 5-minute window. See [alerts-catalog.md § Agent Sandbox DLQ Spike](./alerts-catalog.md) for configuration parameters and escalation path.

### Key KQL queries (Application Insights)

**All agent events for a correlation ID** (full trace reconstruction):

```kusto
customEvents
| where tostring(customDimensions.correlationId) == "<correlationId>"
| project timestamp, name, customDimensions
| order by timestamp asc
```

**Dead-letter rate by category (last 24h)**:

```kusto
customEvents
| where timestamp > ago(24h)
| where name == "World.Event.DeadLettered"
| summarize count() by
    tostring(customDimensions.errorCode),
    bin(timestamp, 1h)
| render timechart
```

**Oscillation guard trigger rate by location**:

```kusto
customEvents
| where timestamp > ago(6h)
| where name == "Agent.Step.Skipped"
| summarize skipCount = count() by locationId = tostring(customDimensions.locationId)
| top 20 by skipCount desc
```

**Proposal outcome funnel (last 24h)**:

```kusto
customEvents
| where timestamp > ago(24h)
| where name in ("Agent.Proposal.Received", "Agent.Proposal.Accepted", "Agent.Proposal.Rejected", "Agent.Proposal.SchemaInvalid")
| summarize count() by name
| render piechart
```

**Step latency percentiles over time**:

```kusto
customEvents
| where timestamp > ago(6h)
| where name == "Agent.Step.Processed"
| summarize
    p50 = percentile(todouble(customDimensions.latencyMs), 50),
    p95 = percentile(todouble(customDimensions.latencyMs), 95)
    by bin(timestamp, 30m), agentType = tostring(customDimensions.entityKind)
| render timechart
```

### DLQ query script

```bash
# All records for a window (formatted text)
npm run query:deadletters -- --start "<ISO>" --end "<ISO>"

# Summary statistics only
npm run query:deadletters -- --start "<ISO>" --end "<ISO>" --summary

# Filter to handler errors (replay-eligible)
npm run query:deadletters -- --start "<ISO>" --end "<ISO>" --error-code handler-error

# Filter to schema failures (permanent)
npm run query:deadletters -- --start "<ISO>" --end "<ISO>" --error-code schema-validation

# Retrieve single record by ID
npm run query:deadletters -- --id "<dead-letter-record-id>"

# JSON output (for piping or scripting)
npm run query:deadletters -- --start "<ISO>" --end "<ISO>" --json
```

---

## Related Documentation

- [Agent Sandbox Contracts](../architecture/agent-sandbox-contracts.md) — pipeline stages, replay harness API, rejection codes
- [Dead-Letter Storage & Redaction](../architecture/dead-letter-storage.md) — DLQ schema, storage configuration, operational procedures
- [Agentic AI & MCP Architecture](../architecture/agentic-ai-and-mcp.md) — agent entry points and MCP tool boundary
- [Telemetry Catalog](./telemetry-catalog.md) — canonical event definitions with dimension docs
- [Alerts Catalog § Agent Sandbox DLQ Spike](./alerts-catalog.md) — alert configuration and escalation path
- Workbook: `docs/observability/workbooks/agent-sandbox-dashboard.workbook.json` — live panels for all failure categories
- Alert Bicep: `infrastructure/alert-agent-dlq-spike.bicep` — agent DLQ spike detection
- Source: `shared/src/agentProposal.ts` — allow-list, param rules, rejection code enum
- Source: `backend/src/worldEvents/handlers/AgentStepHandler.ts` — queue step loop, oscillation guard, telemetry
- Source: `backend/src/services/AgentReplayHarness.ts` — replay harness implementation
