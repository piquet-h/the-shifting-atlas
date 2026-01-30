# Agentic AI & Model Context Protocol (MCP) Architecture

> Status (2026-01-13): PARTIALLY IMPLEMENTED. Read-only MCP tools exist in the backend (Azure Functions `app.mcpTool(...)` registrations under `backend/src/mcp/` for `World-*`, `WorldContext-*`, and `Lore-*`). The agent orchestration layer and any write/proposal MCP surfaces remain planned.

## Purpose

Establish a disciplined, tool-centric approach for integrating Large Language Models (LLMs) and agentic workflows into the existing Azure MMO stack (Static Web Apps, Azure Functions, Service Bus, Cosmos DB Gremlin, Application Insights) using the **Model Context Protocol (MCP)**. This avoids ad‑hoc prompt sprawl, enables safety & governance, and preserves deterministic world state.

## Guiding Principles

1. Advisory Before Authoritative – AI suggests; deterministic validators commit.
2. Tool-First – Agents access the world only via MCP tool contracts (never ad‑hoc DB queries in prompts).
3. Principle of Least Privilege – Each agent role gets a curated allow‑list of tools.
4. Deterministic Core – Canonical world state mutations always flow through validated domain events.
5. Narration-first (Non-simulation) – We do not attempt a complete world simulator. The system persists only the canonical facts needed to prevent drift, and uses narration to bridge ambiguity.
6. Persistence Ratchet – Ephemeral narration may speculate; persisted facts do not. Once a proposal is accepted into storage it becomes canon for future turns (unless explicitly superseded by a validated retcon event).
7. Observability & Versioning – Every AI decision is traceable (model + tool schema versions + prompt hash).
8. Cost-Aware Design – Retrieval + structured facts over giant context stuffing; caching whenever context unchanged.
9. Progressive Disclosure – Start with read‑only context tools; add mutation proposals once validation layer is ready.

### Launch posture (recommended)

For early launch, prefer **Azure AI Foundry hosted agents** as the agent runtime when you want persistence, governance/monitoring, and a secure endpoint without building a bespoke agent-hosting service. Regardless of runtime, the backend remains the **sole authority** for:

- world-state persistence (Cosmos DB)
- invariants and validation gates
- canonical event emission

Agents (hosted or self-hosted) should be treated as **proposal generators**: they can suggest narration, layers, or structured changes, but they do not directly write authoritative state.

### D&D 5e Integration: Hybrid HTTP + MCP Architecture

The D&D 5e agent integration uses a **hybrid approach** for optimal performance and maintainability:

- **Direct HTTP connections** (Foundry → D&D 5e API): Read-only lookups of monster stats, spell details, equipment properties. Benefits: lower latency, zero backend code, auto-schema generation.
- **MCP tools** (Foundry → Backend → D&D API + Cosmos): Stateful operations like spawning NPCs, resolving combat, casting spells with slot consumption. Benefits: caching, telemetry, composite operations, game-specific validation.

**Decision matrix**: Pure reads → HTTP; Cosmos writes or multi-step operations → MCP.

See [D&D 5e Foundry Agent Architecture](../design-modules/dnd5e-foundry-agent-architecture.md) for detailed tool topology and [Foundry Agent Quickstart](../deployment/foundry-agent-quickstart.md) for setup instructions.

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

| Layer               | Responsibility                             | Implementation Substrate                                                             |
| ------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------ |
| Presentation        | Player command UI, streaming output        | Static Web App (React)                                                               |
| Synchronous API     | Parse & validate player commands           | Backend HTTP Functions                                                               |
| Event Bus           | Decouple effects, schedule AI tasks        | Azure Service Bus (future)                                                           |
| AI Orchestration    | Run agents, call MCP tools, emit proposals | Hosted agent runtime (recommended for launch) or dedicated Functions (queue-trigger) |
| Validation & Policy | Schema, safety, world invariants           | Pure TS modules in `shared/` + telemetry                                             |
| Persistence         | Graph + auxiliary stores                   | Cosmos DB Gremlin / (SQL)                                                            |
| Observability       | Metrics, traces, evaluation datasets       | Application Insights + custom tables                                                 |

## AI & MCP Stages (High-Level)

> **Naming alignment:** Unified roadmap (2025-11-23) uses **M3 Core Loop**, **M4 AI Read**, **M5 Quality & Depth**, **M6 Systems**. Legacy references to “M3 AI Read” in this doc map to **M4 AI Read**.

