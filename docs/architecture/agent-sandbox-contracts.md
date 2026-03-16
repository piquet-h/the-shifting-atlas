# Agent Sandbox: Contracts and Safety Gates

## What is the sandbox?

The **write-lite agent sandbox** is the controlled surface through which agents may affect world state. Agents are never trusted to write directly — they propose, the backend validates deterministically, and only accepted proposals become canonical. The "sandbox" name reflects its deliberate scope restriction: at this milestone, agents may only add or replace description layers and signal NPC dialogue. Structural mutations (exits, location topology, player inventory) are outside the allow-list entirely.

This is an **expanding surface**, not a permanent constraint. The allow-list (`PROPOSAL_ALLOWED_ACTION_TYPES` in `shared/src/agentProposal.ts`) grows as each new action type earns its safety gates. `NPC.Dialogue` is currently telemetry-only pending a persistence layer. Structural writes are deferred to a later milestone.

High-level design principles are in [`agentic-ai-and-mcp.md`](./agentic-ai-and-mcp.md). This document covers what is needed to understand, trace, and debug the sandbox in its current running state.

---

## Pipeline

```
SENSE (read via MCP tools or direct repo)
  ↓
DECIDE (agent or autonomous step loop)
  ↓
PROPOSE (AgentProposalEnvelope)
  ↓
VALIDATE (safeValidateAgentProposal — two phases: Zod schema, then deterministic rules)
  ├─ schema invalid → 400 SchemaInvalid (HTTP) / telemetry + early return (queue)
  ├─ rules rejected → 200 rejected + RejectedProposalAuditRecord (never mutates state)
  └─ accepted
        ↓
     APPLY (AgentProposalApplicator → ILayerRepository write)
```

Two entry paths share the same validator and the same write gate:

| Path | Entry point | Caller |
|------|------------|--------|
| **HTTP** | `POST /api/agent/propose` | External agents (Azure AI Foundry, etc.) |
| **Queue** | `World.Agent.Step` → `AgentStepHandler` | Autonomous internal step loop |

Schema and rule validation are both in `shared/src/agentProposal.ts`. The complete field shapes and rejection codes are readable there directly — the Zod schema, `PROPOSAL_ALLOWED_ACTION_TYPES` constant, `PARAM_RULES` record, and `ProposalRejectionCode` enum are the authoritative definitions and are not duplicated here.

---

## Key design decisions (not obvious from the code)

**Rejected proposals return HTTP 200, not 4xx.** Schema failures return 400 because the agent produced structurally broken output. Rule failures (scope, missing params) return 200 with `outcome: 'rejected'` because the envelope was valid — the agent understood the contract but its proposal was denied. Both outcomes are non-mutating.

**Scope is bounded to `loc:` and `player:` prefixes.** `global:` writes are reserved for system/timer events. This is enforced in both the Zod schema (refine) and the rules validator, so it fails at the earliest possible gate.

**The internal step loop does not call MCP tools for its sense phase.** `AgentStepHandler` reads `ILayerRepository` and `WorldClockService` directly via DI injection. Using MCP tools for internal reads would add JSON-RPC overhead with no benefit; the queue handler operates within the trust boundary where direct repository access is appropriate.

**`Ambience.Generate` content is deterministic by design.** `pickAmbientContent(locationId, salt)` uses a djb2 hash so the same `(locationId, salt)` always yields the same phrase. This makes the action safe to replay without producing divergent world state.

---

## Autonomous step loop (`World.Agent.Step`)

The loop runs SENSE → DECIDE → VALIDATE → APPLY per queue message. The oscillation guard (checking for an existing ambient layer before proposing) prevents the loop from overwriting its own output across successive steps.

The payload schema, idempotency key format, and latency budget configuration are documented in the file-level JSDoc of `backend/src/worldEvents/handlers/AgentStepHandler.ts`.

---

## Tracing and debugging

All sandbox events carry `correlationId`. To reconstruct a step end-to-end, query Application Insights by `correlationId`.

### Queue path event sequence

| Event | Emitted when |
|-------|-------------|
| `Agent.Step.SenseCompleted` | Always — after loading ambient layer and tick |
| `Agent.Step.Skipped` | Ambient layer already exists (oscillation guard) |
| `Agent.Step.DecisionMade` | New action proposed |
| `Agent.Step.ActionRejected` | Proposal rejected by validator |
| `Agent.Step.ActionApplied` | Action written to world |
| `Agent.Step.LatencyExceeded` | Step took longer than budget (non-fatal) |
| `Agent.Step.Processed` | Always — final summary with outcome and latency |

### HTTP path event sequence

| Event | Emitted when |
|-------|-------------|
| `Agent.Proposal.SchemaInvalid` | 400 — body failed Zod parse |
| `Agent.Proposal.Received` | Always after schema passes |
| `Agent.Proposal.Accepted` | Validation passed |
| `Agent.Proposal.Rejected` | Rules rejected |

Event properties (dimensions) are documented with each entry in `shared/src/telemetryEvents.ts`.

### Debugging a rejection

