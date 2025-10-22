# Architecture Overview

> Status Accuracy (2025-10-03): Only a frontend shell and basic `ping` HTTP Functions exist. Cosmos DB is not yet accessed by code; no queues, no movement/room persistence, no AI integration, and only baseline Application Insights bootstrap (no custom events). This overview reflects intended direction—not current implementation depth.
>
> Terminology Note: _Status Accuracy_ captures the last date the factual implementation claims were manually audited. The footer _Last updated_ reflects the last structural/content edit (which may add future-looking sections without changing audited status lines).

This overview provides a concise narrative bridge between the high‑level vision (persistent, event‑driven text world) and the concrete MVP implementation described in `mvp-azure-architecture.md`.

## Purpose

-   Summarize the architectural intent before deep‑diving into MVP specifics.
-   Clarify phased evolution: unified Backend Function App for HTTP + async processing (embedded API removed).
-   Provide a stable link target for docs referencing an "architecture overview" page.

## Core Tenets

1. Event‑Driven Progression: Player commands and world changes become events; asynchronous processors (future Service Bus + queue‑triggered Functions) evolve state.
2. Stateless Compute: Azure Functions remain stateless; all authoritative data resides in the graph (Cosmos Gremlin) and durable event records.
3. Graph‑First World Model: Rooms, exits, NPCs, items, factions, and quests as vertices/edges enabling semantic traversal and relationship queries.
4. Incremental Modularity: Start with a unified dedicated Functions App for HTTP + queue triggers; SWA serves static assets only.
5. Cost Minimization: Favor free / consumption tiers until sustained playtest load justifies scaling investments.

## Current Slice (MVP Stage)

Implemented (thin slice – see repo for exact handlers):

-   Static Web App (frontend only)
-   Backend `backend/` Functions App (HTTP endpoints + world event queue processors)
-   Repository abstraction (memory adapters) for Rooms & Players
-   In‑memory traversal (2 rooms, movement + fetch handlers)
-   Guest GUID bootstrap with canonical telemetry events (`Onboarding.GuestGuid.Started/Created`)
-   Canonical telemetry framework (`trackGameEventStrict`, event name governance)
-   Stage M3 MCP stubs (planned): `world-query` (read-only), `prompt-template` (hashing registry), `telemetry` (read-only AI usage & decision logging)

Still provisioned but unused: Cosmos DB, Service Bus, Key Vault (no runtime bindings yet).

Not yet implemented (planned):

-   Service Bus queue + queue‑triggered world/NPC processors
-   Runtime Gremlin client & schema bootstrap (Cosmos persistence adapters)
-   Runtime SQL API client (if needed for non-graph entities)
-   Managed identity graph access (replace key‑based secret)
-   Persistent traversal + exit normalization (current memory only)
-   AI prompt integration & dynamic content (advisory then genesis)
-   Telemetry MCP server + cost dashboards

## Evolution Path

Stage Roadmap (Milestones):

1. M0 Foundation – Basic HTTP endpoints (`ping`, onboarding), skeleton world model.
2. M1 Traversal – Persistent locations, exits, movement loop.
3. M2 Observability – Telemetry events, correlation IDs, RU + latency capture.
4. M3 AI Read – Read‑only MCP servers (`world-query`, `prompt-template`, `telemetry`).
5. M4 AI Enrich – Classification + curated lore retrieval.
6. M5 Systems – Proposal endpoints, faction/economy/quest scaffolds.

## Separation of Concerns (Future State)

-   `frontend/` – Presentation + minimal command dispatch
-   `backend/` – All HTTP endpoints + asynchronous world simulation (queue-triggered world event processors + NPC ticks), heavier domain logic
-   `shared/` (expanding) – Currently exports telemetry events + dual entry points; will accrete graph helpers, validation schemas, and MCP tool type definitions

### Shared Package Entry Points (Browser vs Backend)

The `@atlas/shared` workspace now exposes **two entry points** to keep the frontend bundle free of Node‑only dependencies:

-   `index.ts` (default / backend): full export surface, including telemetry initialization that references Node built‑ins (`node:crypto`) and the Azure Application Insights SDK.
-   `index.browser.ts` (browser-mapped via the `"browser"` field in `shared/package.json`): minimal, currently exports only canonical telemetry event name constants. It deliberately omits telemetry initialization and any code touching Node APIs.

Bundlers (Vite/Rollup) automatically substitute the browser build when targeting the frontend, preventing accidental inclusion of heavy or incompatible modules. When adding new shared utilities for the frontend, export them from `index.browser.ts` **only if** they are:

1. Pure TypeScript/JS (no dynamic `require`, no Node built‑ins like `fs`, `net`, `crypto` beyond standard web APIs).
2. Side‑effect free (no environment inspection or global initialization).
3. Stable (domain constants, pure functions, type definitions).

If a utility requires conditional behavior (different in backend vs browser), prefer a thin adapter in the frontend rather than branching logic inside shared code, to keep the browser surface auditable and tree‑shakable.