The legacy numeric "Phase 0–4" roadmap is collapsed into milestone stages aligned with the unified issue taxonomy.

| Stage (Milestone)   | Focus                        | Key MCP Servers / Additions                                                                                                                                              | Exit Criteria                                        |
| ------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| M4 AI Read          | Foundations (Read-Only)      | World MCP tools (`get-location`, `list-exits`) + World Context scaffold (expands in #515/#516). Prompts & telemetry are implemented in shared/backend (see notes below). | Stable JSON contracts; initial telemetry dashboard   |
| M6 AI Enrich\*      | Flavor & Dialogue Seed       | +`classification`, `lore-memory`                                                                                                                                         | Safe ambience & NPC one-liners in playtest           |
| M7 Systems\*        | Structured Proposals         | +`world-mutation` (proposal endpoints)                                                                                                                                   | Validator rejects unsafe / incoherent >90% precision |
| (Optional) Planning | Narrative Planning (offline) | +`simulation-planner` (optional; offline tooling, not live gameplay)                                                                                                     | Quest seed generation gated & logged                 |
| (Future) Advisory   | Systemic / Economy Lens      | +`economy-analytics`, further domain-specific tools                                                                                                                      | Cost & token budgets within defined thresholds       |

\*AI enrich/proposal work aligns with roadmap milestones **M6 Systems** and beyond; assign milestone per roadmap scope (e.g., humor/dungeons/entity promotion).

## MCP Tool Catalog (Implemented Today)

This section is a client-facing catalog of the MCP tools currently registered in code under [`backend/src/mcp/`](../../backend/src/mcp/).

Source of truth: the Azure Functions registrations (`app.mcpTool(...)`) under `backend/src/mcp/`. If you add/rename a tool, update this catalog in the same PR.

Important implementation note: these Azure Functions MCP handlers currently return **JSON strings** (they call `JSON.stringify(...)`). MCP clients should treat the tool result as JSON.

### WorldContext server (read-only, prompt-oriented context)

Registered in [`backend/src/mcp/world-context/world-context.ts`](../../backend/src/mcp/world-context/world-context.ts).

| Tool ID                           | toolName               | Arguments (MCP `arguments`)                                                          | Result (JSON)                                  |
| --------------------------------- | ---------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------- |
| `WorldContext-health`             | `health`               | `{}`                                                                                 | `{ "ok": true, "service": "world-context" }`   |
| `WorldContext-getLocationContext` | `get-location-context` | `{ "locationId"?: string, "tick"?: number \| string }`                               | Location-context object (or `null`)            |
| `WorldContext-getPlayerContext`   | `get-player-context`   | `{ "playerId": string, "tick"?: number \| string }`                                  | Player-context object (or `null`)              |
| `WorldContext-getAtmosphere`      | `get-atmosphere`       | `{ "locationId"?: string, "tick"?: number \| string }`                               | Atmosphere-context object                      |
| `WorldContext-getSpatialContext`  | `get-spatial-context`  | `{ "locationId"?: string, "depth"?: number \| string }`                              | Spatial-context object (or `null`)             |
| `WorldContext-getRecentEvents`    | `get-recent-events`    | `{ "scope": "location" \| "player", "scopeId": string, "limit"?: number \| string }` | Event summary array (or `[]` on invalid input) |

Notes:

- If `locationId` is omitted, tools default to the server's public starter location (`STARTER_LOCATION_ID`).
- World tick is measured in milliseconds. If `tick` is omitted, tools use the current world tick.
- `get-location-context` returns location data, exits, realms, ambient layers, nearby players, and recent events (supersedes legacy `World-*` tools).
- `get-spatial-context` clamps `depth` to 1–5 (default: 2).
- `get-recent-events` clamps `limit` to 1–100 (default: 20).

### Lore server (read-only, canonical facts)

Registered in [`backend/src/mcp/lore-memory/lore-memory.ts`](../../backend/src/mcp/lore-memory/lore-memory.ts).

| Tool ID                 | toolName             | Arguments (MCP `arguments`)         | Result (JSON)                |
| ----------------------- | -------------------- | ----------------------------------- | ---------------------------- |
| `Lore-getCanonicalFact` | `get-canonical-fact` | `{ "factId": string }`              | Lore fact object (or `null`) |
| `Lore-searchLore`       | `search-lore`        | `{ "query": string, "k"?: number }` | Lore fact array              |

Notes:

- `Lore-searchLore` delegates to the configured `ILoreRepository`. In some environments this may return an empty array until semantic search is implemented.

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

See #427 for the dedicated (non-MCP) telemetry query endpoint work.

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

### simulation-planner-mcp (Optional – offline tooling)

If introduced, this is an **offline** tool for generating multi-step narrative arcs (quest scaffolds, faction beats) with strict gating and audit. It is **not required** for launch and is not intended to drive a live “simulation.”

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

Note: in a narration-first game, a rejection should typically produce a **story-consistent fallback** (“you thought you saw…”) rather than blocking the player.

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

1. PlannerAgent (tools: WorldContext-_, Lore-_) drafts a quest arc.
2. CanonicalityAgent (tools: WorldContext-\*) verifies entity & exit references.
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

## Client Guide (Tool Authors)

This is the minimal, practical guide for tool authors (VS Code extensions, Teams bots, agent runners) to consume the current MCP surface.

### What you call (names)

Each MCP tool has:

- a **Tool ID** (e.g. `WorldContext-getLocationContext`) used in Azure Functions registration, and
- a **toolName** (e.g. `get-location-context`) used as the canonical MCP-facing name.

When in doubt: treat the **toolName** as the stable client contract, and treat the Tool ID as an implementation detail.

### Example tool calls

The following examples show the MCP `tools/call` request shape (tool name + JSON `arguments`).

#### WorldContext: location context

```json
{
    "name": "get-location-context",
    "arguments": {
        "locationId": "00000000-0000-0000-0000-000000000000",
        "tick": 1736791350000
    }
}
```

#### World: starter location (implicit default)

```json
{
    "name": "get-location",
    "arguments": {}
}
```

#### Lore: canonical fact

```json
{
    "name": "get-canonical-fact",
    "arguments": {
        "factId": "faction_shadow_council"
    }
}
```

### Authentication & the external boundary (gateway-first)

There are two different caller types:

- **Gameplay (website → backend):** the website calls normal backend HTTP endpoints. The backend is the canonical gameplay API surface and the authority for persistence/invariants; narration may be produced internally or via a hosted agent runtime.
- **External narrators (VS Code / Teams / agent runners):** external tools can call a curated narrative/tooling surface to fetch read-only context (MCP tools) and/or request narrative responses.

For external narrators, authentication and throttling MUST be enforced at the platform boundary:

- Prefer **Microsoft Entra ID (OAuth2)** for service-to-service callers.
- Prefer **API Management** in front of Functions when you need per-client subscriptions/quotas/policies.
- Avoid bespoke per-tool API-key validation inside MCP handlers as the primary model (shared secrets are compatibility-only, if ever used, and should live behind a gateway).

This doc describes the boundary model; implementation work is tracked in #428 (auth) and #429 (quotas).

Boundary guardrails (explicit):

- The **website gameplay client must not call MCP tools directly**.
- MCP tools are for **agent runtimes** (internal backend orchestrators, or external narrators) and must sit behind gateway auth.
- Do not introduce per-tool API keys as the primary security model; use **Entra ID / APIM**.

### Rate limits (current vs planned)

Current implementation status:

- The MCP tool handlers under `backend/src/mcp/` do not currently apply in-app rate limiting.
- Some gameplay HTTP handlers do enforce in-app rate limits via `backend/src/middleware/` (e.g. movement/look), but that is a separate surface from MCP.

Planned / default policy for **external narrative clients** (configurable; gateway-first per #429):

- **requests/minute**: 60 per client
- **burst/second**: 10 per client

Clients must handle HTTP 429 with `Retry-After` and should back off aggressively on repeated throttling.

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
    - Inputs: ActionFrame, WorldContext-_ tools, Lore-_ tools, character metadata.
    - Outputs: narration text, advisory WorldEventEnvelope proposals.

- Intent Parser Agent
    - Role: Convert free-form player text → structured ActionFrame(s) (verbs, targets, modifiers, order).
    - Tools: local heuristics, optional fast model, WorldContext-\* for disambiguation.

- World Agent
    - Role: Apply deterministic mechanics (movement, inventory, time costs) and produce deterministic proposals when required.
    - Tools: WorldContext-\*, ActionRegistry, repository adapters.

- Encounter / Resolution Agent
    - Role: Resolve interactive multi-actor scenarios (turns, resource consumption) and emit domain events or validated proposals.
    - Tools: WorldContext-\*, rule tables, ActionRegistry.

- Planner / Quest Agent
    - Role: Generate multi-step arcs (quest seeds, adventure scaffolds) for later validation and enactment.
    - Tools: Lore-_ and WorldContext-_; optional offline planner tooling if introduced.

- Safety / Classification Agent
    - Role: Moderate and classify content; block or flag proposals violating safety policy.
    - Tools: classification-mcp (future).

- Canonicality / Validator Agent
    - Role: Verify referential integrity and domain invariants before persistence (exits exist, entity resolution).
    - Tools: WorldContext-\*, shared validation functions.

- Aggregator / Orchestrator
    - Role: Combine multiple agent outputs, tie-break, attach correlation ids, and forward accepted work to the Validation & Policy pipeline.

- Telemetry / Audit Agent
    - Role: Emit standardized telemetry for AI invocations and decision outcomes using `shared/src/telemetry.ts`.

## MCP Contract Table (compact)

The table below lists the primary MCP servers / backend helpers with their purpose, representative methods, and short auth notes.

| Server / Helper                      |              Stage | Representative methods                                                                                                                          | Auth / Notes                                                                                           |
| ------------------------------------ | -----------------: | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| WorldContext-\*                      |     M4 (read-only) | getLocationContext(locationId,tick), getPlayerContext(playerId,tick), getSpatialContext(locationId,depth), getRecentEvents(scope,scopeId,limit) | Read-only; allow-list for agents; rate-limited; returns structured facts                               |
| Lore-\*                              |                 M4 | searchLore(query,k), getCanonicalFact(factId)                                                                                                   | Vector store access; sanitized snippets; auth via backend helper                                       |
| classification-mcp                   |        M4 (future) | classifyIntent(utterance), moderateContent(text)                                                                                                | Requires model usage telemetry; used in Validation & Policy                                            |
| intent-parser (backend helper)       |              M3/M4 | parseToActionFrame(text,context) → ActionFrame[]                                                                                                | Prefer server-side implementation; minimal WorldContext calls for resolution                           |
| prompt templates (shared)            |   shared (not MCP) | getWorldTemplate(key) (seed); planned: getTemplate(name,version), listTemplates(tag), computePromptHash(template)                               | Templates live in `shared/src/prompts/`; not exposed as MCP; backend helper endpoints only for tooling |
| world-mutation / proposal API        |         M5 (gated) | proposeAction(playerId,actionEnvelope), enqueueWorldEvent(type,payload)                                                                         | Protected; proposals must pass Validation & Policy gates before persistence                            |
| simulation-planner                   | optional (offline) | generateArc(seed,constraints)                                                                                                                   | Offline tooling only; not live gameplay                                                                |
| telemetry query API (backend helper) |            backend | GET /api/telemetry/ai-usage?since&purpose                                                                                                       | Curated aggregates only; no raw AppInsights surface exposed to agents                                  |

_Auth notes_: All MCP tool endpoints must enforce least-privilege access, rate limits, and correlate requests with operationId/correlationId for traceability.

### External narrative access boundary (gateway-first)

This project supports two consumption modes:

- **Gameplay (website → backend):** the website calls normal backend HTTP endpoints. The backend is the canonical gameplay API surface and authority for persistence/invariants; narration may be produced internally or via a hosted agent runtime, and the backend may call MCP tools as part of that pipeline.
- **External narrators (VS Code / Teams / agent runners):** external tools can call a curated narrative/tooling surface to “tell the story” or fetch context.

For external narrators, authentication and throttling MUST be enforced at the platform boundary:

- Prefer **Microsoft Entra ID (OAuth2)** for service-to-service callers.
- Use **API Management** in front of Functions when you need per-client quotas/subscriptions and richer gateway policies.
- Avoid bespoke per-tool API-key validation inside MCP handlers as the primary mechanism. If shared secrets are used at all, treat them as a compatibility mode and keep them behind a gateway.

_Small guidance_: Keep prompt templates and prompt hashes in `shared/src/prompts/` and add new AI-specific telemetry event names in `shared/src/telemetryEvents.ts` before emission.
