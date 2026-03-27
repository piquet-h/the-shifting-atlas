---
status: Accepted
date: 2026-03-26
deciders: [piquet-h, copilot]
---

# ADR-010: Macro Geography Persistence Strategy (JSON Files vs Gremlin Graph)

## Status

Accepted

## Context

Macro geography describes the high-level spatial structure of the world — areas, corridors, barriers, continuity routes, and directional terrain trends — at a level above individual location vertices. It currently lives in two JSON files bundled with the backend:

- `backend/src/data/mosswellMacroAtlas.json` — Mosswell settlement area, fjord/sound topology, local continuity routes
- `backend/src/data/theLongReachMacroAtlas.json` — Landmass-level macro graph, regions, and inter-area relationships

### Current Data Flow

```
JSON files (bundled at build time)
  │
  ├─▶ macroAtlasBindings.ts  ─▶  applyMacroAtlasBindings()
  │       Runs at seed time: stamps macro context tags onto Gremlin location vertices
  │       Tags applied: macro:area:<ref>, macro:route:<ref>, macro:water:<ref>
  │
  └─▶ macroGenerationContext.ts  ─▶  resolveMacroGenerationContext()
          Called at runtime from BatchGenerateHandler, reads tags already on location vertices
          Derives: areaRef, routeRefs, waterContext, directionTerrainTrend,
                   routeContinuityHint, preferredFutureNodePrefix, barrierSemantics
          Used by: planAtlasAwareFutureLocation(), selectAtlasAwareTerrain(),
                   selectAtlasAwareExpansionDirections(), scoreAtlasAwareReconnectionCandidate()
```

The architecture achieves an effective hybrid at no extra cost: **macro context is persisted in Gremlin indirectly via location tags**. At runtime the JSON files are read only to resolve label names and barrier text — the tags already on vertices carry the authoritative structural references. Atlas files are loaded once at process start (module-level imports), not per-request.

### The Question

The M4d epic (#894) asks whether macro geography should be promoted to first-class Gremlin vertices and edges, making the graph the single runtime authority instead of JSON files plus tag propagation.

---

## Decision

**Retain JSON files as the authoritative source for macro geography. Do not promote macro atlas nodes to Gremlin vertices at this time.**

The current tag-propagation model already achieves the primary goal: macro context travels with location vertices inside the graph. Full Gremlin promotion introduces significant complexity and cost for benefits that are not yet needed by any concrete runtime scenario in M4 or M5.

---

## Rationale

No evaluated scenario requires Gremlin-native macro geography at this stage. The key scenarios and why the current model is sufficient:

| Scenario                             | Why deferred                                                                                                                     |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Cross-area traversal query           | Not needed; all active traversal is within one settlement area                                                                   |
| AI-minted new areas                  | New areas require file authoring regardless of storage model; minting stable semantic IDs for Gremlin is unsolved in both models |
| Multi-region expansion               | Expansion is planned and hand-authored; files are updated when new areas are designed                                            |
| Runtime macro introspection endpoint | Not a current product requirement                                                                                                |

Gremlin promotion carries significant friction: dual-authority window during migration, the need to design a new semantic ID scheme (macro vertices cannot use GUIDs — location tags already reference semantic keys like `macro:area:lr-area-mosswell-fiordhead`), 6–16 extra Gremlin reads per batch event on an already-constrained RU budget (ADR-002), and a seeding ordering dependency that complicates the bootstrap script. None of the benefits materialise until multi-settlement traversal or runtime dynamic area creation is required.

The tags-as-projection model already achieves the core goal without these costs: macro context tags (`macro:area:`, `macro:route:`, `macro:water:`) stamped onto location vertices at seed time carry the structural references implicitly into every graph traversal. Macro lookups are in-process O(n) scans over small arrays — no network hop, no RU charge. See [`docs/architecture/macro-atlas-and-seed-redesign.md`](../architecture/macro-atlas-and-seed-redesign.md) for the full data flow and implementation model.

---

## Accepted Trade-offs

- Cross-area traversal is expressed as tag-value filtering, not native graph traversal. Sufficient for M4.
- New atlas areas require a code PR; no runtime mechanism exists to add a macro area without redeploying. Acceptable while the world is single-settlement.
- AI-generated macro expansion (minting new areas dynamically) is not supported. Out of scope for M4.

### Revisit Triggers

Revisit this decision (and potentially produce ADR-011 for Gremlin promotion) when **any one** of the following becomes true. Each trigger has an active enforcement mechanism so it surfaces at the point the condition is met — not from memory.

| #   | Condition                                                                                                       | How it surfaces                                                                                                                                                                                                                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Multi-settlement generation is active and cross-area traversal queries are needed at runtime.                   | `TODO(#984)` comment on the JSON import lines in `backend/src/services/macroGenerationContext.ts`. Any engineer extending that module for multi-settlement will see the note.                                                                                                                             |
| T2  | AI generation must mint new macro areas dynamically without a deploy (runtime macro area creation requirement). | Same `TODO(#984)` in `macroGenerationContext.ts` — the file that would need a Gremlin-backed alternative.                                                                                                                                                                                                 |
| T3  | Gremlin RU budget is explicitly increased above 400 RU/s for the world graph.                                   | The `alert-ru-utilization` Azure Monitor alert fires at sustained ≥70% RU. Its description contains a direct link to [#984](https://github.com/piquet-h/the-shifting-atlas/issues/984) with an explicit action statement. No separate check needed — the alert fires before the budget increase decision. |
| T4  | Either `mosswellMacroAtlas.json` or `theLongReachMacroAtlas.json` exceeds 200 nodes.                            | `verify-runtime-invariants.mjs` emits an `atlas-node-count-threshold` warning on every CI run when the threshold is crossed. No manual check required.                                                                                                                                                    |

Tracking issue: [#984](https://github.com/piquet-h/the-shifting-atlas/issues/984) (M7 Post-MVP). When any trigger fires, evaluate via a spike and, if warranted, produce ADR-011 before proceeding with Gremlin promotion work.

---

## Out of Scope

- Implementing the migration itself (contingent on a future decision to promote).
- Full continent/kingdom hierarchy (#681).
- Changes to the existing location graph schema.

---

## Related

- [ADR-001: Mosswell Persistence & Layering](./ADR-001-mosswell-persistence-layering.md) — Base persistence model
- [ADR-002: Graph Partition Strategy](./ADR-002-graph-partition-strategy.md) — RU budget and partition constraints
- [ADR-004: Player Store Cutover Completion](./ADR-004-player-store-cutover-completion.md) — Dual persistence authority precedent
- Epic #894: Macro geography graph foundation
- `backend/src/data/mosswellMacroAtlas.json` — Settlement-level atlas
- `backend/src/data/theLongReachMacroAtlas.json` — Landmass-level atlas
- `backend/src/services/macroGenerationContext.ts` — Runtime context resolution
- `backend/src/seeding/macroAtlasBindings.ts` — Seed-time tag projection

---

Accepted 2026-03-26.
