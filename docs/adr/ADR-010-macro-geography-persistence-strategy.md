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

### Scenario Analysis: Where Gremlin-Native Macro Geography Would Help

| Scenario | Benefit of Gremlin promotion | Current mitigating mechanism |
|---|---|---|
| Cross-area traversal query (e.g., "find path from Area A to B") | Single graph traversal, no file load | Not yet needed; all active traversal is within one settlement area |
| Dynamic macro context update (AI adds a new area) | Graph write, immediately live | AI-generated locations inherit propagated tags; new atlas areas require explicit file authoring regardless |
| Multi-region expansion (new areas not yet in seed files) | Graph is authority; new regions discoverable via traversal | Expansion is planned and authored; files are updated when new areas are designed |
| Runtime macro graph introspection endpoint | No file loading, full graph query | Not yet a product requirement |
| Cost: macro nodes per generation batch | Zero RU uplift for already-persisted tags | Tags already on location vertices; JSON read is in-process, zero network cost |

None of these scenarios is a current blocker. The first (cross-area traversal) becomes relevant when multi-settlement or multi-region generation is active; that milestone has not started.

### Risks of Gremlin Promotion (Enumerated)

1. **Dual-authority window.** Until all JSON logic is removed, both files and graph must be kept in sync. Any divergence causes subtle generation drift (the graph is queried for topology but the file has different barrier semantics, or vice versa). This window can persist for weeks across partial migrations.

2. **Migration complexity.** Macro atlas nodes and edges must be ingested into Gremlin with stable semantic IDs (not GUIDs), because location tags reference them by semantic key (e.g., `macro:area:lr-area-mosswell-fiordhead`). This requires a new ID scheme for macro vertices distinct from location GUIDs, which has not been designed.

3. **RU cost increase.** Every `resolveMacroGenerationContext()` call (invoked per-direction per-batch) would become a Gremlin traversal instead of an in-process array scan. At current batch sizes (2–4 locations per trigger), this represents 6–16 extra Gremlin reads per batch event, on a container already under single-partition RU pressure (see ADR-002).

4. **Sync drift.** The JSON files currently serve as human-readable design documents as well as runtime data sources. Promoting to Gremlin without removing the files creates two writeable surfaces. If a designer edits a JSON file expecting immediate effect, the change will not propagate until a re-seed is run, violating the expectation that the file is authoritative.

5. **Cold-start / seeding dependency.** Seeding would become self-referential: the seed script must ingest macro vertices before seeding location vertices that reference them. This ordering constraint complicates the bootstrap script and adds a new class of idempotency failure.

6. **No runtime dynamic writes yet.** The atlas is a design-time artifact. No current system writes to it at runtime. The complexity of Gremlin management (vertex lifecycle, partition key assignment for macro nodes, traversal query authoring) would be incurred purely for a possible future benefit.

### Hybrid Model Feasibility

The issue explicitly asks to evaluate a hybrid where **JSON files seed Gremlin at deploy time but Gremlin is authoritative at runtime**.

This model is technically feasible but introduces every risk above without eliminating file authoring. The design pipeline remains file-first (designers edit JSON to add areas), so the files never actually become secondary — they remain the real source of truth. The seeding step becomes an obligation rather than a convenience.

**For new areas added by AI generation:** Neither the JSON model nor the Gremlin model handles purely AI-generated macro areas gracefully. In the JSON model, a new area requires a PR to add a JSON node. In the Gremlin model, a new area requires a Gremlin write with a stable semantic ID that the generation system must mint. The Gremlin model is marginally more automation-friendly here, but the problem of minting stable semantic IDs for AI-generated macro areas is unsolved in either model.

**Assessment:** The hybrid adds seeding complexity and dual-authority risk while the design pipeline remains file-first. It is not recommended until there is a concrete requirement for runtime dynamic macro area creation.

### Why the Current Model Works

- **Tags-as-projection:** Macro context tags (`macro:area:`, `macro:route:`, `macro:water:`) are stamped onto Gremlin location vertices at seed time. Any graph traversal that reaches a location vertex implicitly carries macro context. This is a projection of the JSON graph into Gremlin without a formal macro vertex layer.
- **Process-local reads:** JSON files are imported at module load time. All macro lookups are in-process O(n) scans over small arrays (< 20 nodes per atlas). No network hop, no RU charge, no serialization overhead — cost is negligible relative to the downstream Gremlin traversal and AI generation steps.
- **No cross-atlas joins yet:** No current query needs to traverse from a location vertex to a macro area vertex and then onward. When that need arises, the tags already support it via `macro:area:<ref>` filtering.

---

## Consequences

### Positive

- Zero migration work; no dual-authority risk.
- Zero RU cost uplift for macro context resolution during generation batches.
- JSON files remain the single, human-readable design document for macro topology; designers edit them directly.
- Tag propagation already provides implicit macro context on Gremlin vertices without a formal macro vertex layer.
- Seeding pipeline stays simple; no new vertex ordering constraints.

### Negative / Accepted Trade-offs

- **Cross-area traversal query is not natively expressible in Gremlin.** If a future feature requires "find me all locations in macro area X" as a first-class graph traversal, it must either filter on the `macro:area:` tag value (supported but not a graph edge traversal) or wait for Gremlin promotion. Tag-based filtering is sufficient for M4 scenarios.
- **New atlas areas require a code PR.** There is no runtime mechanism to add a macro area without editing a JSON file and redeploying. This is acceptable while the world is single-settlement.
- **AI-generated macro expansion is not supported.** If AI generation should be able to mint new macro areas dynamically (beyond the current frontier depth model), the JSON model cannot accommodate this without a deploy cycle. This is an explicit out-of-scope for M4.

### Revisit Triggers

Revisit this decision (and potentially produce ADR-011 for Gremlin promotion) when **any one** of the following becomes true:

1. Multi-settlement generation is active and cross-area traversal queries are needed at runtime.
2. AI generation must mint new macro areas dynamically without a deploy (runtime macro area creation requirement).
3. Gremlin RU budget is expanded to accommodate macro reads (e.g., after region-based partitioning from ADR-002 is implemented).
4. The number of atlas JSON nodes exceeds 200 per file, making in-process scan performance measurable.

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