## Data & World Graph Principles

-   Stable GUIDs for all nodes (players, rooms, NPCs)
-   Exits encoded as edges with semantic direction labels (`north`, `up`, etc.)
-   Events optionally stored as vertices or external log for replay/analytics
-   Prefer idempotent mutations: processors verify current state before applying changes
-   Planned multi‑scale spatial layer (see `../modules/geospatial-and-hydrology.md`) introducing Region, WaterBody, and RiverSegment vertices; early traversal code should avoid assumptions that all traversable context fits only in `Location` properties.
-   Tokenless description layering (see `../modules/description-layering-and-variation.md`) keeps base prose immutable; variation (weather, faction displays, structural damage) is additive via validated layers.
-   Partition key strategy: single logical partition during Mosswell bootstrap (MVP concession) with documented region sharding migration path (see `../adr/ADR-002-graph-partition-strategy.md` and Appendix in `../adr/ADR-001-mosswell-persistence-layering.md`).

## Security & Identity Roadmap

-   Short term: Key Vault secret injection for Cosmos key
-   Mid term: System-assigned managed identity for SWA + Functions with data plane RBAC
-   Long term: Microsoft Entra External Identities for player auth; claims map to player vertex

### External Identity Upgrade Flow (Preview)

Upgrade path (guest → linked identity) will remain deferred until traversal persistence is stable. Planned minimal contract:

1. Guest session issues `playerGuid` (already implemented).
2. Client obtains external auth token (Microsoft Entra External Identities) off-band.
3. `POST /player/link` supplies token; backend validates & maps stable `sub` → existing guest `playerGuid` (no new player row created).
4. Idempotency: repeated link attempts for same `sub` return 200 + existing mapping.
5. Telemetry: `Auth.Player.Upgraded` emitted exactly once per mapping; subsequent calls emit `Player.Get` only.

Gating Conditions (before implementation):

-   Traversal & movement telemetry shipping (ensures onboarding instrumentation baseline).
-   Secret / managed identity flow for Cosmos active (avoid embedding token logic early).
-   Decision on whether multi-provider auth is needed at MVP; if deferred, design for future provider expansion via provider prefix in stored external ID.

Full flow diagram will be added here once an Entra app registration is provisioned (avoid speculative drift now).

## Observability Roadmap

-   Introduce Application Insights (function invocation traces, dependency calls)
-   Custom events: player command issued, world event processed, NPC action resolved
-   Sampling strategy to stay within free tier

## Agentic AI & MCP Layer (Preview)

Early AI integration will adopt a **Model Context Protocol (MCP)** tooling layer instead of embedding raw model prompts inside gameplay Functions. Rationale: prevent prompt sprawl, enable least‑privilege access, and keep the deterministic world model authoritative.

Stage M3 (planned) introduces **read‑only MCP servers** (all advisory, no mutations):

-   `world-query-mcp` – Structured room / player / event fetch (no direct DB exposure to prompts)
-   `prompt-template-mcp` – Versioned prompt template registry (hash + semantic name)
-   `telemetry-mcp` – Standardized AI usage & decision logging

Later phases add controlled proposal endpoints (`world-mutation-mcp`) plus retrieval (`lore-memory-mcp`) and simulation planners. All AI outputs remain **advisory** until validated by deterministic rules (schema, safety, invariants) and only then materialize as domain events.

See `agentic-ai-and-mcp.md` for the full roadmap and server inventory.

### World Event Contract (Preview)

Queued evolution (post-MVP) relies on a `WorldEventEnvelope` contract processed by queue-triggered Functions. A dedicated specification now lives in `world-event-contract.md`. Early HTTP handlers that _simulate_ events should shape objects to this contract to reduce refactor friction.

Note: The legacy `WorldEvent` interface in `domainModels.ts` is for SQL persistence of event history; the queue contract uses `WorldEventEnvelope` with Zod validation. See `world-event-contract.md` for details on the intentional separation.

## Why This Document Exists

Other documents (like `mvp-azure-architecture.md`) dive into concrete resource diagrams and playtest priorities. This page remains stable as a high‑level reference so links such as "Architecture Overview" do not break as tactical details shift.

## Related Docs

-   `mvp-azure-architecture.md` – Concrete MVP resource layout & playtest priorities
-   `direction-resolution-rules.md` – Authoritative rules for direction normalization (ambiguous cases, typo tolerance, relative directions)
-   `exits.md` – Exit edge invariants and creation/removal flow
-   `../modules/world-rules-and-lore.md` – Narrative & systemic framing
-   `../modules/navigation-and-traversal.md` – Movement & graph traversal semantics
-   `../modules/quest-and-dialogue-trees.md` – Narrative branching concepts
-   `../adr/ADR-002-graph-partition-strategy.md` – Detailed partition key decision & migration plan
-   `../adr/ADR-001-mosswell-persistence-layering.md` – Mosswell persistence (includes partition strategy appendix)

---

_Last updated: 2025-10-02 (added Shared Package entry point separation section)_
