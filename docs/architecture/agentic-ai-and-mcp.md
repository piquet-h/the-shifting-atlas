# Agentic AI & Model Context Protocol (MCP) Architecture

> Status (2026-01-13): PARTIALLY IMPLEMENTED. Read-only MCP tools exist in the backend (Azure Functions `app.mcpTool(...)` registrations for `WorldContext-*` and `Lore-*`). The agent orchestration layer and any write/proposal MCP surfaces remain planned.

## Purpose

Establish a disciplined, tool-centric approach for integrating Large Language Models (LLMs) and agentic workflows into the existing Azure MMO stack (Static Web Apps, Azure Functions, Service Bus, Cosmos DB Gremlin, Application Insights) using the **Model Context Protocol (MCP)**. This avoids ad‑hoc prompt sprawl, enables safety & governance, and preserves deterministic world state.

## Guiding Principles

1. Advisory Before Authoritative – AI suggests; deterministic validators commit.
2. Tool-First – Agents access the world only via MCP tool contracts (never ad‑hoc DB queries in prompts).
3. Principle of Least Privilege – Each agent role gets a curated allow‑list of tools.
4. Deterministic Core – Canonical world state mutations always flow through validated domain events.
5. Observability & Versioning – Every AI decision is traceable (model + tool schema versions + prompt hash).
6. Cost-Aware Design – Retrieval + structured facts over giant context stuffing; caching whenever context unchanged.
7. Progressive Disclosure – Start with read‑only context tools; add mutation proposals once validation layer is ready.

### Mutation Admission Gates (Preview)

No mutating MCP server (e.g., `world-mutation-mcp`) is enabled until ALL gates below are implementable and enforced:

1. Schema Gate: Proposal payload validates against versioned JSON/Zod schema (strict: unknown fields rejected).
2. Safety Gate: Moderation/classification pass returns non-blocking verdict (no disallowed categories).
3. Invariant Gate: Domain validators confirm no structural contradiction (exits, attributes, faction rules).
4. Duplication Gate: Similarity hash < threshold vs recent accepted proposals (prevents spam variations).
5. Replay Gate: Deterministic context hash + prompt template version allow exact regeneration.
6. Rate Gate: Proposal purpose within per-player + global budget windows (cost + griefing mitigation).
7. Audit Gate: Telemetry event successfully emitted BEFORE persistence (write aborted if emission fails hard).

Failure Handling: First failing gate stops evaluation; proposal returns a structured rejection (no partial passes). Retrying identical input without environmental change is discouraged unless failure reason was transient (rate or infrastructure).

## Layered Model

| Layer               | Responsibility                             | Implementation Substrate                                       |
| ------------------- | ------------------------------------------ | -------------------------------------------------------------- |
| Presentation        | Player command UI, streaming output        | Static Web App (React)                                         |
| Synchronous API     | Parse & validate player commands           | Backend HTTP Functions                                         |
| Event Bus           | Decouple effects, schedule AI tasks        | Azure Service Bus (future)                                     |
| AI Orchestration    | Run agents, call MCP tools, emit proposals | Dedicated Functions (queue-trigger) or future durable workflow |
| Validation & Policy | Schema, safety, world invariants           | Pure TS modules in `shared/` + telemetry                       |
| Persistence         | Graph + auxiliary stores                   | Cosmos DB Gremlin / (SQL)                                      |
| Observability       | Metrics, traces, evaluation datasets       | Application Insights + custom tables                           |

## AI & MCP Stages (High-Level)

> **Naming alignment:** Unified roadmap (2025-11-23) uses **M3 Core Loop**, **M4 AI Read**, **M5 Quality & Depth**, **M6 Systems**. Legacy references to “M3 AI Read” in this doc map to **M4 AI Read**.

The legacy numeric "Phase 0–4" roadmap is collapsed into milestone stages aligned with the unified issue taxonomy.

