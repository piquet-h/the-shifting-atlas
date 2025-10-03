# Agentic AI & Model Context Protocol (MCP) Architecture

> Status (2025-09-25): CONCEPTUAL / PARTIALLY PLANNED. No runtime MCP servers or AI orchestration code exist yet. This document defines the forward architecture so early implementation can land incrementally without refactors.

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

## Layered Model

| Layer               | Responsibility                             | Implementation Substrate                                       |
| ------------------- | ------------------------------------------ | -------------------------------------------------------------- |
| Presentation        | Player command UI, streaming output        | Static Web App (React)                                         |
| Synchronous API     | Parse & validate player commands           | Managed API / HTTP Functions                                   |
| Event Bus           | Decouple effects, schedule AI tasks        | Azure Service Bus (future)                                     |
| AI Orchestration    | Run agents, call MCP tools, emit proposals | Dedicated Functions (queue-trigger) or future durable workflow |
| Validation & Policy | Schema, safety, world invariants           | Pure TS modules in `shared/` + telemetry                       |
| Persistence         | Graph + auxiliary stores                   | Cosmos DB Gremlin / (SQL)                                      |
| Observability       | Metrics, traces, evaluation datasets       | Application Insights + custom tables                           |

## AI & MCP Stages (High-Level)

The legacy numeric "Phase 0–4" roadmap is collapsed into milestone stages aligned with the unified issue taxonomy.

| Stage (Milestone) | Focus                   | Key MCP Servers / Additions                         | Exit Criteria                                        |
| ----------------- | ----------------------- | --------------------------------------------------- | ---------------------------------------------------- |
| M3 AI Read        | Foundations (Read-Only) | `world-query`, `prompt-template`, `telemetry`       | Stable JSON contracts; initial telemetry dashboard   |
| M4 AI Enrich      | Flavor & Dialogue Seed  | +`classification`, `lore-memory`                    | Safe ambience & NPC one-liners in playtest           |
| M5 Systems        | Structured Proposals    | +`world-mutation` (proposal endpoints)              | Validator rejects unsafe / incoherent >90% precision |
| M6 Planning (tbd) | Narrative Planning      | +`simulation-planner`                               | Multi-step quest seed generation gated & logged      |
| M7 Advisory (tbd) | Systemic / Economy Lens | +`economy-analytics`, further domain-specific tools | Cost & token budgets within defined thresholds       |

## Initial MCP Server Inventory (Detail)

### world-query-mcp (Stage M3 – Read Only)

Read-only world access.

Tools (draft):

- `getRoom(roomId)` → { id, name, tags, exits[], occupants[], lastUpdatedUtc }
- `getPlayerState(playerId)` → { locationId, inventorySummary[], statusFlags[] }
- `listRecentEvents(roomId, limit)` → [{ id, type, ts, summary }]

### prompt-template-mcp (Stage M3 – Read Only)

Central registry & versioning for reusable prompt templates.

- `getTemplate(name)`
- `listTemplates(prefix?)`
- `registerVersion(name, version, checksum, body)` (restricted / dev only)

### telemetry-mcp (Stage M3 – Read Only)

Structured logging to App Insights / custom table.

- `recordAIUsage(purpose, model, tokensIn, tokensOut, latencyMs, toolCalls)`
- `logDecision(purpose, decisionType, hashRef, outcome)`

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
- `../modules/ai-prompt-engineering.md` – Prompt lifecycle & genesis, enhanced by MCP tool abstraction.
- `../modules/world-rules-and-lore.md` – Lore retrieval & layered descriptions feeding retrieval tools.

---

_Initial version authored 2025-09-25 to establish AI/MCP integration contract._
