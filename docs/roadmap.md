# Roadmap (Milestone Narrative)

This roadmap expresses intent by milestone (M0–M5) instead of a long numbered issue table. Each item references issues (when created) through GitHub Project views; this file stays stable and terse.

| Milestone                | Objective (Why)                               | Core Increments                                                                                              | Issues                      | Exit Criteria                                                                                                                                     |
| ------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0 Foundation ✅         | Prove deploy + minimal loop viability         | Ping, guest GUID bootstrap, telemetry scaffold                                                               | CLOSED                      | **CLOSED** 2025-10-19: Player gets GUID & receives ping consistently                                                                              |
| M1 Traversal             | Persistent movement across locations          | Location persistence, exit model, move/look commands, direction normalization (N1–N3); data foundations      | **32** (19 closed, 13 open) | Player can move across ≥3 persisted locations; telemetry for move success/failure; **persistent player-location tracking (scalar or edge-based)** |
| M2 Observability         | Ensure we can see & tune core loop            | Event registry expansion, RU & latency wrappers, health check; Learn More page; Mosswell bootstrap           | **23** (1 closed, 22 open)  | Dashboards show move success rate & RU/latency for key ops; visibility page live                                                                  |
| M3 AI Read               | Safe advisory AI context only                 | Prompt template registry, read‑only MCP (world-query, prompt-template, telemetry), classification groundwork | **8** (0 closed, 8 open)    | AI can supply optional ambience lines; no mutations accepted                                                                                      |
| M4 Layering & Enrichment | Persistent world variation without retcon     | Description layering engine (base + structural), ambient context registry, validator guards                  | **37** (5 closed, 32 open)  | Layers applied & audited; base descriptions immutable                                                                                             |
| M5 Systems               | Begin systemic depth & extension              | Factions scaffold, economy signals (basic), extension hook sandbox, NPC tick skeleton                        | **5** (0 closed, 5 open)    | At least one extension hook emits telemetry; NPC tick produces non-blocking event                                                                 |
| M6 Dungeon Runs          | Episodic subgraph instances for replayability | Dungeon template tagging, instance state (SQL), run lifecycle events, entrance/exit handling, telemetry      | **9** (0 closed, 9 open)    | At least one dungeon template traversable with instance state overlay; clear/abort telemetry emitted                                              |

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

**M1 Traversal (NOW):**

-   Core Traversal: Move/look commands complete (#5, #6, #8, #9, #13 - all CLOSED)
-   Exit Management: Edge reciprocity, batch provisioning, removal, consistency scanner (#126–#130 - all CLOSED; Epic #117 CLOSED)
-   **Player Persistence: Player-location edge migration design (#131 CLOSED), implementation in progress (#168 open, #169 open); bootstrap (#64 Epic open: #167 CLOSED, #168 CLOSED, #169 open, #170 open)**
-   Direction Resolution: Ambiguous direction rules documented (#59 CLOSED); semantic exits (#33) and relative directions (#256) deferred to post-M1
-   Architecture: Documentation alignment epic (#89 - CLOSED; child #239 CLOSED)
-   Supporting: E2E test suite (#14), Learn More page (#171), Security baseline (#42)
-   Testing: Integration test harness (#14), persistence tests (#72, #73)

**Status:** 19/32 issues closed (59% complete). MVP traversal loop functional; **focus on completing player-location edge implementation (#168/#169) as persistent player tracking is part of M1 exit criteria**.

**Rationale for #168/#169 in M1:** Persistent player location is foundational for M1's "persistent movement" objective. While scalar `currentLocationId` provides temporary functionality, graph-based player-location edges are necessary for:

-   Spatial queries (M2 observability: "who is in this location")
-   NPC proximity detection (M5 systems)
-   Multiplayer party cohesion (post-MVP)
-   Consistent data model across world entities (locations, NPCs, players all as vertices)

**Migration Strategy:** Dual-write approach per ADR (#131) minimizes risk; scalar field remains as fallback during transition.

**M2 Observability (Parallel):** 1/23 closed (baseline wrappers expanding). Active: DI suitability workflow (#108), managed API packaging regression (#111)

## Dependency Highlights

-   Layering engine depends on stable location persistence.
-   MCP read-only servers depend on canonical telemetry + prompt template registry.
-   Extension hooks depend on deterministic event contracts.

## Change Process

Material roadmap shifts require updating: this file + affected ADR cross-links. Milestone assignments are the source of truth; see GitHub issues filtered by milestone for granular sequencing.

**Bulk Assignment Note (2025-10-19):** 61 issues now assigned to M1–M5 milestones. Use GitHub Project views to filter by milestone and scope for detailed planning. Deferred issues remain unassigned pending M1 stabilization.

_Last updated: 2025-10-23 (Milestone counts synced with GitHub: M2 1/23, M3 0/8, M4 5/37, M5 0/5, M6 0/9; M1 Traversal: 18/32 closed; focus on persistence migration)_
