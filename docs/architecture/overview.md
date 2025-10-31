# Architecture Overview

> Status Accuracy (2025-10-22): Basic traversal implemented: HTTP movement + look endpoints, direction normalization, and world event queue processor with envelope validation. Cosmos DB Gremlin used for location graph; Cosmos DB SQL API active for players, inventory, layers, and events. This overview reflects current implementation and planned direction.
>
> Terminology Note: _Status Accuracy_ captures the last date the factual implementation claims were manually audited. The footer _Last updated_ reflects the last structural/content edit (which may add future-looking sections without changing audited status lines).

This overview provides a concise narrative bridge between the high‑level vision (persistent, event‑driven text world) and the concrete MVP implementation described in `mvp-azure-architecture.md`.

## Purpose

- Summarize the architectural intent before deep‑diving into MVP specifics.
- Clarify phased evolution: unified Backend Function App for HTTP + async processing (embedded API removed).
- Provide a stable link target for docs referencing an "architecture overview" page.

## Core Tenets

1. Event‑Driven Progression: Player commands and world changes become events; asynchronous processors (future Service Bus + queue‑triggered Functions) evolve state.
2. Stateless Compute: Azure Functions remain stateless; all authoritative data resides in the graph (Cosmos Gremlin) and durable event records.
3. Graph‑First World Model: Rooms, exits, NPCs, items, factions, and quests as vertices/edges enabling semantic traversal and relationship queries.
4. Incremental Modularity: Start with a unified dedicated Functions App for HTTP + queue triggers; SWA serves static assets only.
5. Cost Minimization: Favor free / consumption tiers until sustained playtest load justifies scaling investments.

## Current Slice (MVP Stage)

Implemented (thin slice – see repo for exact handlers):

- Static Web App (frontend only)
- Backend `backend/` Functions App (HTTP endpoints + world event queue processors)
- World event queue processor with envelope validation (see [world-event-contract.md](world-event-contract.md))
- Repository abstraction (memory adapters) for Rooms & Players
- Persistent traversal via Cosmos DB Gremlin (locations, exits, movement)
- Guest GUID bootstrap with canonical telemetry events (`Onboarding.GuestGuid.Started/Created`)
- Canonical telemetry framework (`trackGameEventStrict`, event name governance)
- Direction normalization (shortcuts, typos, relative directions)
- Stage M3 MCP stubs (planned): `world-query` (read-only), `prompt-template` (hashing registry), `telemetry` (read-only AI usage & decision logging)

Still provisioned but not yet fully integrated: Service Bus (queue processor operates without Service Bus binding), Key Vault (secret management planned for M2).

Not yet implemented (planned):

- Service Bus queue integration (processor currently triggered via HTTP)
- Managed identity graph access (replace key‑based secret)
- AI prompt integration & dynamic content (advisory then genesis)
- Telemetry MCP server + cost dashboards

## Evolution Path

Stage Roadmap (Milestones):

1. M0 Foundation – Basic HTTP endpoints (`ping`, onboarding), skeleton world model.
2. M1 Traversal – Persistent locations, exits, movement loop.
3. M2 Observability – Telemetry events, correlation IDs, RU + latency capture.
4. M3 AI Read – Read‑only MCP servers (`world-query`, `prompt-template`, `telemetry`).
5. M4 AI Enrich – Classification + curated lore retrieval.
6. M5 Systems – Proposal endpoints, faction/economy/quest scaffolds.

## Separation of Concerns (Future State)

- `frontend/` – Presentation + minimal command dispatch
- `backend/` – All HTTP endpoints + asynchronous world simulation (queue-triggered world event processors + NPC ticks), heavier domain logic
- `shared/` (expanding) – Currently exports telemetry events + dual entry points; will accrete graph helpers, validation schemas, and MCP tool type definitions

### Shared Package Entry Points (Browser vs Backend)

The `@atlas/shared` workspace now exposes **two entry points** to keep the frontend bundle free of Node‑only dependencies:

