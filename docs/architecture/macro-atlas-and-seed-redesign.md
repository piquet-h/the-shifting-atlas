# Macro Atlas & Seed Redesign

> Status: DESIGN DIRECTION (2026-03-07). This document captures the current architectural direction for introducing a higher-altitude world atlas, redesigning Mosswell seed data around it, and simplifying frontier generation. It is intended to guide future implementation sessions and issue breakdown.

## Purpose

Define the architectural direction for moving from a purely local node-first world seed toward an **atlas-first** spatial model:

- a high-level macro geography exists before most frontier expansion,
- local traversal nodes are seeded and generated _within_ that geography,
- future-node context inherits deterministic regional trends instead of improvising them per node,
- compatibility-first migration is **not** the primary goal for this transition.

This document complements, but does not replace:

- `world-spatial-generation-architecture.md`
- `realm-hierarchy.md`
- `../design-modules/world-spatial-generation.md`

## Working Canonical World Name

The working canonical name for the broader world is:

**Eridun**

Use `Eridun` in design and implementation artifacts when a world-level name is required.

Constraints for usage:

- `Eridun` names the **world**, not a continent, polity, or realm subtype.
- Mosswell remains a local settlement within Eridun.
- If later lore work supersedes the name, that change should be deliberate and documented in the appropriate docs layer rather than drifting ad hoc in code or prompts.

## First Mapped Landmass

The first mapped major landmass within Eridun is:

**The Long Reach**

Usage constraints:

- `The Long Reach` is a **landmass / macro-geographic body**, not the world.
- The current South-Island-inspired first-pass atlas work should be treated as the macro skeleton of **The Long Reach**.
- Mosswell belongs to The Long Reach, not directly to a world-level undifferentiated map.

Why this name:

- it fits the long, narrow reference silhouette,
- it reads naturally as a named traversable landmass,
- it leaves room for other future landmasses within Eridun,
- it avoids tying the setting too literally to real-world geography.

## Core Decision

Adopt a **skeletal macro atlas** before broad further frontier expansion.

The atlas should model **geography**, not a fully authored destination list.

### What exists at atlas level

- macro regions / sectors,
- directional adjacency between macro regions,
- route continuity hints,
- coarse terrain trends,
- hard barriers / constrained transitions where needed.

### What does not need to exist yet

- every future settlement,
- every local traversal node,
- every district / quarter / street,
- continent-scale political and conceptual hierarchies from the broader M7 realm work.

## Geographic Reference Model

The initial Eridun atlas pass should model **The Long Reach**, inspired by the **South Island of New Zealand**, with Mosswell positioned at the head of a Milford Sound-like fiord system.

Important constraint:

> We model the **geographic logic**, not a literal real-world replica.

That means borrowing:

- fiord / sound topology,
- steep coastal and alpine transitions,
- directional terrain coherence,
- pass / valley / shoreline constraints,

while preserving:

- fantasy naming,
- gameplay-first traversal,
- non-Earth lore,
- freedom to compress or soften geography for better exploration.

## Architectural Model

### Layer 0 — World shell

The world-level shell is **Eridun**.

At first pass, Eridun should be defined only lightly:

- the world name,
- the existence of The Long Reach as the first mapped major landmass,
- major surrounding waters if needed for orientation,
- enough world-level structure to support future expansion without implying that the first map is the whole world.

### Layer 1 — Macro atlas

High-altitude graph layer representing regional geography.

Examples (illustrative only):

- `The Long Reach`
- `Mosswell`
- `North Approach`
- `Western Hills`
- `South Farmlands`
- `River Mouth Coast`
- `Eastern Pass`

These are not necessarily player traversal nodes. They are authoritative spatial context.

Practical note:

The persistence strategy for macro geography has been decided in [ADR-010](../adr/ADR-010-macro-geography-persistence-strategy.md): JSON atlas files remain the authoritative source. Macro context is projected onto Gremlin location vertices via `macro:area:`, `macro:route:`, and `macro:water:` tags at seed time rather than as dedicated graph vertices. The Long Reach and Mosswell-area macro regions are represented in `theLongReachMacroAtlas.json` and `mosswellMacroAtlas.json` accordingly.

