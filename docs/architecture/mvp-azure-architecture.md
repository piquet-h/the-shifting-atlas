# MVP Azure Architecture (Concise)

Status (2025-10-19): Frontend shell + backend Functions (ping, onboarding) exist. Persistence, exits, movement, and queue processors pending. This file intentionally minimal—strategic rationale now lives in `overview.md`; milestone intent lives in `../roadmap.md`.

## Core Shape

```plaintext
[Client] → [Azure Static Web Apps]
                |
                v
         [Backend Function App]
                |
                v
        [Cosmos DB (Gremlin + SQL)]
                |
        (future) Queue Processors
                |
        (optional) AI MCP Read Layer
```

| Component               | Role                                               | Notes                                        |
| ----------------------- | -------------------------------------------------- | -------------------------------------------- |
| Static Web Apps         | Serve frontend + auth gateway (future)             | No embedded API; backend isolated            |
| Functions App           | HTTP commands + (later) queue triggers             | Keep handlers thin for async cutover         |
| Cosmos Gremlin          | World graph (locations, exits, NPC shell)          | Single logical partition initially (ADR-002) |
| Cosmos SQL              | Mutable projections (players, inventories, events) | Added when dual persistence needed           |
| Service Bus / Queues    | World + NPC evolution (future)                     | Introduced post synchronous persistence      |
| MCP Servers (read-only) | Structured AI context & prompt templates           | No mutation until validation gates exist     |

## Early Principles

1. Ship traversal loop before AI enrichment.
2. Direct writes first → event/queue refactor second (mechanical, not architectural rewrite).
3. Immutable base descriptions; additive layers (see layering module) – informs persistence design early.
4. Telemetry names stable before volume scaling (avoid dashboard churn).

## Immediate Build Focus (M1 → M2 Bridge)

-   Location persistence (Gremlin)
-   Exit model + movement command
-   Direction normalization & movement telemetry (`Location.Move` with status)

## Pointers

-   High‑level rationale: `overview.md`
-   Event naming: `../observability.md`
-   Partition evolution: `../adr/ADR-002-graph-partition-strategy.md`
-   Layering model: `../modules/description-layering-and-variation.md`

## Deferments

-   AI mutation tools (proposal / generation) – after validation & replay infrastructure
-   Region sharding – gate on RU/latency signals (ADR-002 thresholds)
-   Multiplayer & economy – post stable layering + traversal analytics

_Last updated: 2025-10-19 (condensed; replaced detailed build tables with pointers)_