- `index.ts` (default / backend): full export surface, including telemetry initialization that references Node built‑ins (`node:crypto`) and the Azure Application Insights SDK.
- `index.browser.ts` (browser-mapped via the `"browser"` field in `shared/package.json`): minimal, currently exports only canonical telemetry event name constants. It deliberately omits telemetry initialization and any code touching Node APIs.

Bundlers (Vite/Rollup) automatically substitute the browser build when targeting the frontend, preventing accidental inclusion of heavy or incompatible modules. When adding new shared utilities for the frontend, export them from `index.browser.ts` **only if** they are:

1. Pure TypeScript/JS (no dynamic `require`, no Node built‑ins like `fs`, `net`, `crypto` beyond standard web APIs).
2. Side‑effect free (no environment inspection or global initialization).
3. Stable (domain constants, pure functions, type definitions).

If a utility requires conditional behavior (different in backend vs browser), prefer a thin adapter in the frontend rather than branching logic inside shared code, to keep the browser surface auditable and tree‑shakable.

## Data & World Graph Principles

- Stable GUIDs for all nodes (players, rooms, NPCs)
- Exits encoded as edges with semantic direction labels (`north`, `up`, etc.)
- Events optionally stored as vertices or external log for replay/analytics
- Prefer idempotent mutations: processors verify current state before applying changes
- **Dual persistence pattern (ADR-002)**: Immutable world structure in Cosmos DB Gremlin (locations, exits, spatial relationships); mutable player data and events in Cosmos DB SQL API (players, inventory, description layers, world events).
- Planned multi‑scale spatial layer (see `../modules/geospatial-and-hydrology.md`) introducing Region, WaterBody, and RiverSegment vertices; early traversal code should avoid assumptions that all traversable context fits only in `Location` properties.
- Tokenless description layering (see `../modules/description-layering-and-variation.md`) keeps base prose immutable; variation (weather, faction displays, structural damage) is additive via validated layers.
- Partition key strategy: single logical partition during Mosswell bootstrap (MVP concession) with documented region sharding migration path (see `../adr/ADR-002-graph-partition-strategy.md` and Appendix in `../adr/ADR-001-mosswell-persistence-layering.md`).

## Cosmos DB SQL API Containers

The dual persistence pattern (ADR-002) uses Cosmos DB SQL API for mutable player data and event logs, complementing the Gremlin graph used for immutable world structure. See [Repository Interfaces](../developer-workflow/mosswell-repository-interfaces.md) for detailed persistence contracts.

**Containers:**

- **`players`** (PK: `/id`) – Player documents with GUID as partition key. Each player's mutable state (current location reference, session data) colocated by player ID.
- **`inventory`** (PK: `/playerId`) – Inventory items partitioned by player GUID. All items for a player colocated for efficient queries.
- **`descriptionLayers`** (PK: `/locationId`) – Description variation layers partitioned by location GUID. Weather, structural, and faction-specific overlays colocated with their location context.
- **`worldEvents`** (PK: `/scopeKey`) – **PLANNED**: World event audit log using scope pattern (`loc:<id>` or `player:<id>`) for persistent event history with status tracking. Uses WorldEvent interface from domainModels.ts. Implementation deferred; container provisioned for future use. See [world-event-contract.md](world-event-contract.md) for active queue-based WorldEventEnvelope specification.

**Access pattern:** Use `@azure/cosmos` SDK with Managed Identity (preferred) or Key Vault secret. Environment variables configured in Bicep (see `.github/copilot-instructions.md` Section 5 for complete configuration details).

## Security & Identity Roadmap

- Short term: Key Vault secret injection for Cosmos key
- Mid term: System-assigned managed identity for SWA + Functions with data plane RBAC
- Long term: Microsoft Entra External Identities for player auth; claims map to player vertex

### External Identity Upgrade Flow (Preview)

Upgrade path (guest → linked identity) will remain deferred until traversal persistence is stable. Planned minimal contract:

