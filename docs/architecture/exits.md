# Exit Edge Invariants (Concise)

Single-page reference for exit (location → location) edges. For operational details, batch utilities, and telemetry payload examples see `../developer-workflow/edge-management.md`.

## Purpose

Guarantee traversal integrity, idempotent creation/removal, and clear semantics for movement logic & future AI generation.

## Invariants

1. Directional Uniqueness: At most one active outgoing exit per (fromLocationId, direction).
2. Optional Reciprocity: Reciprocal edge creation is explicit; absence is allowed (one‑way passages) but must not imply hidden state.
3. Non-Versioned: Exit changes never increment the location content/version counter (content vs structure separation).
4. Idempotent Operations: Re-creating an existing exit is a no‑op (no telemetry); removing a non‑existent exit returns `removed=false`.
5. Telemetry Emission: `World.Exit.Created` only on new materialization; `World.Exit.Removed` only on actual deletion.
6. Direction Normalization: Input directions canonicalized to the supported set (`north`, `south`, `east`, `west`, `up`, `down`, `in`, `out`, diagonals if enabled) before persistence. For detailed rules on handling ambiguous cases, typo tolerance, and relative directions, see `direction-resolution-rules.md`.
7. Graph Integrity: No dangling exit targets—creation validates destination existence; scanners surface anomalies only (they do not auto-fix).
8. Independence From Descriptions: Exit addition/removal does not mutate description layers; view composition summarizes current exits separately.

## Minimal Data Shape (Conceptual)

```
ExitEdge {
  from: LocationId
  to: LocationId
  direction: CanonicalDirection
  createdUtc: ISO
  reciprocal?: boolean // stored as separate edge; this flag purely informational
  kind?: 'manual' | 'generated' | 'ai'
  description?: string // optional flavor text (non-canonical navigation logic)
}
```

## Creation Flow (Bidirectional Example)

1. Normalize direction.
2. Check existing forward edge → if present skip forward create.
3. Optionally compute opposite & repeat for reciprocal.
4. Emit `World.Exit.Created` for each new edge.
5. Return metrics `{ created, reciprocalCreated }`.

## Removal Flow

1. Find edge by (from, direction).
2. If not found → `{ removed:false }` (no telemetry).
3. Delete edge; emit `World.Exit.Removed`.

## Movement Enforcement (Consumer Expectations)

-   Movement handler MUST verify matching exit exists before updating player location.
-   One‑way exits: absence of reverse edge is treated as intentional design (no synthetic inverse assumed).
-   Future blocked/conditional exits (locks, faction gates) should extend edge metadata; do not overload deletion.

## Future Extensions (Deferred)

-   Blocking state (`blocked: true` + reason code instead of deletion).
-   Traversal cost / weight for pathfinding heuristics.
-   Skill / attribute requirements (kept separate from existence).

_Last updated: 2025-10-19 (extracted invariants from edge-management guide)_
