---
status: Accepted
date: 2026-01-05
updated: 2026-03-06
---

# ADR-006: Exit traversal time as optional EXIT edge property

## Context

Movement and temporal reconciliation need a consistent, inspectable source for "how long does it take to traverse this exit?"

Today:

- Temporal PI-0 established clocks, reconciliation policies, and action durations (Epic #497).
- The traversal model already reserves an exit traversal-time property (see `docs/design-modules/navigation-and-traversal.md`).
- The temporal system expresses durations in milliseconds aligned to the WorldClock (Epic #822).

We need a durable contract for:

1. Where traversal time lives (edge vs derived vs registry-only)
2. How it composes with action-duration modifiers (encumbrance, injuries, etc.)
3. What property name carries this value

## Decision (Accepted)

1. **Source of truth**: Per-exit traversal time MAY be stored as an optional property on the Gremlin `EXIT` edge and mirrored in the in-memory/SQL location model.
2. **Property name**: `travelDurationMs` — aligned to WorldClock milliseconds. This supersedes the earlier placeholder name `travelMs`.
3. **Semantic unit**: World-clock milliseconds. Values are positive integers representing traversal cost as ms-aligned ticks.
   - Directional asymmetry is explicitly supported (e.g., `up`=120,000ms, `down`=30,000ms between the same two nodes). See `backend/src/worldEvents/travelDurationHeuristics.ts` for the canonical default table.
4. **Resolution rule**:
    - If an `EXIT` edge has `travelDurationMs`, it provides the **base** duration/cost for `move` across that edge.
    - If absent/null, fall back to `ActionRegistry`'s base duration for `move` (backward compatible — existing edges without the property remain readable).
    - Modifiers (encumbrance, wounds, terrain, etc.) apply **multiplicatively** on top of the base duration, regardless of which source provided it.
5. **Repository API**: `ILocationRepository.setExitTravelDuration(fromId, direction, travelDurationMs)` — idempotent; returns `{ updated: boolean }`.

## Rationale

- **World structure belongs in the graph**: Exit-to-exit variability is a property of the world topology (a bridge is faster than a bog).
- **Inspectability**: Edge properties are easy to inspect and reason about during debugging and content authoring.
- **Separation of concerns**: `ActionRegistry` defines the default action cost model; edges optionally override movement cost for specific traversals.
- **Deterministic generation**: Reconnection algorithms (see `docs/design-modules/world-time-temporal-reconciliation.md`) rely on deterministic `travelDurationMs` values on exit edges; the property name is now stable.

## Consequences

### Positive

- Supports uneven traversal cost without proliferating action types.
- Enables future weighted pathfinding experiments (bounded neighborhood) without changing schemas.
- Keeps the default simple (registry-only) for early content.
- Asymmetric up/down durations are explicitly modeled and averaged during layout (see `worldMapPositions.ts`).

### Negative

- Adds one more field to keep consistent across world authoring/generation workflows.
- If we later persist travel durations into historical logs (TemporalLedger / world events), changing semantics becomes more expensive.

## Alternatives considered

1. **Registry-only (no edge override)**
    - Simpler but cannot represent world-specific traversal variability.
2. **Derived cost from vectors / spatial geometry**
    - Promising long-term, but requires stable vector semantics and introduces implicit coupling.
3. **Separate SQL container for traversal costs**
    - More flexible, but splits "world structure" across stores and complicates debugging.

## Revisit triggers

Revisit this ADR when any of the following becomes true:

- **Tick unit migration**: Clocks/durations move from ms-like representation to an explicit unit type or generic tick unit.
- **Exit-cost authoring becomes first-class**: Tooling or generation begins writing per-exit traversal costs at scale.
- **Durations become persisted history**: Movement begins recording per-exit duration/cost into `temporalLedger` and/or `worldEvents`.
- **Derived geometry starts driving travel**: We begin deriving travel cost from vectors/regions and need precedence rules.

## References

- Epic #497 (closed): World Time & Temporal Reconciliation Framework (PI-0 scaffolding)
- Epic #822 (closed): Narrative-time area generation + graph reconnection (world-clock aligned)
- Child #828 (closed): Persist travelDurationMs on exits (world-clock aligned)
- Child #880 (closed): Backend: Require travelDurationMs for generated exits
- `docs/design-modules/navigation-and-traversal.md` (EXIT edge schema)
- `docs/design-modules/world-time-temporal-reconciliation.md` (temporal framework; reconnection rules)
- `docs/architecture/location-clock-storage-decision.md` (temporal storage separation rationale)
- `backend/src/worldEvents/travelDurationHeuristics.ts` (canonical default duration table)
