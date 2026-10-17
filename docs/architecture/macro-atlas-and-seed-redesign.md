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

## Long Reach authoring overlay sidecar

The design-time sidecar contract is [long-reach-authoring-overlay.schema.json](long-reach-authoring-overlay.schema.json)
(JSON Schema Draft 7, `schemaVersion: 1`). A future populated sidecar belongs at repository root as
`the-long-reach.overlay.json`, beside [the-long-reach.jpg](../../the-long-reach.jpg). This contract does not
add a populated coverage inventory, loader, or renderer.

The sidecar is the canonical source for **overlay annotations and editorial ordering**; the JPG is only a
rendered/inspiration view. The [macro atlas](../../backend/src/data/theLongReachMacroAtlas.json) remains authoritative
for geography and transition metadata, and local seed/runtime data remains authoritative for traversal locations.
Editing the sidecar never opens a runtime boundary or writes back to the atlas.

### Entry contract

Each entry describes a coarse `region` or `corridor` footprint. `bounds` uses normalized image coordinates
in `[0, 1]`, with the origin at the top-left, x increasing rightward and y increasing downward.
These are approximate annotation bounds, not traversal geometry or territorial boundaries.
Overlapping footprints are allowed.

| Field                         | Meaning                                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`, `label`                 | Stable unique `lr-overlay-*` identity and human-readable name. Do not derive identity from array position or label.                              |
| `authoringState`              | Editorial designation from the table below. Not a runtime enum.                                                                                  |
| `coverage`                    | `none`, `partial`, or `complete` hand-authored coverage of this entry's scope, independent of whether travel is open.                            |
| `authoringReadiness`          | Canonical `AreaReadinessState` snapshot: `ready`, `partial`, `blocked`, or `deferred`. Required except for inspiration-only entries.             |
| `areaRefs`                    | Optional list of resolved semantic area IDs in `macroGraph.nodes`. Omit when mapping is unresolved; never invent an area to satisfy the overlay. |
| `corridorRefs`, `segmentRefs` | Optional lists of semantic macro corridor/segment node IDs; one footprint may cover several corridors or segments.                               |
| `entrySegmentRef`             | Semantic destination entry segment ID, matching the relevant atlas transition metadata.                                                          |
| `entryAnchorId`               | Optional existing local traversal location GUID for the arrival anchor; never substitute it for an atlas ref.                                    |
| `priority`                    | Optional non-negative integer, lower first; required for `next-to-author`. Ties are allowed and do not imply runtime execution order.            |
| `notes`                       | Required nonblank explanation of scope, coverage evidence, mapping uncertainty, or the operational block/deferral.                               |

References are raw IDs, not `macro:area:*` tags. Missing optional references mean **unresolved/not recorded**,
not an empty or fabricated target. A multi-area zone is allowed only when the stated coverage and readiness
apply consistently to its scope; otherwise split it into separate entries. Do not infer area-wide completeness
from a completely authored corridor or entry anchor.

### Authoring states and runtime alignment

Readiness vocabulary and authoring boundaries follow the
[frontier context contract](frontier-context-contract.md#area-transition-readiness-areareadinessstate).

| `authoringState`   | Required relationship                                                                                                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authored`         | `coverage: complete` for the entry's scope. Does not imply runtime `ready`: an authored segment can still be operationally `blocked` or `deferred`.                                                |
| `transition-ready` | `authoringReadiness: partial`, nonzero coverage (`partial` or `complete`), resolved `areaRefs`, and `entrySegmentRef`. Review must confirm the entry segment is authored and barriers are defined. |
| `next-to-author`   | `authoringReadiness: blocked` or `deferred`, with explicit `priority`. Any coverage is allowed, including an existing partial skeleton.                                                            |
| `blocked`          | `authoringReadiness: blocked` or `deferred`. Any coverage is allowed; `notes` must explain why handoff remains closed.                                                                             |
| `inspiration-only` | `coverage: none`; no readiness, entry segment, or runtime anchor claim. Resolved area/corridor references may orient the inspiration without asserting authored content.                           |

`transition-ready` and `next-to-author` retain their existing workflow meanings; they do not add runtime
readiness states. `blocked` and `deferred` must never be interpreted as generic frontier continuation.
`partial` is not a promise that the current runtime will permit a handoff: consumers still apply their
runtime policy and the authoritative transition edge.

Example sidecar (illustrative bounds and coverage, **not** a current-world inventory):

```json
{
    "$schema": "docs/architecture/long-reach-authoring-overlay.schema.json",
    "schemaVersion": 1,
    "image": "the-long-reach.jpg",
    "atlas": "backend/src/data/theLongReachMacroAtlas.json",
    "entries": [
        {
            "id": "lr-overlay-westwall",
            "label": "Westwall shelf approach",
            "kind": "corridor",
            "bounds": { "left": 0.1, "top": 0.55, "right": 0.25, "bottom": 0.75 },
            "authoringState": "blocked",
            "coverage": "partial",
            "authoringReadiness": "blocked",
            "areaRefs": ["lr-area-fiordmarch-west"],
            "corridorRefs": ["lr-corridor-westwall-shelf"],
            "segmentRefs": ["lr-corridor-westwall-shelf"],
            "entrySegmentRef": "lr-corridor-westwall-shelf",
            "priority": 1,
            "notes": "Illustrative partial entry skeleton; destination handoff remains closed pending a barrier/content review."
        },
        {
            "id": "lr-overlay-unmapped-north",
            "label": "Unmapped northern inspiration",
            "kind": "region",
            "bounds": { "left": 0.4, "top": 0.05, "right": 0.7, "bottom": 0.2 },
            "authoringState": "inspiration-only",
            "coverage": "none",
            "notes": "Geographic inspiration only; no single atlas area mapping has been agreed."
        }
    ]
}
```

