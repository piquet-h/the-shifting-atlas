# Agent Sandbox Contracts and Safety Gates

Concrete implementation reference for the write-lite agent sandbox.
High-level design is in [`agentic-ai-and-mcp.md`](./agentic-ai-and-mcp.md); this document covers the specific schemas, rules, telemetry events, and debugging workflow that are already running in code.

---

## 1. Pipeline Overview

```
SENSE (read via MCP tools)
  ↓
DECIDE (agent or step loop)
  ↓
PROPOSE (AgentProposalEnvelope)
  ↓
VALIDATE (safeValidateAgentProposal)
  ├─ schema invalid → 400 SchemaInvalid (HTTP) / telemetry + early return (queue)
  ├─ rules rejected → 200 rejected + RejectedProposalAuditRecord
  └─ accepted
        ↓
     APPLY (AgentProposalApplicator → ILayerRepository write)
```

Two entry paths share the same validator but differ in how they enter:

| Path | Entry point | Who calls it |
|------|------------|--------------|
| **HTTP** | `POST /api/agent/propose` | External agents (Azure AI Foundry, etc.) |
| **Queue** | `World.Agent.Step` event → `AgentStepHandler` | Autonomous internal step loop |

Both paths call `safeValidateAgentProposal()` (shared package) and delegate writes to `AgentProposalApplicator`.

---

## 2. Proposal Envelope Schema

Source: `shared/src/agentProposal.ts` (`AgentProposalEnvelopeSchema`).

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `proposalId` | UUID string | ✅ | Unique per proposal; used in idempotency key |
| `version` | positive integer | ✅ | Schema version; currently `1` |
| `issuedUtc` | ISO 8601 datetime | ✅ | When the agent issued the proposal; used for decision-latency telemetry |
| `actor.kind` | `'ai' \| 'npc' \| 'system'` | ✅ | Players submit commands; agents use `ai` or `npc` |
| `actor.id` | UUID string | ❌ | Optional actor identifier |
| `intent` | ActionIntent | ❌ | Carried for traceability; not re-validated |
| `correlationId` | UUID string | ✅ | Propagated through telemetry chain |
| `causationId` | UUID string | ❌ | ID of the world event or request that triggered this proposal |
| `idempotencyKey` | non-empty string | ✅ | Use `buildProposalIdempotencyKey(proposalId, actionType, scopeKey)` |
| `proposedActions` | non-empty array of ProposedAction | ✅ | At least one action required |

### ProposedAction schema

| Field | Type | Constraint |
|-------|------|------------|
| `actionType` | string | Must be one of `PROPOSAL_ALLOWED_ACTION_TYPES` |
| `scopeKey` | string | Must match `/^(loc|player):/` — `global:` writes are not permitted |
| `params` | `Record<string, unknown>` | Action-specific; see Section 3 |

### Idempotency key format

```
proposal:<proposalId>:<actionType>:<scopeKey>
```

Compose using `buildProposalIdempotencyKey(proposalId, actionType, scopeKey)` from `@piquet-h/shared`.

For autonomous steps the key follows: `agent-step:<entityId>:<stepSequence>` (set in the `WorldEventEnvelope.idempotencyKey`).

---

## 3. Allow-listed Action Types and Parameter Rules

Source: `PROPOSAL_ALLOWED_ACTION_TYPES` and `PARAM_RULES` in `shared/src/agentProposal.ts`.

Structural world mutations (exits, locations) are excluded until a later milestone.

### `Layer.Add`

Adds or replaces a description layer on a location.

| Param | Required | Notes |
|-------|----------|-------|
| `locationId` | ✅ | Target location UUID |
| `layerContent` | ✅ | Text content for the layer |
| `layerType` | ❌ | Defaults to `'ambient'` |

Applied by: `AgentProposalApplicator.applyLayerAdd()` → `ILayerRepository.setLayerForLocation()`.
Layer metadata: `authoredBy: 'agent'`, `proposalScope: action.scopeKey`.

### `Ambience.Generate`

Creates an ambient description layer using deterministic content selection.

| Param | Required | Notes |
|-------|----------|-------|
| `locationId` | ✅ | Target location UUID |
| `content` | ❌ | Override text; if absent, content is selected deterministically from `AMBIENT_POOL` via djb2 hash of `${locationId}:${salt}` |

Determinism guarantee: for any fixed `(locationId, salt)` pair, `pickAmbientContent()` always returns the same phrase from the pool. This makes the action idempotency-friendly under replay.

### `NPC.Dialogue`

