# Architecture Overview

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

Implemented resources:

- Azure Static Web Apps (frontend + co‑located Functions)
- Cosmos DB (Gremlin API) – provisioned, not yet actively queried in runtime code
- Key Vault – holds Cosmos key secret (path to identity/RBAC later)

In code today:

- React + Vite frontend shell
- Health & placeholder player action Functions (`frontend/api`)

Not yet implemented (planned):

- Service Bus queue + queue‑triggered world/NPC processors
- Runtime Gremlin client & schema bootstrap
- Application Insights telemetry and distributed traces
- Managed identity graph access (replace key‑based secret)

## Evolution Path

Phase 1 (Now): Co‑located Functions for all HTTP endpoints.
Phase 2: Introduce Service Bus + queue processors in a separate `backend/` Functions app.
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
