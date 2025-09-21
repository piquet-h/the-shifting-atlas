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

Implemented resources (infrastructure / repos):

- Azure Static Web Apps (frontend + co‑located Functions) – active
- Experimental separate `backend/` Functions app – exists, not yet differentiated
- Cosmos DB (Gremlin API) – provisioned only (no client usage)
- Key Vault – secret storage only (no managed identity yet)

In code today:

- React + Vite frontend shell with command interface (ping only)
- SWA managed API `Ping` function
- Separate backend Functions app with `ping`/health endpoints (experimental)
- Telemetry bootstrap (App Insights) without custom domain events

Not yet implemented (planned):

- Service Bus queue + queue‑triggered world/NPC processors
- Runtime Gremlin client & schema bootstrap
- Runtime SQL Api client & schema bootstrap
- Custom telemetry events (only base collection exists)
- Managed identity graph access (replace key‑based secret)
- Movement / traversal logic & world persistence
- AI prompt integration & dynamic content

## Evolution Path

Phase 1 (Now): Co‑located Functions for all HTTP endpoints (ping only) + exploratory separate Functions app.
Phase 2: Introduce Service Bus + queue processors in the dedicated `backend/` Functions app.
Phase 3: Add telemetry (App Insights), identity‑based graph access, and initial NPC behavioral scripts.
Phase 4: Expand domain modules (economy, factions, dialogue tree interpreter) and optional AI-assisted content.

## Separation of Concerns (Future State)

- `frontend/` – Presentation + minimal command dispatch
- `frontend/api/` – Lightweight synchronous request handlers
- `backend/` – Asynchronous world simulation (queue triggers), heavier domain logic
- `shared/` (future) – Reusable graph + validation helpers

## Data & World Graph Principles

- Stable GUIDs for all nodes (players, rooms, NPCs)
- Exits encoded as edges with semantic direction labels (`north`, `up`, etc.)
- Events optionally stored as vertices or external log for replay/analytics
- Prefer idempotent mutations: processors verify current state before applying changes

## Security & Identity Roadmap

- Short term: Key Vault secret injection for Cosmos key
- Mid term: System-assigned managed identity for SWA + Functions with data plane RBAC
- Long term: Microsoft Entra External Identities for player auth; claims map to player vertex

## Observability Roadmap

- Introduce Application Insights (function invocation traces, dependency calls)
- Custom events: player command issued, world event processed, NPC action resolved
- Sampling strategy to stay within free tier

## Why This Document Exists

Other documents (like `mvp-azure-architecture.md`) dive into concrete resource diagrams and playtest priorities. This page remains stable as a high‑level reference so links such as "Architecture Overview" do not break as tactical details shift.

## Related Docs

- `mvp-azure-architecture.md` – Concrete MVP resource layout & playtest priorities
- `../modules/world-rules-and-lore.md` – Narrative & systemic framing
- `../modules/navigation-and-traversal.md` – Movement & graph traversal semantics
- `../modules/quest-and-dialogue-trees.md` – Narrative branching concepts

---

_Last updated: 2025-09-15_
