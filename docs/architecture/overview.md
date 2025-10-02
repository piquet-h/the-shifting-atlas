# Architecture Overview

> Status Accuracy (2025-09-21): Only a frontend shell and basic `ping` HTTP Functions exist. Cosmos DB is not yet accessed by code; no queues, no movement/room persistence, no AI integration, and only baseline Application Insights bootstrap (no custom events). This overview reflects intended direction—not current implementation depth.

This overview provides a concise narrative bridge between the high‑level vision (persistent, event‑driven text world) and the concrete MVP implementation described in `mvp-azure-architecture.md`.

## Purpose

- Summarize the architectural intent before deep‑diving into MVP specifics.
- Clarify phased evolution: co‑located Managed API now, separated services later.
- Provide a stable link target for docs referencing an "architecture overview" page.

## Core Tenets

1. Event‑Driven Progression: Player commands and world changes become events; asynchronous processors (future Service Bus + queue‑triggered Functions) evolve state.
2. Stateless Compute: Azure Functions remain stateless; all authoritative data resides in the graph (Cosmos Gremlin) and durable event records.
3. Graph‑First World Model: Rooms, exits, NPCs, items, factions, and quests as vertices/edges enabling semantic traversal and relationship queries.
4. Incremental Modularity: Start with a co‑located API (Static Web Apps Managed API). Introduce a dedicated Functions app only when queue depth or execution isolation demands it.
5. Cost Minimization: Favor free / consumption tiers until sustained playtest load justifies scaling investments.

## Current Slice (MVP Stage)

Implemented (thin slice – see repo for exact handlers):

- Static Web App (frontend + managed API)
- Experimental separate `backend/` Functions app (health + ping)
- Repository abstraction (memory adapters) for Rooms & Players
- In‑memory traversal (2 rooms, movement + fetch handlers)
- Guest GUID bootstrap with canonical telemetry events (`Onboarding.GuestGuid.Started/Created`)
- Canonical telemetry framework (`trackGameEventStrict`, event name governance)
- Stage M3 MCP stubs (planned): `world-query` (read-only), `prompt-template` (hashing registry)

Still provisioned but unused: Cosmos DB, Service Bus, Key Vault (no runtime bindings yet).

Not yet implemented (planned):

- Service Bus queue + queue‑triggered world/NPC processors
- Runtime Gremlin client & schema bootstrap (Cosmos persistence adapters)
- Runtime SQL API client (if needed for non-graph entities)
- Managed identity graph access (replace key‑based secret)
- Persistent traversal + exit normalization (current memory only)
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
- `frontend/api/` – Lightweight synchronous request handlers
- `backend/` – Asynchronous world simulation (queue triggers), heavier domain logic
- `shared/` (future) – Reusable graph + validation helpers

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
- Planned multi‑scale spatial layer (see `../modules/geospatial-and-hydrology.md`) introducing Region, WaterBody, and RiverSegment vertices; early traversal code should avoid assumptions that all traversable context fits only in `Location` properties.
- Tokenless description layering (see `../modules/description-layering-and-variation.md`) keeps base prose immutable; variation (weather, faction displays, structural damage) is additive via validated layers.

## Security & Identity Roadmap

- Short term: Key Vault secret injection for Cosmos key
- Mid term: System-assigned managed identity for SWA + Functions with data plane RBAC
- Long term: Microsoft Entra External Identities for player auth; claims map to player vertex

## Observability Roadmap

- Introduce Application Insights (function invocation traces, dependency calls)
- Custom events: player command issued, world event processed, NPC action resolved
- Sampling strategy to stay within free tier

## Agentic AI & MCP Layer (Preview)

Early AI integration will adopt a **Model Context Protocol (MCP)** tooling layer instead of embedding raw model prompts inside gameplay Functions. Rationale: prevent prompt sprawl, enable least‑privilege access, and keep the deterministic world model authoritative.

Stage M3 (planned) introduces **read‑only MCP servers**:

- `world-query-mcp` – Structured room / player / event fetch (no direct DB exposure to prompts)
- `prompt-template-mcp` – Versioned prompt template registry (hash + semantic name)
- `telemetry-mcp` – Standardized AI usage & decision logging

Later phases add controlled proposal endpoints (`world-mutation-mcp`) plus retrieval (`lore-memory-mcp`) and simulation planners. All AI outputs remain **advisory** until validated by deterministic rules (schema, safety, invariants) and only then materialize as domain events.

See `agentic-ai-and-mcp.md` for the full roadmap and server inventory.

## Why This Document Exists

Other documents (like `mvp-azure-architecture.md`) dive into concrete resource diagrams and playtest priorities. This page remains stable as a high‑level reference so links such as "Architecture Overview" do not break as tactical details shift.

## Related Docs

- `mvp-azure-architecture.md` – Concrete MVP resource layout & playtest priorities
- `../modules/world-rules-and-lore.md` – Narrative & systemic framing
- `../modules/navigation-and-traversal.md` – Movement & graph traversal semantics
- `../modules/quest-and-dialogue-trees.md` – Narrative branching concepts

---

_Last updated: 2025-10-02 (added Shared Package entry point separation section)_