1. Guest session issues `playerGuid` (already implemented).
2. Client obtains external auth token (Microsoft Entra External Identities) off-band.
3. `POST /player/link` supplies token; backend validates & maps stable `sub` → existing guest `playerGuid` (no new player row created).
4. Idempotency: repeated link attempts for same `sub` return 200 + existing mapping.
5. Telemetry: `Auth.Player.Upgraded` emitted exactly once per mapping; subsequent calls emit `Player.Get` only.

Gating Conditions (before implementation):

- Traversal & movement telemetry shipping (ensures onboarding instrumentation baseline).
- Secret / managed identity flow for Cosmos active (avoid embedding token logic early).
- Decision on whether multi-provider auth is needed at MVP; if deferred, design for future provider expansion via provider prefix in stored external ID.

Full flow diagram will be added here once an Entra app registration is provisioned (avoid speculative drift now).

## Observability Roadmap

- Introduce Application Insights (function invocation traces, dependency calls)
- Custom events: player command issued, world event processed, NPC action resolved
- Sampling strategy to stay within free tier

## Agentic AI & MCP Layer (Preview)

Early AI integration will adopt a **Model Context Protocol (MCP)** tooling layer instead of embedding raw model prompts inside gameplay Functions. Rationale: prevent prompt sprawl, enable least‑privilege access, and keep the deterministic world model authoritative.

Stage M3 (planned) introduces **read‑only MCP servers** (all advisory, no mutations):

- `world-query-mcp` – Structured room / player / event fetch (no direct DB exposure to prompts)
- `prompt-template-mcp` – Versioned prompt template registry (hash + semantic name)
- `telemetry-mcp` – Standardized AI usage & decision logging

Later phases add controlled proposal endpoints (`world-mutation-mcp`) plus retrieval (`lore-memory-mcp`) and simulation planners. All AI outputs remain **advisory** until validated by deterministic rules (schema, safety, invariants) and only then materialize as domain events.

See `agentic-ai-and-mcp.md` for the full roadmap and server inventory.

### World Event Contract

Queued evolution relies on a `WorldEvent` envelope processed by queue-triggered Functions. The contract specification lives in [`world-event-contract.md`](./world-event-contract.md) and is now **IMPLEMENTED** with:

- Queue processor at [`backend/src/functions/queueProcessWorldEvent.ts`](../../backend/src/functions/queueProcessWorldEvent.ts)
- Zod schema validation at [`shared/src/events/worldEventSchema.ts`](../../shared/src/events/worldEventSchema.ts)
- Idempotency enforcement and telemetry (`World.Event.Processed`, `World.Event.Duplicate`)
- Full test coverage at [`backend/test/worldEventProcessor.test.ts`](../../backend/test/worldEventProcessor.test.ts)

See the contract doc for envelope structure, type namespace, validation flow, and cutover checklist for transitioning HTTP handlers to event-based processing.

## Why This Document Exists

Other documents (like `mvp-azure-architecture.md`) dive into concrete resource diagrams and playtest priorities. This page remains stable as a high‑level reference so links such as "Architecture Overview" do not break as tactical details shift.

## Implementation to Design Mapping

