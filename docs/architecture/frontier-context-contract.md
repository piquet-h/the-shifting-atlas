---
title: Frontier Context Contract
description: Canonicality boundary, precedence rules, and canon-promotion path for deterministic frontier metadata.
---

# Frontier Context Contract

Purpose: Define the authoritative contract for structured frontier metadata — the inspectable, machine-readable envelope that describes pending exits and synthetic future nodes.  This document covers the canonicality boundary, precedence rules, and the path by which an AI-authored narrative cue may be promoted into canon.

## Why structured frontier context

Before this contract, pending exits carried only a human-readable reason string (e.g. `"North Road continues north, keeping its route identity."`).  Downstream consumers — map visualisation, narration, batch generation shaping — had to reverse-engineer intent from freeform prose.

Structured frontier context makes that intent explicit and inspectable without replacing the human-readable description.

## Core types

### `FrontierStructuralArchetype`

A machine-readable classification of what structural kind of location lies beyond an unresolved exit.

| Archetype    | Directions          | Meaning                                                |
| ------------ | ------------------- | ------------------------------------------------------ |
| `interior`   | `in`, `out`         | Structural entry into/out of a building or enclosed space |
| `vertical`   | `up`, `down`        | Elevation change: stairs, ladder, cliff descent        |
| `waterfront` | cardinal / diagonal | Adjacent to a named body of water                      |
| `overland`   | cardinal / diagonal | Default open-terrain traversal                         |
| `portal`     | any                 | Reserved for magical / instantaneous transitions       |

Precedence when inferring from direction:
1. `interior` — `in` / `out` always classify as interior, regardless of any water context on the source node.
2. `vertical` — `up` / `down` always classify as vertical, regardless of any water context.
3. `waterfront` — cardinal or diagonal with a non-empty `waterSemantics` field (derived from `macro:water:` tag).
4. `overland` — everything else.

Direction-based archetypes (interior, vertical) **always** take precedence over environmental cues.

### `PendingExitMetadata`

Structured context for a single pending exit direction:

| Field                | Type                      | Source                                | Notes                                                         |
| -------------------- | ------------------------- | ------------------------------------- | ------------------------------------------------------------- |
| `structuralArchetype`| `FrontierStructuralArchetype` | inferred from direction + waterContext | Always present                                            |
| `macroAreaRef`       | `string \| undefined`     | `macro:area:<ref>` tag on source node | Geographic envelope the destination is expected to inherit    |
| `routeLineage`       | `string[] \| undefined`   | `macro:route:<ref>` tags              | Route naming and terrain-selection honour these when present  |
| `terrainTrend`       | `string \| undefined`     | Atlas directional trend profile       | Human-readable trend (e.g. "valley widens toward the north")  |
| `waterSemantics`     | `string \| undefined`     | `macro:water:<ref>` tag              | Water body context (e.g. `fjord-sound-head`)                  |
| `barrierSemantics`   | `string[] \| undefined`   | Atlas edge `barrierRefs`              | Named constraints (e.g. `Fiord Deeps`, `Cliffwall`)           |
| `overrideFlags`      | object \| undefined       | Explicit authorial intent             | See Override Flags below                                      |

## Canonicality boundary

**Canonical** means derived deterministically from the atlas (`macro:area:`, `macro:route:`, `macro:water:` tags and the atlas JSON data).  Canonical metadata is authoritative and must not be silently overwritten by AI-generated narrative hints.

**AI-authored cue** means a narrative hint that originates from AI-generated location prose (e.g. "The hills rise steeply to the west.").  These are _proposals_, not canon.

### Rules

1. Structured frontier metadata produced by `resolveMacroGenerationContext` + `buildAtlasAwarePendingMetadata` is canonical.
2. AI-authored cues that mention plausible terrain or direction hints are **proposals until explicitly promoted**.
3. A proposal must never automatically override a canonical `terrainTrend`, `routeLineage`, or `barrierSemantics` value.
4. The `overrideFlags` on `PendingExitMetadata` are a mechanism for explicit authorial intent, not AI autonomy.

## Promotion path

How an AI-authored cue becomes canon:

```
AI narration mentions "hills to the west"
        │
        ▼
Captured as a narrative proposal (not written to tags)
        │
        ▼
Human or tooling reviews the cue for atlas consistency
        │
        ▼
If accepted: add `macro:area:` or directional trend data
             to the atlas JSON and propagate tags to the
             affected location(s)
        │
        ▼
Next call to resolveMacroGenerationContext reflects the
canonical terrain trend; subsequent PendingExitMetadata
for that direction carries the promoted value
```

AI generation **must not** write to `macro:area:`, `macro:route:`, or `macro:water:` tags directly.  Those tags are the boundary of what is canonical.

## Override flags

`overrideFlags` allow an author to explicitly suppress automated atlas inheritance for a specific direction:

| Flag               | Effect                                                                        |
| ------------------ | ----------------------------------------------------------------------------- |
| `terrainOverride`  | Suppress automated terrain selection; honour explicit authorial terrain choice |
| `routeOverride`    | Suppress automated route-lineage inference; don't propagate route naming       |

These are intended for exceptional cases where geography requires a deliberate discontinuity (e.g. a mountain pass that crosses an atlas area boundary).

## Area transition readiness (`AreaReadinessState`)