| Stage (Milestone) | Focus                   | Key MCP Servers / Additions                                                                                                                                              | Exit Criteria                                        |
| ----------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| M4 AI Read        | Foundations (Read-Only) | World MCP tools (`get-location`, `list-exits`) + World Context scaffold (expands in #515/#516). Prompts & telemetry are implemented in shared/backend (see notes below). | Stable JSON contracts; initial telemetry dashboard   |
| M6 AI Enrich\*    | Flavor & Dialogue Seed  | +`classification`, `lore-memory`                                                                                                                                         | Safe ambience & NPC one-liners in playtest           |
| M7 Systems\*      | Structured Proposals    | +`world-mutation` (proposal endpoints)                                                                                                                                   | Validator rejects unsafe / incoherent >90% precision |
| (Future) Planning | Narrative Planning      | +`simulation-planner`                                                                                                                                                    | Multi-step quest seed generation gated & logged      |
| (Future) Advisory | Systemic / Economy Lens | +`economy-analytics`, further domain-specific tools                                                                                                                      | Cost & token budgets within defined thresholds       |

\*AI enrich/proposal work aligns with roadmap milestones **M6 Systems** and beyond; assign milestone per roadmap scope (e.g., humor/dungeons/entity promotion).

## Initial MCP Server Inventory (Detail)

### World MCP tools (Stage M4 – Read Only)

Read-only world access.

Implemented today (Azure Functions `app.mcpTool(...)`):

- `World-getLocation` (`toolName: get-location`)
- `World-listExits` (`toolName: list-exits`)
- `Lore-getCanonicalFact` (`toolName: get-canonical-fact`)
- `Lore-searchLore` (`toolName: search-lore`)
- `WorldContext-health` (`toolName: health`) (foundation scaffold; expands in #515/#516)

Draft future shape (conceptual):

- `getPlayerState(playerId)` → { locationId, inventorySummary[], statusFlags[] }
- `listRecentEvents(scopeKey, limit)` → [{ id, type, ts, summary }]

### Prompt templates (NOT an MCP server)

Prompt templates and the canonical registry are implementation concerns and MUST NOT be exposed as MCP servers. Instead:

- Store canonical, versioned prompt templates in code under `shared/src/prompts/` (filesystem or registry-backed) with deterministic hashing (SHA-256) and retrieval helpers.
- Expose backend helper endpoints only when external tooling needs HTTP access (e.g. `GET /api/prompts/{id}` in `backend/src/functions/prompts/`) — these endpoints should call into `shared` helpers.
- Rationale: prompt text is an implementation artifact (determinism, testability, CI validation) and belongs in the shared package; keeping it out of MCP reduces attack surface and encourages deterministic hashing and lint enforcement.

Suggested helpers / functions:

- Current (seed): `shared/src/prompts/worldTemplates.ts` → `getWorldTemplate(key)`
- Planned (registry): `getTemplate(name, version?)`, `listTemplates(tag?)`, `computePromptHash(template)`

### Telemetry & Observability (NOT an MCP server)

Telemetry, metric emission, and Application Insights queries MUST be implemented in the backend / observability area rather than as MCP servers. Recommended placement:

- Canonical event names: `shared/src/telemetryEvents.ts` (the single source of truth for event literals).
- Telemetry helpers: `shared/src/telemetry.ts` (emit helpers and wrappers used by backend code).
- Backend helper endpoints for curated telemetry queries: `backend/src/functions/telemetry/` (if external tools require aggregated, sanitized query results).

Rationale: Centralizing telemetry in backend/observability ensures consistent sanitization, access control, rate-limiting and avoids exposing App Insights or high-cardinality surfaces to MCP clients.

Telemetry examples (implemented in shared/backend code, not MCP):

- `trackAICall(purpose, model, tokens, latency, dims)` — helper used by backend functions
- `GET /api/telemetry/ai-usage?since=...&eventType=...` — curated aggregate endpoint implemented by backend functions

### classification-mcp (Stage M4 – Enrichment)

Safety & routing support.

- `classifyIntent(utterance)` → { intent, confidence }
- `moderateContent(text)` → { flagged, categories[] }

### lore-memory-mcp (Stage M4 – Enrichment)

Vector / semantic retrieval over curated lore, quests, factions.

- `semanticSearchLore(query, k)` → [{ id, score, snippet }]
- `getCanonicalFact(entityId)` → { id, type, fields }

### world-mutation-mcp (Stage M5 – Proposals)

Proposal endpoints (never direct writes):

- `proposeNPCDialogue(npcId, playerId, draftText)` → { status, sanitizedText?, reason? }
- `proposeQuest(seedSpec)` → { status, questDraft?, issues[] }
- `enqueueWorldEvent(type, payload)` → { accepted, eventId? }
    - Note: This enqueues WorldEventEnvelope format (see world-event-contract.md) for queue processing

### simulation-planner-mcp (Stage M6 – Planning)

Higher-order narrative & faction simulation.

- `simulateFactionTick(factionId, horizonSteps)`
- `generateEventArc(seed, constraints)`

### economy-analytics-mcp (Stage M7 – Advisory)

Advisory economic insights.

- `detectAnomalies(range)`
- `suggestPriceAdjustments(commodityId)`

## Advisory vs Authoritative Flow

1. Player or system event triggers AI task (e.g., "GenerateAmbience").
2. **Agent** collects context solely via read-only tools.
3. Draft content produced (dialogue line, quest seed, ambience text).
4. **Validation Layer** executes (schema → safety → invariants → duplication check).
5. If accepted: emits deterministic domain event (e.g., `AmbienceGenerated`).
6. Event processor persists layer / record; telemetry recorded.
7. If rejected: optionally reprompt (bounded attempts) or fallback to static content.

## Validation & Safety Gates

| Gate         | Source                 | Example Rule                                     |
| ------------ | ---------------------- | ------------------------------------------------ |
| Schema       | JSON schema / Zod      | Required fields present & types correct          |
| Safety       | moderation tool        | No disallowed categories (policy vX.Y)           |
| Token Budget | prompt-template config | < 800 completion tokens for ambience             |
| Duplicate    | similarity index       | Reuse hash → short-circuit, reuse prior text     |
| Invariants   | domain validators      | No exit dir duplicates; faction reference exists |

## Memory & Retrieval Strategy

Memory Tiers:

- Canonical Graph: Gremlin (authoritative state)
- Short-Term Interaction: Redis/Table (recent dialogue per NPC-player pair)
- Long-Term Lore Embeddings: Curated subset (initially ≤ 200 facts) → lore-memory-mcp
- Ephemeral Scratch: In-process agent scratchpads (never persisted)

Retrieval Pattern: Tools return _structured_ fact objects; agent composes minimal natural language only at the final step.

## Token & Cost Controls

Mechanisms:

- Context Hashing: (purpose + canonicalContextHash) → cache reuse
- Model Tiering: Cheap model for ambience; richer model for narrative arcs
- Tool Call Budget: Hard cap (e.g., 6) per task to prevent runaway loops
- Proposal De-Duplication: Content hash stored; identical resubmissions skipped

## Observability & Telemetry

Minimum metrics per AI invocation:

- `ai.purpose` (ambience | npc_dialogue | quest_seed | etc.)
- `ai.model`
- `ai.tokens.prompt` / `ai.tokens.completion`
- `ai.latency.total_ms`
- `ai.toolCalls.count`
- `ai.validation.outcome` (accepted|rejected|modified)
- `ai.moderation.flagged` (bool)

Dashboards: Cost per purpose, rejection rate trend, latency percentiles, dialogue diversity (distinct n-grams), retrieval recall sampling.

### AI Telemetry Implementation (Initial Spec)

All AI / MCP related metrics MUST funnel through the canonical game telemetry layer (`trackGameEventStrict` / `trackGameEventClient`) using standardized event names. Additional raw model usage metrics (tokens, latency) are attached as **dimensions** to avoid event name proliferation.

Authoritative event name enumeration lives in `shared/src/telemetryEvents.ts` (import `GAME_EVENT_NAMES`). New AI-specific names MUST be added there _before_ emission. Lint rules will begin enforcing membership once Stage M3 lands.

Required dimensions per AI invocation event (`Prompt.Genesis.Issued`, `Prompt.Genesis.Rejected`, etc.):

- `ai.model` – exact model identifier
- `ai.purpose` – controlled vocabulary (ambience|npc_dialogue|quest_seed|classification|retrieval)
- `ai.tokens.prompt` / `ai.tokens.completion`
- `ai.latency.total_ms`
- `ai.toolCalls.count`
- `ai.validation.outcome` – accepted|rejected|modified
- `ai.moderation.flagged` – boolean

Optional (emit when present):

- `ai.cache.hit` (bool) – context hash reuse
- `ai.retry.count` – number of reprompts
- `ai.version.template` – semantic version of prompt template

Sampling: None at Stage M3. Introduce selective sampling only if ingestion threatens budget; never sample rejection or moderation-flag events.

Kusto Starter Query Snippet (illustrative):

```
customEvents
| where name startswith "Prompt.Genesis" or name startswith "Prompt.Layer.Generated"
| extend model = tostring(customDimensions['ai.model']),
		 purpose = tostring(customDimensions['ai.purpose']),
		 accepted = tostring(customDimensions['ai.validation.outcome']) == 'accepted'
| summarize count(), avg(todouble(customDimensions['ai.latency.total_ms'])) by model, purpose, accepted
```

This section complements (does not duplicate) broader telemetry guidance in `observability.md`.

## Multi-Agent (Future Pattern)

Committee Example (Stage M6+):

1. PlannerAgent (tools: world-query, lore-memory) drafts quest arc.
2. CanonicalityAgent (tools: world-query) verifies entity & exit references.
3. SafetyAgent (tools: classification) final moderation.
4. Aggregator applies tie-break rules (e.g., shortest valid arc) then emits proposal.

## Directory & Code Placement (Planned)

| Concern                     | Location                               |
| --------------------------- | -------------------------------------- |
| MCP server handlers         | `backend/src/mcp/<serverName>/`        |
| Tool JSON schema (TS types) | `shared/src/mcp/types/`                |
| Validation functions        | `shared/src/validation/`               |
| Agent orchestrators         | `backend/src/agents/`                  |
| Prompt templates            | `shared/src/prompts/` (hash persisted) |
| Telemetry utils             | `shared/src/telemetry.ts` (extended)   |

## Risks & Mitigations (Condensed)

| Risk                                  | Mitigation                                                         |
| ------------------------------------- | ------------------------------------------------------------------ |
| Refactor debt from early ad‑hoc calls | Adopt MCP read-only tools from first integration                   |
| State corruption by hallucination     | Proposal + validator separation; never raw AI writes               |
| Runaway costs                         | Hash caching, tiered models, budget telemetry alerts               |
| Prompt drift                          | Versioned template registry + regression fixtures                  |
| Safety regression                     | Centralize moderation in classification-mcp; monitor flagged ratio |

## Immediate Implementation Checklist (Stage M3 Read)

1. Define TypeScript interfaces for Stage M3 tools (`world-query`, `prompt-template`, `telemetry`).
2. Stub Azure Functions exposing these as HTTP endpoints (even if returning static mock data initially).
3. Add prompt template registry (filesystem + SHA256 hashing) with `getTemplate` and `listTemplates`.
4. Instrument telemetry events for each (simulated) AI invocation.
5. Create App Insights dashboard slices (purpose vs cost vs latency).

## Cross-References

- `overview.md` – High-level architecture; this doc elaborates the AI layer.
- `mvp-azure-architecture.md` – Incorporates Stage M3 insertion points.
- `location-version-policy.md` – Exit changes do not affect location version
- `../modules/ai-prompt-engineering.md` – Prompt lifecycle & genesis, enhanced by MCP tool abstraction.
- `../modules/world-rules-and-lore.md` – Lore retrieval & layered descriptions feeding retrieval tools.

---

_Initial version authored 2025-09-25 to establish AI/MCP integration contract._

## Agent Roles Summary

This project distinguishes concise, single-responsibility agents. Each agent is advisory by default; authoritative state changes require Validation & Policy gates.

- Narrative Agent (DM persona)
    - Role: Produce player-facing narration, evaluate plausibility, and emit advisory proposals for world changes.
    - Inputs: ActionFrame, world-query, lore-memory, character metadata.
    - Outputs: narration text, advisory WorldEventEnvelope proposals.

- Intent Parser Agent
    - Role: Convert free-form player text → structured ActionFrame(s) (verbs, targets, modifiers, order).
    - Tools: local heuristics, optional fast model, `world-query` for disambiguation.

- World Agent
    - Role: Apply deterministic mechanics (movement, inventory, time costs) and produce deterministic proposals when required.
    - Tools: `world-query`, ActionRegistry, repository adapters.

- Encounter / Resolution Agent
    - Role: Resolve interactive multi-actor scenarios (turns, resource consumption) and emit domain events or validated proposals.
    - Tools: `world-query`, rule tables, ActionRegistry.

- Planner / Quest Agent
    - Role: Generate multi-step arcs (quest seeds, adventure scaffolds) for later validation and enactment.
    - Tools: `lore-memory`, `simulation-planner`, `world-query`.

- Safety / Classification Agent
    - Role: Moderate and classify content; block or flag proposals violating safety policy.
    - Tools: `classification-mcp`.

- Canonicality / Validator Agent
    - Role: Verify referential integrity and domain invariants before persistence (exits exist, entity resolution).
    - Tools: `world-query`, shared validation functions.

- Aggregator / Orchestrator
    - Role: Combine multiple agent outputs, tie-break, attach correlation ids, and forward accepted work to the Validation & Policy pipeline.

- Telemetry / Audit Agent
    - Role: Emit standardized telemetry for AI invocations and decision outcomes using `shared/src/telemetry.ts`.

## MCP Contract Table (compact)

The table below lists the primary MCP servers / backend helpers with their purpose, representative methods, and short auth notes.

| Server / Helper                      |            Stage | Representative methods                                                                                            | Auth / Notes                                                                                           |
| ------------------------------------ | ---------------: | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| world-query                          |   M4 (read-only) | getRoom(roomId), getPlayerState(playerId), getNeighbors(roomId,depth), listRecentEvents(roomId,limit)             | Read-only; allow-list for agents; rate-limited; returns structured facts                               |
| lore-memory                          |               M4 | semanticSearchLore(query,k), getCanonicalFact(entityId)                                                           | Vector store access; sanitized snippets; auth via backend helper                                       |
| classification-mcp                   |               M4 | classifyIntent(utterance), moderateContent(text)                                                                  | Requires model usage telemetry; used in Validation & Policy                                            |
| intent-parser (backend helper)       |            M3/M4 | parseToActionFrame(text,context) → ActionFrame[]                                                                  | Prefer server-side implementation; minimal world-query calls for resolution                            |
| prompt templates (shared)            | shared (not MCP) | getWorldTemplate(key) (seed); planned: getTemplate(name,version), listTemplates(tag), computePromptHash(template) | Templates live in `shared/src/prompts/`; not exposed as MCP; backend helper endpoints only for tooling |
| world-mutation / proposal API        |       M5 (gated) | proposeAction(playerId,actionEnvelope), enqueueWorldEvent(type,payload)                                           | Protected; proposals must pass Validation & Policy gates before persistence                            |
| simulation-planner                   |               M6 | simulateScenario(seed,steps), generateArc(seed,constraints)                                                       | Heavy compute; used offline or in gated background tasks                                               |
| telemetry query API (backend helper) |          backend | GET /api/telemetry/ai-usage?since&purpose                                                                         | Curated aggregates only; no raw AppInsights surface exposed to agents                                  |

_Auth notes_: All MCP tool endpoints must enforce least-privilege access, rate limits, and correlate requests with operationId/correlationId for traceability.

### External narrative access boundary (gateway-first)

This project supports two consumption modes:

- **Gameplay (website → backend):** the website calls normal backend HTTP endpoints. The backend owns narration and (when enabled) calls MCP tools internally as part of the narration pipeline.
- **External narrators (VS Code / Teams / agent runners):** external tools can call a curated narrative/tooling surface to “tell the story” or fetch context.

For external narrators, authentication and throttling MUST be enforced at the platform boundary:

- Prefer **Microsoft Entra ID (OAuth2)** for service-to-service callers.
- Use **API Management** in front of Functions when you need per-client quotas/subscriptions and richer gateway policies.
- Avoid bespoke per-tool API-key validation inside MCP handlers as the primary mechanism. If shared secrets are used at all, treat them as a compatibility mode and keep them behind a gateway.

_Small guidance_: Keep prompt templates and prompt hashes in `shared/src/prompts/` and add new AI-specific telemetry event names in `shared/src/telemetryEvents.ts` before emission.
