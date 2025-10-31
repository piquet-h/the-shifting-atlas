# Roadmap (Execution Facet Milestone Narrative)

Relocated from root to `execution/` to isolate mutable planning from concept & architecture facets.

| Milestone                | Objective                             | Core Increments                                                                    | Issues | Exit Criteria                                           |
| ------------------------ | ------------------------------------- | ---------------------------------------------------------------------------------- | ------ | ------------------------------------------------------- |
| M0 Foundation ✅         | Prove deploy + minimal loop viability | Ping, guest GUID bootstrap, telemetry scaffold                                     | CLOSED | Player receives GUID & ping reliably                    |
| M1 Traversal ✅          | Persistent movement across locations  | Location persistence, exits, move/look, direction normalization                    | CLOSED | Movement across ≥3 locations; telemetry success/failure |
| M2 Observability         | Ensure visibility & tuning            | Event registry expansion, RU/latency wrappers, AI cost telemetry, span enrichment  | 52     | Dashboards show move success & RU/latency               |
| M3 AI Read               | Safe advisory AI context              | Prompt template registry, read‑only MCP servers, classification groundwork         | 8      | AI supplies optional ambience (no mutations)            |
| M4 Layering & Enrichment | Persistent world variation            | Description layering engine, ambient context registry, validator guards            | 37     | Layers applied & audited; base prose immutable          |
| M5 Systems               | Systemic depth & extension            | Factions scaffold, economy signals, extension sandbox, NPC tick skeleton           | 5      | Extension hook telemetry; NPC tick emits events         |
| M6 Dungeon Runs          | Episodic replayability                | Dungeon template tagging, instance state, lifecycle events, entrance/exit handling | 9      | Traversable dungeon template with instance overlay      |

## Post-MVP Tracks

Multiplayer synchronization, quest/dialogue branching, economy dynamics, AI mutation gating, region sharding.

## Prioritization Principles

1. Traversal before enrichment.
2. Observability before AI variability.
3. Advisory AI before mutation.
4. Defer speculative systems until layering stable.

## Current Focus Snapshot (Rolling)

M1 Traversal (Closed 2025-10-30) achievements & deferrals captured in milestone summary docs.
M2 Observability now: telemetry expansion, AI cost, span enrichment, player-location edge metrics.

## Dependencies

Layering depends on stable locations; MCP servers depend on telemetry + prompt registry; extension hooks depend on deterministic event contracts.

## Change Process

Material shifts require updating this file + ADR cross-links. Use GitHub issue milestone filters for sequencing.

## Change Log

| Date       | Change                              |
| ---------- | ----------------------------------- |
| 2025-10-31 | Relocated to execution facet.       |
| 2025-10-31 | M1 Traversal closed counts updated. |

---

_Relocated: 2025-10-31_