### Validation and review gate

Schema validation rejects unknown fields, unsupported versions or state values, blank text, malformed IDs,
out-of-range coordinates, duplicate references within a list, and contradictory designation/readiness combinations.
The following semantic checks are additionally required in review; JSON Schema alone cannot resolve atlas/runtime
references, compare bounds, or enforce uniqueness by entry ID:

1. Confirm unique entry IDs, `left < right`, and `top < bottom`. Reject zero-area/reversed bounds.
2. Resolve every supplied atlas reference against the named atlas; verify area and corridor node classes.
   Segment refs name macro nodes, not runtime location GUIDs. Verify any `entryAnchorId` against local seed/runtime
   locations and confirm its association with the entry segment.
3. Compare readiness and entry segment claims with area `authoringReadiness` and the relevant inbound
   `macro-transition` edge's `destinationAreaRef`, `destinationReadiness`, and `entrySegmentRef`.
   Missing metadata is unknown, not implicitly ready. A disagreement is a review blocker: correct the overlay
   or explicitly review an atlas update separately; never let the sidecar override it.
4. Reject a transition-ready claim if any relevant inbound edge is operationally blocked, or the destination
   lacks an authored entry segment/barrier definition. Preserve the existing prohibition on
   `traversal: blocked` with `destinationReadiness: ready`.
5. For unresolved or multi-area mappings, explain uncertainty in `notes`. Split entries when corridors or
   destinations have different coverage/readiness; overlapping entries must not make conflicting claims for
   the same segment. Record why authored content remains blocked instead of discarding its coverage.
6. Review priority ties and missing links explicitly; array order and JPG colors do not establish readiness
   or silently resolve ambiguous mappings. An empty `entries` array is a valid unpopulated overlay.

Run the focused schema/example tests from repository root after `npm ci`:
`node --test scripts/test/long-reach-authoring-overlay.test.mjs`.
They validate the contract and illustrative fixtures, not the live world's authoring coverage.

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

## Seed Migration Cutover Status (M4d #893)

This section is the explicit cutover record requested by `#893`'s checklist item _"Document which legacy fields remain temporarily and what is removed at each cutover step"_. It is the closing audit for M4d on the seed/tooling side.

### Removed / no-longer-authoritative

| Pattern                                                             | Where it lived                    | Cutover action                                                 | Replacement                                                                                                                         |
| ------------------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `Unexplored Open Plain (<dir>)` placeholder labels                  | `scripts/render-boundary-map.mjs` | Removed in #893 follow-up                                      | Actual `exitAvailability.pending` prose is surfaced on pending pseudo-nodes; `forbidden` exits render alongside with reason + motif |
| Generic future-node naming as the main generation context           | batch generation handlers         | Already cut over in #1019 (batch-generation-cutover-expansion) | Macro-context-guided naming via `resolveMacroGenerationContext()`                                                                   |
| Duplicated per-node directional trend hints                         | `villageLocations.json`           | No longer relied on for direction priority                     | Atlas-inherited tags (`macro:area:*`, `macro:route:*`, `macro:water:*`) drive `scoreExpansionDirection()`                           |
| Treating raw `exitAvailability.pending` reasons as geographic truth | Frontier policy                   | Cut over                                                       | `frontierSelectionPolicy` uses atlas scores when `macro:*` tags are present; declaration order is only a fallback                   |

### Retained (intentional — runtime contract, not legacy)

| Field / tag                                   | Role                                                                                                                                                             | Why it stays                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `exitAvailability.pending` (prose values)     | Player-facing copy when a pending direction is described in narration                                                                                            | Listed as "Likely survivor: player-facing pending direction copy" above. Not a duplicate of macro context — it's the user-visible hint, while macro tags drive generation.                                                                                                                                                                                                       |
| `exitAvailability.forbidden` (reason + motif) | Narration of why a direction is impassable; motif feeds consistent reveal hints                                                                                  | Has no structured-atlas equivalent today; deletion would lose narration anchors.                                                                                                                                                                                                                                                                                                 |
| `frontier:boundary` tag                       | **Priority flag** for `selectFrontierExits()` — locations with this tag have their pending exits treated as high-priority candidates for demand-driven expansion | _Not_ redundant with `macro:area:*`. Macro tags describe _where_ a location sits in the atlas; `frontier:boundary` declares _intent_ that this node is an expansion frontier. A location can carry `macro:area:*` without being a frontier (e.g., interior nodes), and removing the tag would break the cap-aware selection contract documented in `frontierSelectionPolicy.ts`. |
| Local `terrain` / `tags`                      | Per-node descriptive metadata                                                                                                                                    | Atlas describes regional trend; local tags describe the specific node. Both are needed.                                                                                                                                                                                                                                                                                          |

### Audit / debug tooling parity

- `scripts/render-boundary-map.mjs` now surfaces macro context tags on boundary node labels, renders forbidden exits as a separate dashed-red pseudo-node, and uses the real pending prose for each pending direction. Run via `npm run map:boundaries -- --json=tmp/report.json` to capture both the Mermaid map and a JSON summary that includes `boundaryLocations`, `pendingLocations`, and `forbiddenLocations` counts.
- Test coverage: `scripts/test/render-boundary-map.test.mjs` (CLI + Mermaid contract); `backend/test/unit/seedWorldMacroBindings.test.ts` and `backend/test/integration/worldSeed.test.ts` cover the seed-side structured authority.

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

_Last updated: 2026-05-15 — Added Seed Migration Cutover Status section (M4d #893 close-out)_