### Layer 2 — Local traversal graph

Existing `location` nodes remain the player-facing movement layer.

Examples:

- `North Gate`
- `North Road`
- `South Farms`
- `Fish Market Wharf`

These should resolve their broader context from the macro atlas rather than infer it solely from local prose, terrain defaults, or duplicated pending strings.

### Layer 3 — Frontier context inheritance

Pending exits, synthetic future nodes, and generation requests should inherit:

- macro region context,
- directional terrain trends,
- route lineage,
- edge archetype / structural class,
- explicit local overrides when necessary.

## Graph Shape (Decided — see ADR-010)

**Authoritative source: JSON atlas files.** Macro geography is NOT promoted to dedicated Gremlin vertices at this time.

This was evaluated in spike [#962](https://github.com/piquet-h/the-shifting-atlas/issues/962) and decided in [ADR-010](../adr/ADR-010-macro-geography-persistence-strategy.md) (Accepted 2026-03-26). The rationale: tags-as-projection already achieves the primary goal with no extra RU cost or dual-authority risk.

### Current model: tags-as-projection

Macro context tags (`macro:area:<ref>`, `macro:route:<ref>`, `macro:water:<ref>`) are stamped onto Gremlin location vertices at seed time via `applyMacroAtlasBindings()`. Runtime resolution (`resolveMacroGenerationContext()`) reads these tags — no separate Gremlin traversal to a macro vertex is needed.

```
JSON atlas files (bundled at build time)
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

The atlas files are loaded once at process start (module-level imports), not per-request. At runtime, the JSON is only consulted to resolve label names and barrier text — the tags already on the location vertices carry the authoritative structural references.

The high-level invariant remains:

> Local nodes fit into a pre-existing atlas; they do not invent macro geography from scratch during frontier expansion.

### Deferred: Gremlin macro vertex layer

The following vertex/edge types were evaluated and deferred pending the revisit triggers in ADR-010:

- `macro-region` (vertex), `route-corridor` (vertex, optional)
- `within`, `fronts`, directional adjacency edges, `continues_into` / `route_through` (edges)

Revisit via ADR-011 when any ADR-010 revisit trigger fires (multi-settlement cross-area traversal, AI-minted macro areas, expanded Gremlin RU budget, or JSON atlas > 200 nodes per file). See tracking issue [#984](https://github.com/piquet-h/the-shifting-atlas/issues/984).

## Identity and Reference Conventions

The atlas/runtime ID split is intentional and is now enforced by `scripts/verify-runtime-invariants.mjs`.

Rule of thumb:

> Runtime world entities use GUIDs; atlas topology references use semantic keys.

Keep the architecture doc at that altitude; the script and tests are the authoritative enforcement point.

## Frontier Coherence Rules

### Shared directional trend inheritance

Nearby frontier-capable local nodes in the same macro context should typically inherit the same directional terrain trend.

Example:

- if west from `North Gate` trends toward rolling hills,
- then west from nearby north-approach frontier nodes should normally bias toward the same hills,
- unless an explicit stronger local override exists.

This prevents geographically incoherent outcomes such as:

- west from one nearby node → hills,
- west from another nearby node → dense forest,
- despite both nodes belonging to the same local frontier approach.

### Route continuity

The atlas must support named route continuity where appropriate.

Example:

- `North Road` → `North Gate` → unresolved northward expansion

should preserve a `road-continuation` style lineage rather than collapsing into repeated generic `Unexplored Open Plain` scaffolds.

### Narration vs canon

AI prose may **reflect** atlas geography and may suggest plausible environmental hints.

AI prose does **not** automatically define atlas truth.

Example:

- prose: _"the sun sets over the hills to the west"_

That may be:

- a reflection of already-canonical westward hill context, or
- a candidate hint that requires validation/promotion before future generation uses it as authoritative geography.

## Seed Redesign Direction

The Mosswell seed should be redesigned around this atlas-first model.

### Design intent

- stop treating `villageLocations.json` as the only world-shape artifact,
- separate macro geography from local place data where this improves clarity,
- keep the seed readable and hand-authorable,
- optimize for long-term simplicity rather than compatibility with the original bootstrap structure.

### Acceptable transition assumption

For this redesign, a **fresh production reseed** is acceptable.

Implication:

- compatibility shims should be minimized,
- we prefer a cleaner seed contract over preserving legacy field shapes indefinitely,
- the implementation may assume a new production database/world graph will be seeded from the redesigned data.

### Suggested seed split

Illustrative target shape:

- `backend/src/data/eridunAtlas.json`
- `backend/src/data/theLongReachMacroAtlas.json`
- `backend/src/data/mosswellMacroAtlas.json`
- `backend/src/data/mosswellLocations.json`
- optional route continuity seed if needed later

The exact file layout can vary, but the conceptual split should remain:

- world shell,
- first mapped landmass,
- macro geography,
- local traversal nodes,
- explicit relationships between them.

## Canonical Definition of Eridun

Eridun should not remain canon only by mention in prose, issue bodies, or chat transcripts.

The canonical definition should be captured in **both** documentation and machine-readable atlas data.

### Documentation role

Documentation should define:

- naming and scope (`Eridun` = world, `The Long Reach` = first mapped landmass),
- architecture-level invariants,
- how world shell, macro geography, and local traversal layers relate,
- what may be changed in implementation vs what is considered canon.

This document is the current architecture contract for that purpose.

### Data role

Seed / atlas data should define:

- the world shell entry for Eridun,
- The Long Reach as the first mapped landmass,
- the major macro regions and their directional relationships,
- the mapping from Mosswell-area local nodes into that hierarchy.

### Authority model

Until atlas seed artifacts exist, this document is the design source of truth.

Once atlas seed artifacts exist, authority should be split as follows:

- **docs** define semantics, boundaries, and intended interpretation,
- **atlas seed data** defines the concrete canonical world structure shipped into the graph,
- **runtime prose** may reflect canon and propose candidate hints, but must not silently redefine Eridun.

### Practical implication

If future sessions need to answer _"What is Eridun?"_, they should be able to do so from:

1. this architecture doc,
2. the atlas seed files,
3. any later concept/lore docs that formalize world-facing canon.

They should **not** need to rely on chat history.

## Simplification Targets

This transition should remove or reduce the need for the following legacy patterns.

### Likely deprecations

- generic future-node assumptions such as repeated `Unexplored Open Plain` as the primary spatial scaffold,
- repeated per-node pending prose whose only purpose is to carry regional geography,
- terrain-only future-node naming as the main generation context,
- duplicated directional trend hints copied across nearby nodes,
- treating raw `exitAvailability.pending` reason strings as the primary source of geographic truth.

### Likely survivors (in reduced role)

- local `terrain`,
- local `tags`,
- player-facing pending direction copy,
- explicit local overrides for special cases.

## Immediate Transition Program

Tracking references:

- milestone `M4d Macro Geography & Frontier Coherence`
- `#894` Macro geography graph foundation for frontier coherence
- `#896` Deterministic frontier context inheritance from macro geography
- `#892` Deterministic frontier context metadata for pending exits and future nodes
- `#895` Cut over batch generation to macro-context-guided expansion
- `#893` Seed migration and legacy frontier data retirement

These references exist to keep implementation aligned with the documented target state; they are not a substitute for this architecture contract.

## References

- `../README.md`
- `../tenets.md`
- `world-spatial-generation-architecture.md`
- `realm-hierarchy.md`
- `../design-modules/world-spatial-generation.md`
- `../concept/exit-intent-capture.md`
- `../../backend/src/services/AreaGenerationOrchestrator.ts`
- `../../backend/src/worldEvents/handlers/BatchGenerateHandler.ts`
- `../../backend/src/services/AIDescriptionService.ts`

---

_Last updated: 2026-03-27 — Graph Shape section updated to reflect ADR-010 decision_
