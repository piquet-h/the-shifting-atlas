# Roadmap (Milestone Narrative)

This roadmap expresses intent by milestone (M0–M5) instead of a long numbered issue table. Each item references issues (when created) through GitHub Project views; this file stays stable and terse.

| Milestone                | Objective (Why)                               | Core Increments                                                                                                                                                                     | Issues                     | Exit Criteria                                                                                                                                           |
| ------------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0 Foundation ✅         | Prove deploy + minimal loop viability         | Ping, guest GUID bootstrap, telemetry scaffold                                                                                                                                      | CLOSED                     | **CLOSED** 2025-10-19: Player gets GUID & receives ping consistently                                                                                    |
| M1 Traversal ✅          | Persistent movement across locations          | Location persistence, exit model, move/look commands, direction normalization (N1–N3); data foundations                                                                             | CLOSED                     | Player can move across ≥3 persisted locations; telemetry for move success/failure; persistent player-location tracking (scalar and edge-based) achieved |
| M2 Observability         | Ensure we can see & tune core loop            | Event registry expansion, RU & latency wrappers, health check (DONE #71); AI cost telemetry; Learn More page; Mosswell bootstrap; span enrichment + production exporter (Epic #310) | **52** (4 closed, 48 open) | Dashboards show move success rate & RU/latency for key ops; visibility page live                                                                        |
| M3 AI Read               | Safe advisory AI context only                 | Prompt template registry, read‑only MCP (world-query, prompt-template, telemetry), classification groundwork                                                                        | **8** (0 closed, 8 open)   | AI can supply optional ambience lines; no mutations accepted                                                                                            |
| M4 Layering & Enrichment | Persistent world variation without retcon     | Description layering engine (base + structural), ambient context registry, validator guards                                                                                         | **37** (5 closed, 32 open) | Layers applied & audited; base descriptions immutable                                                                                                   |
| M5 Systems               | Begin systemic depth & extension              | Factions scaffold, economy signals (basic), extension hook sandbox, NPC tick skeleton                                                                                               | **5** (0 closed, 5 open)   | At least one extension hook emits telemetry; NPC tick produces non-blocking event                                                                       |
| M6 Dungeon Runs          | Episodic subgraph instances for replayability | Dungeon template tagging, instance state (SQL), run lifecycle events, entrance/exit handling, telemetry                                                                             | **9** (0 closed, 9 open)   | At least one dungeon template traversable with instance state overlay; clear/abort telemetry emitted                                                    |

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

**M1 Traversal (Completed 2025-10-30):**

-   Core traversal loop (bootstrap → look → move → look) validated across ≥3 persisted locations
-   Exit management (reciprocity, provisioning, removal, consistency scanning) stabilized
-   Direction normalization (N1) integrated; advanced semantic/relative directions deferred
-   Player-location tracking implemented (edge-based model + scalar fallback retired per migration design #131)
-   Telemetry emits success/failure for move & look; data feeding observability baselines
-   Documentation alignment and architecture epics closed

Deferred items moved to appropriate future milestones (semantic exits, relative directions, advanced exit services).

**M2 Observability (NOW):**

-   Telemetry registry expansion & RU/latency wrappers (COMPLETED: #10, #79)
-   Health check implemented (CLOSED: #71); OpenTelemetry correlation pending (#41)
-   AI cost telemetry epic decomposed (#50 + #299–#309) and dashboard refinement (#108, #111)
-   Integrate player-location edge metrics (population per location)
-   Harden telemetry validator & event membership rules
-   Health checks enrichment & Learn More page progression (#171)
-   Span enrichment & production exporter planning (Epic #310)

## Dependency Highlights

-   Layering engine depends on stable location persistence.
-   MCP read-only servers depend on canonical telemetry + prompt template registry.
-   Extension hooks depend on deterministic event contracts.

## Change Process

Material roadmap shifts require updating: this file + affected ADR cross-links. Milestone assignments are the source of truth; see GitHub issues filtered by milestone for granular sequencing.

**Bulk Assignment Note (2025-10-19):** 61 issues now assigned to M1–M5 milestones. Use GitHub Project views to filter by milestone and scope for detailed planning. Deferred issues remain unassigned pending M1 stabilization.

_Last updated: 2025-10-31 (M1 Traversal CLOSED; M2 Observability counts revised after closing health check #71 and decomposing AI Cost Telemetry epic #50 into #299–#309 – remaining foundation now tracing (#41), cost telemetry, API migration, and span enrichment/exporter epic #310)_