Records that dialogue was triggered. Persistence is deferred to a later milestone.

| Param | Required | Notes |
|-------|----------|-------|
| `npcId` | ✅ | UUID of the NPC |
| `line` | ❌ | Dialogue text (carried in telemetry only) |

Applied by: `AgentProposalApplicator.applyNpcDialogue()` → emits `World.Event.Processed` telemetry; no durable write.

---

## 4. Validator Rules and Rejection Codes

Source: `validateAgentProposal()` and `safeValidateAgentProposal()` in `shared/src/agentProposal.ts`.

Two-phase validation:
1. **Schema phase** (`AgentProposalEnvelopeSchema.safeParse`) — Zod; rejects unknown action types, missing fields, malformed UUIDs.
2. **Rules phase** (`validateAgentProposal`) — deterministic; checks scope and required params per action.

The rules phase iterates `proposedActions`; scope is checked first per action. If scope fails, param rules for that action are skipped.

### Rejection codes

| Code | Meaning |
|------|---------|
| `SCHEMA_INVALID` | Body does not parse as `AgentProposalEnvelope` (schema phase only) |
| `OUT_OF_SCOPE` | `scopeKey` does not match `/^(loc|player):/` |
| `DISALLOWED_ACTION_TYPE` | `actionType` is not in `PROPOSAL_ALLOWED_ACTION_TYPES` |
| `MISSING_REQUIRED_PARAM` | A required `params` field is absent or falsy |

### HTTP response codes

| Outcome | HTTP status | Body |
|---------|-------------|------|
| Schema invalid | 400 | `{ error: 'SchemaInvalid', message: '...' }` |
| Rules rejected | 200 | `{ outcome: 'rejected', proposalId, rejectionReasons, auditRecord }` |
| Accepted | 200 | `{ outcome: 'accepted', proposalId, rejectionReasons: [] }` |

Rejected proposals are recorded as `RejectedProposalAuditRecord` (`shared/src/agentProposal.ts`):

```ts
{
  proposalId: string
  proposal: AgentProposalEnvelope
  validationResult: ProposalValidationResult
  auditedUtc: string
}
```

Rejected proposals **never mutate world state**.

---

## 5. Autonomous Step Loop (`World.Agent.Step`)

Source: `backend/src/worldEvents/handlers/AgentStepHandler.ts`.

The loop follows SENSE → DECIDE → VALIDATE → APPLY per queue message. Oscillation is prevented by checking for an existing ambient layer before proposing.

### Payload schema

| Field | Type | Required |
|-------|------|----------|
| `entityId` | UUID string | ✅ |
| `entityKind` | `'npc' \| 'ai-agent' \| 'player'` | ✅ |
| `locationId` | UUID string | ✅ |
| `stepSequence` | number | ✅ |
| `reason` | string | ❌ |

Missing any required field → `validation-failed` → DLQ.

### Phase description

| Phase | What happens |
|-------|-------------|
| **Sense** | Load current world tick + active `ambient` layer for `locationId` |
| **Decide** | Ambient layer exists → skip (oscillation guard). No layer → propose `Layer.Add` with deterministic content |
| **Validate** | Call `validateAgentProposal()`; rejection emits `Agent.Step.ActionRejected` and returns without writing |
| **Apply** | Delegate to `AgentProposalApplicator.apply()` → durable layer write |

### Latency budget

Configurable via `AGENT_STEP_LATENCY_BUDGET_MS` environment variable (default: 5000 ms). Exceeding the budget emits `Agent.Step.LatencyExceeded` but the step still completes — agent logic must remain idempotent.

---

## 6. Replay and Debugging

### Idempotency

Both paths are idempotency-safe:
- Duplicate queue deliveries use `WorldEventEnvelope.idempotencyKey` (`agent-step:<entityId>:<stepSequence>`) to return `noop`.
- Duplicate HTTP proposals with the same `proposalId` + `actionType` + `scopeKey` produce the same idempotency key; the layer repository uses `setLayerForLocation` which overwrites rather than duplicates.
- `Ambience.Generate` content is deterministic: the same `(locationId, salt)` always returns the same phrase from `AMBIENT_POOL`.

### Tracing a step through telemetry

All events carry `correlationId` (and `causationId` where applicable). To reconstruct a full step, query Application Insights by `correlationId`.

#### Queue path telemetry sequence