When frontier travel reaches the boundary of a macro area, the atlas may contain a `macro-transition` edge pointing at a neighbouring area.  Each transition edge carries a `destinationReadiness` field that tells runtime and tooling how to treat the destination.

### Vocabulary

| State      | Runtime meaning                                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| `ready`    | Destination area is fully authored and eligible for runtime area handoff.  Runtime may commit to the new area.    |
| `partial`  | Destination has a skeleton (entry segment, basic structure) but needs further authoring.  Runtime may enter but should degrade gracefully — generic prose and placeholder geography are acceptable. |
| `blocked`  | Destination is intentionally not ready.  Handoff **must not** occur; the transition is an explicit authoring boundary.  Runtime should treat the direction as a soft wall — the player can see that "something is there" but cannot cross. |
| `deferred` | Destination authoring is deliberately deferred to a later milestone or content pass.  Behaves identically to `blocked` at runtime but signals a different editorial intent (postponed, not rejected). |

### Blocked transitions as authoring boundaries

A `blocked` or `deferred` transition is not a bug — it is an intentional content boundary.  Runtime consumers must **never** silently convert a blocked transition into generic continuation (i.e. keep generating open-terrain locations as though no boundary exists).

When `resolveAreaTransitionEdge` returns a transition with `destinationReadiness === 'blocked'` or `'deferred'`:

1. The direction may still appear in `exitAvailability.pending` (the player can see a road heading that way), but the pending reason string should indicate that the way is impassable or not yet open.
2. `buildAtlasConstrainedExitAvailability` may convert the direction to `exitAvailability.forbidden` if barrier refs on the transition edge make traversal impossible.
3. Debug and map surfaces should display the destination area ref and readiness state so authors can see exactly where a content boundary lies.

### Contradiction guard

The runtime invariant checker (`scripts/verify-runtime-invariants.mjs`) flags a contradiction if a transition edge has `traversal: 'blocked'` but `destinationReadiness: 'ready'` — a blocked edge should not indicate a ready destination.

### Inspecting transition edges

`resolveAreaTransitionEdge(areaRef, direction)` returns a `MacroTransitionEdge` (or `undefined`) carrying the full `TransitionMetadata`, including `destinationReadiness`.  Callers branch on readiness without parsing human-readable `threshold` strings:

```ts
const edge = resolveAreaTransitionEdge(areaRef, direction)
if (!edge) { /* no authored transition — stay in current-area continuation */ }
else if (edge.transition.destinationReadiness === 'ready') { /* commit to handoff */ }
else { /* blocked / partial / deferred — remain in current area, surface boundary */ }
```

## Surfaced in API responses

The world graph endpoint (`GET /api/world/graph`) surfaces structured context on every pending edge and its synthetic placeholder node:

- `WorldGraphEdge.frontierContext: PendingExitMetadata` — present on all edges where `pending === true`.
- `WorldGraphNode.structuralClass: FrontierStructuralArchetype` — present on all synthetic pending nodes (tagged `pending:synthetic`).
- `WorldGraphNode.name` — archetype-aware: `'Unexplored Waterfront'` for waterfront directions, `'Unexplored Interior'` for interior, `'Unexplored Upper Level'` / `'Unexplored Lower Level'` for vertical, `'Unexplored Open Plain'` for overland.

## Precedence for conflicting nearby cues

When multiple macro tags are present (e.g. both `macro:area:harbor` and `macro:area:market` on adjacent nodes), the following precedence applies:

1. **Route lineage** (`macro:route:`) — strongest continuity signal; overrides bare area trend.
2. **Named water body** (`macro:water:`) — influences archetype and terrain bias.
3. **Area directional trend** (`macro:area:`) — applies terrain bias based on the atlas trend profile for the expansion direction.
4. **Barrier semantics** — applied last; can convert a pending direction to forbidden (e.g. fiord cliff walls blocking westward expansion).

When two area refs conflict (mixed adjacency), the area ref carried by the source node's own `macro:area:` tag wins.  Atlas edge barriers from both areas are merged.

## Interior and vertical frontier cases

Sparse-tagged source nodes (e.g. a newly materialized hilltop with only `frontier:depth:2`) still produce valid structured context for `in`, `out`, `up`, and `down` directions:

- `structuralArchetype` is inferred from direction alone — no macro tags required.
- `macroAreaRef`, `routeLineage`, `terrainTrend`, `waterSemantics`, `barrierSemantics` are absent (`undefined`) when no atlas data is available.

Consumers must handle absent optional fields gracefully and fall back to conservative generic copy.

## Related

- `backend/src/services/frontierContext.ts` — type definitions and `inferStructuralArchetype`
- `backend/src/services/macroGenerationContext.ts` — `buildAtlasAwarePendingMetadata`, `planAtlasAwareFutureLocation`, `resolveAreaTransitionEdge`, `AreaReadinessState`
- `backend/src/handlers/worldGraph.ts` — surfaces `structuralClass` and `frontierContext` in the world graph API
- `scripts/verify-runtime-invariants.mjs` — validates `destinationReadiness` values and transition contradiction guards
- `docs/concept/exit-intent-capture.md` — exit availability states (hard / pending / forbidden)
- `docs/design-modules/world-spatial-generation.md` — reconnection invariants and AI generation trigger points
- Issue [#892](https://github.com/piquet-h/the-shifting-atlas/issues/892) — progenitor tracking issue