| Implementation File                               | Design Documentation                                                                                                                                                                                                               | Notes                            |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `backend/src/functions/ping.ts`                   | [M0 Closure Summary](../milestones/M0-closure-summary.md#ping-service-liveness)                                                                                                                                                    | Service liveness health check    |
| `backend/src/functions/bootstrapPlayer.ts`        | [M0 Closure Summary](../milestones/M0-closure-summary.md#guest-guid-bootstrap)                                                                                                                                                     | Idempotent player creation       |
| `backend/src/functions/queueProcessWorldEvent.ts` | [World Event Contract](./world-event-contract.md)                                                                                                                                                                                  | Queue-triggered event processor  |
| `backend/src/functions/playerMove.ts`             | [Navigation & Traversal](../modules/navigation-and-traversal.md)                                                                                                                                                                   | Movement command handler         |
| `backend/src/functions/locationLook.ts`           | [Exits](../concept/exits.md), [Direction Resolution](../concept/direction-resolution-rules.md)                                                                                                                                     | Location inspection command      |
| `backend/src/functions/linkRooms.ts`              | [Exit Edge Management](../developer-workflow/edge-management.md)                                                                                                                                                                   | Room connection utility          |
| `backend/src/functions/getExits.ts`               | [Exits](../concept/exits.md)                                                                                                                                                                                                       | Exit retrieval endpoint          |
| `shared/src/telemetry.ts`                         | [Observability](../observability.md), [M0 Closure](../milestones/M0-closure-summary.md#telemetry-scaffold)                                                                                                                         | Canonical telemetry framework    |
| `backend/src/repos/locationRepository.ts`         | [ADR-001](../adr/ADR-001-mosswell-persistence-layering.md), [Location Version Policy](./location-version-policy.md), [Repository Interfaces](../developer-workflow/mosswell-repository-interfaces.md)                              | Location persistence abstraction |
| `backend/src/repos/playerRepository.ts`           | [Player-Location Edge Migration](./player-location-edge-migration.md), [ADR-003](../adr/ADR-003-player-location-edge-groundwork.md) (superseded), [Repository Interfaces](../developer-workflow/mosswell-repository-interfaces.md) | Player persistence abstraction   |
| `backend/src/repos/exitRepository.ts`             | [Exits](../concept/exits.md), [Edge Management](../developer-workflow/edge-management.md), [Repository Interfaces](../developer-workflow/mosswell-repository-interfaces.md)                                                        | Exit edge persistence            |
| `backend/src/seeding/seedWorld.ts`                | [Bootstrap Script](../developer-workflow/mosswell-bootstrap-script.md), [ADR-001](../adr/ADR-001-mosswell-persistence-layering.md)                                                                                                 | Idempotent world seeding         |
| `backend/scripts/seed-production.ts`              | [Bootstrap Script](../developer-workflow/mosswell-bootstrap-script.md), [Local Dev Setup](../developer-workflow/local-dev-setup.md)                                                                                                | Production seeding CLI           |

## Related Docs

### Architecture &amp; Design

- `mvp-azure-architecture.md` – Concrete MVP resource layout & playtest priorities
- `world-event-contract.md` – World event envelope specification & queue cutover plan
- `location-version-policy.md` – Exit changes do not affect location version
- `../concept/direction-resolution-rules.md` – Authoritative rules for direction normalization (ambiguous cases, typo tolerance, relative directions)
- `../concept/exits.md` – Exit edge invariants and creation/removal flow
- `agentic-ai-and-mcp.md` – AI integration via Model Context Protocol
- `./player-location-edge-migration.md` – Complete player-location edge migration strategy

### Developer Workflow

- `../developer-workflow/mosswell-repository-interfaces.md` – Repository contracts &amp; persistence patterns
- `../developer-workflow/mosswell-bootstrap-script.md` – World seeding usage &amp; idempotency
- `../developer-workflow/mosswell-migration-workflow.md` – Migration scaffold &amp; dry-run pattern
- `../developer-workflow/edge-management.md` – Exit edge management workflow
- `../developer-workflow/player-bootstrap-flow.md` – Player onboarding sequence
- `../developer-workflow/local-dev-setup.md` – Environment configuration

### Modules &amp; Narrative

- `../modules/world-rules-and-lore.md` – Narrative & systemic framing
- `../modules/navigation-and-traversal.md` – Movement & graph traversal semantics
- `../modules/quest-and-dialogue-trees.md` – Narrative branching concepts

### ADRs &amp; Milestones

- `../adr/ADR-001-mosswell-persistence-layering.md` – Mosswell persistence (includes partition strategy appendix)
- `../adr/ADR-002-graph-partition-strategy.md` – Detailed partition key decision & migration plan
- `../adr/ADR-003-player-location-edge-groundwork.md` – Historical player edge groundwork (superseded by player-location-edge-migration.md)
- `../milestones/M0-closure-summary.md` – M0 Foundation milestone completion

---

_Last updated: 2025-10-22 (updated status accuracy date, added world event processor + Cosmos SQL API containers section, reflected dual persistence pattern)_