1. Find `Agent.Proposal.Rejected` or `Agent.Step.ActionRejected` by `correlationId`.
2. For **HTTP**: the response body contains a `RejectedProposalAuditRecord` with the full `rejectionReasons` array; each reason includes `code`, `message`, and `actionType`.
3. For **queue steps**: the Function invocation log includes the full `reasons` array via `context.warn(...)`.

### Replay harness

`AgentReplayHarness` (in `backend/src/services/AgentReplayHarness.ts`) re-runs a stored sequence of proposals through the same validation+apply pipeline without live infrastructure. It is available in any DI container (including test containers) via `container.get(AgentReplayHarness)`.

**Usage**

```typescript
import { AgentReplayHarness, type ProposalRecord } from '../services/AgentReplayHarness.js'

const harness = container.get(AgentReplayHarness)

const records: ProposalRecord[] = [
    {
        // raw proposal — may be unknown/malformed; the harness validates it
        proposal: storedEnvelope,
        // world-clock tick to use when applying
        tick: 42,
        // optional: declare what you expected to happen for diff analysis
        expectedEffects: [
            { actionType: 'Layer.Add', scopeKey: 'loc:<uuid>', applied: true }
        ]
    }
]

const report = await harness.replaySequence(records)
```

**`ReplayReport` shape**

| Field | Description |
|-------|-------------|
| `totalSteps` | Number of records in the input sequence |
| `successCount` | Steps accepted and applied |
| `rejectedCount` | Steps that passed schema validation but failed business rules |
| `schemaErrorCount` | Steps where the proposal was missing or schema-invalid |
| `duplicateDeliveries` | Records sharing an idempotency key with a prior record |
| `steps` | `StepReplayResult[]` — one entry per input record |
| `correlationChain` | All `correlationId` / `causationId` pairs, in step order |
| `failureReasons` | Human-readable strings, one per rejected / schema-invalid step |

Each `StepReplayResult` includes:
- `validationOutcome` — `'accepted'`, `'rejected'`, or `'schema-invalid'`
- `appliedEffects` — `ActionApplicationResult[]` (empty when not applied)
- `diffs` — `EffectDiff[]` comparing `expectedEffects` against actuals (`match: true/false`)
- `rejectionReasons` — `ProposalRejectionReason[]` (when rejected)
- `failureReason` — plain-text summary (when rejected or schema-invalid)
- `correlationId` / `causationId` — from the envelope (undefined for schema-invalid steps)

**Edge cases handled automatically**

| Scenario | Outcome |
|----------|---------|
| `null` / missing record in sequence | `schema-invalid` step; `failureReason` set |
| Proposal fails Zod schema | `schema-invalid` step; no apply attempted |
| Proposal fails business rules (e.g. missing `locationId`) | `rejected` step; `rejectionReasons` populated |
| Duplicate `idempotencyKey` across records | Both steps still attempt apply; `duplicateDeliveries` incremented |
| No `expectedEffects` provided | `diffs` field is `undefined` (no diff computed) |
| Empty sequence | Returns a zeroed `ReplayReport` without error |

**Relationship to live production flow**

The harness calls the same `AgentProposalApplicator.apply()` that the live queue handler uses, so replaying against a fresh in-memory repository produces identical layer writes to what the original run produced. The only difference is the repository starts empty (or whatever state you seed it with) rather than reflecting production data.

### Prompt version / hash changes and replay

The autonomous step loop is unaffected by prompt template changes — it selects content deterministically from `AMBIENT_POOL` with no external model call. For Foundry-hosted agents that produce proposals via LLM, a prompt change may yield different `layerContent`; since the idempotency key is based on `proposalId` (a UUID per Foundry invocation), each call is treated as a distinct proposal regardless of prompt version.

---

## MCP tool boundary

MCP tools are **read-only**. The full tool catalog is in [`agentic-ai-and-mcp.md`](./agentic-ai-and-mcp.md#mcp-tool-catalog-implemented-today). Relevant tools for the sense phase:

- `WorldContext-getLocationContext` — location state, exits, realms, active layers
- `WorldContext-getAtmosphere` — current ambient layer content
- `WorldContext-getRecentEvents` — recent scope events (helps avoid redundant proposals)
- `Lore-*` — canonical lore facts for narrative coherence

There is no write-capable MCP server. All agent-sourced mutations flow through `AgentProposalApplicator`, which writes only to `ILayerRepository`. Direct graph mutations (exits, locations) are outside the current allow-list.

---

## Related runbook

[Agent Failure Taxonomy & DLQ/Replay Runbook](../observability/agent-failure-taxonomy.md) — failure categories, DLQ triage steps, replay workflow, and KQL queries for incident investigation.

## Source files

- `shared/src/agentProposal.ts` — envelope schema, allow-list, param rules, rejection codes, validator
- `backend/src/worldEvents/handlers/AgentStepHandler.ts` — autonomous step loop
- `backend/src/services/AgentProposalApplicator.ts` — write gate
- `backend/src/services/AgentReplayHarness.ts` — replay harness (debug / test tooling)
- `backend/src/handlers/agentPropose.ts` — HTTP endpoint
- `shared/src/telemetryEvents.ts` — canonical event names and dimension docs
