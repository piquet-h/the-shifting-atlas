# Roadmap (Milestone Narrative)

This roadmap expresses intent by milestone (M0–M5) instead of a long numbered issue table. Each item references issues (when created) through GitHub Project views; this file stays stable and terse.

| Milestone                | Objective (Why)                           | Core Increments                                                                                              | Exit Criteria                                                                     |
| ------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| M0 Foundation ✅         | Prove deploy + minimal loop viability     | Ping, guest GUID bootstrap, telemetry scaffold                                                               | **CLOSED** 2025-10-19: Player gets GUID & receives ping consistently              |
| M1 Traversal             | Persistent movement across locations      | Location persistence, exit model, move/look commands, direction normalization (N1–N3)                        | Player can move across ≥3 persisted locations; telemetry for move success/failure |
| M2 Observability         | Ensure we can see & tune core loop        | Event registry expansion, RU & latency wrappers, health check                                                | Dashboards show move success rate & RU/latency for key ops                        |
| M3 AI Read               | Safe advisory AI context only             | Prompt template registry, read‑only MCP (world-query, prompt-template, telemetry), classification groundwork | AI can supply optional ambience lines; no mutations accepted                      |
| M4 Layering & Enrichment | Persistent world variation without retcon | Description layering engine (base + structural), ambient context registry, validator guards                  | Layers applied & audited; base descriptions immutable                             |
| M5 Systems               | Begin systemic depth & extension          | Factions scaffold, economy signals (basic), extension hook sandbox, NPC tick skeleton                        | At least one extension hook emits telemetry; NPC tick produces non-blocking event |

## Post-MVP Tracks (Emerging)

-   Multiplayer synchronization & party state
-   Quest & dialogue branching engine
-   Economy pricing dynamics + trade routes
-   AI proposal validation & mutation gates (write path)
-   Region sharding (partition evolution) per ADR-002 signals

## Prioritization Principles

1. Unblock traversal before enrichment.
2. Add observability before introducing AI variability.
3. Introduce AI read surfaces before any world mutation.
4. Defer speculative systems (economy/factions) until layering stable.

## Current Focus (Rolling)

**M1 Traversal:** Exit edge model, movement command, look, and direction normalization (N1–N3).

## Dependency Highlights

-   Layering engine depends on stable location persistence.
-   MCP read-only servers depend on canonical telemetry + prompt template registry.
-   Extension hooks depend on deterministic event contracts.

## Change Process

Material roadmap shifts require updating: this file + affected ADR cross-links. Issue tables are intentionally omitted—source of truth for granular sequencing lives in the GitHub issues to milestone mappings.

_Last updated: 2025-10-19 (M0 Foundation closed; transitioned to M1 Traversal focus)_