| Event | Properties | Emitted when |
|-------|-----------|--------------|
| `Agent.Step.SenseCompleted` | `entityId`, `locationId`, `hasAmbientLayer`, `tick` | Always after sense |
| `Agent.Step.Skipped` | `entityId`, `locationId`, `reason: 'ambient-layer-exists'` | Ambient layer found |
| `Agent.Step.DecisionMade` | `entityId`, `locationId`, `actionType`, `reason: 'no-ambient-layer'` | New action proposed |
| `Agent.Step.ActionRejected` | `entityId`, `locationId`, `proposalId`, `rejectionCount`, `firstRejectionCode` | Proposal rejected |
| `Agent.Step.ActionApplied` | `entityId`, `locationId`, `actionType`, `scopeKey`, `layerId?`, `proposalId` | Action applied |
| `Agent.Step.LatencyExceeded` | `entityId`, `entityKind`, `latencyMs`, `budgetMs` | Step exceeded budget |
| `Agent.Step.Processed` | `entityId`, `entityKind`, `locationId`, `stepSequence`, `outcome`, `latencyMs` | Always (final summary) |

#### HTTP path telemetry sequence

| Event | Emitted when |
|-------|-------------|
| `Agent.Proposal.SchemaInvalid` | 400 response — body not parseable |
| `Agent.Proposal.Received` | Always after schema passes |
| `Agent.Proposal.Accepted` | Validation passed |
| `Agent.Proposal.Rejected` | Rules rejected |

### Debugging a rejected proposal

1. Find `Agent.Proposal.Rejected` or `Agent.Step.ActionRejected` by `correlationId`.
2. Inspect `rejectionCount` and `firstRejectionCode` dimensions.
3. For HTTP proposals: the response body includes a `RejectedProposalAuditRecord` with the full `rejectionReasons` array — each entry has `code`, `message`, and `actionType`.
4. For queue steps: `context.warn(...)` includes the full `reasons` array in the Function's invocation logs.

### How prompt version / hash changes affect replay

If a prompt template changes (new hash), the autonomous step loop is unaffected — `AgentStepHandler` selects ambient content deterministically from `AMBIENT_POOL` (no external model call). For external agent paths (Azure AI Foundry) that produce proposals via LLM, a changed prompt template may yield different `layerContent` values; the idempotency key is based on `proposalId` (a UUID per invocation), so each unique Foundry call is treated as a distinct proposal regardless of prompt version.

---

## 7. MCP Tool Usage by Agents

### Read path (tools agents call to sense)

MCP tools are **read-only**. Agents call them to gather context before deciding what to propose.

| Tool | Purpose in agent loop |
|------|-----------------------|
| `WorldContext-getLocationContext` | Primary sense: location state, exits, realms, current layers |
| `WorldContext-getAtmosphere` | Check current atmospheric/ambient layer content |
| `WorldContext-getRecentEvents` | Recent events in scope; helps avoid redundant proposals |
| `WorldContext-getPlayerContext` | Player state when proposal concerns a player scope |
| `WorldContext-getSpatialContext` | Spatial neighbourhood for area-aware proposals |
| `Lore-getCanonicalFact` / `Lore-searchLore` | Lore facts for narrative coherence |

### Write path (NOT via MCP)

Agents **do not write world state via MCP tools**. There is no write-capable MCP server.
All durable writes go through the proposal pipeline:

```
Agent (Foundry)   →   POST /api/agent/propose   →   AgentProposalApplicator
Internal step loop →  World.Agent.Step (queue)   →   AgentProposalApplicator
```

`AgentProposalApplicator` is the sole write gate for agent-sourced mutations. It writes only to `ILayerRepository`; direct graph mutations (exits, locations) are excluded from the current allow-list.

### What the autonomous step loop does NOT use MCP for

`AgentStepHandler` calls `ILayerRepository` and `WorldClockService` directly via dependency injection — it does not call MCP tools. The sense phase is an internal repository read, not an external tool call. This keeps queue handler latency predictable and avoids the overhead of JSON-RPC round-trips for internal reads.

---

## Cross-References

- [`agentic-ai-and-mcp.md`](./agentic-ai-and-mcp.md) — High-level architecture, MCP tool catalog, mutation admission gates, guiding principles
- `shared/src/agentProposal.ts` — Authoritative schema + validator source
- `backend/src/worldEvents/handlers/AgentStepHandler.ts` — Queue step loop implementation
- `backend/src/services/AgentProposalApplicator.ts` — Write-gate implementation
- `backend/src/handlers/agentPropose.ts` — HTTP proposal endpoint
- `shared/src/telemetryEvents.ts` — Canonical telemetry event names
