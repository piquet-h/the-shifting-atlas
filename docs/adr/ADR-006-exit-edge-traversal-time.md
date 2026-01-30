---
status: Proposed
date: 2026-01-05
---

# ADR-006: Exit traversal time as optional EXIT edge property

## Context

Movement and temporal reconciliation need a consistent, inspectable source for “how long does it take to traverse this exit?”

Today:

- Temporal PI-0 established clocks, reconciliation policies, and action durations (Epic #497).
- The traversal model already reserves an `EXIT.travelMs` edge property (see `docs/design-modules/navigation-and-traversal.md`).
- The temporal system currently expresses durations in milliseconds in multiple places, but the design intent is closer to a _generic tick_ concept (D&D-style “ticks” / discrete time units).

We need a durable contract for:

1. Where traversal time lives (edge vs derived vs registry-only)
2. How it composes with action-duration modifiers (encumbrance, injuries, etc.)
3. How we avoid locking ourselves to “milliseconds” as a semantic unit

## Decision (Proposed)

1. **Source of truth**: Per-exit traversal time MAY be stored as an optional property on the Gremlin `EXIT` edge.
2. **Property name (transitional)**: Use `travelMs` for now to align with existing documentation and schema placeholders.
3. **Semantic unit**: Treat the value as a **generic tick duration** (a discrete time-cost unit), not a promise of real-world milliseconds.
    - A future migration may rename the property to a unit-agnostic name (e.g., `travelTicks` or `travelCost`) once tick semantics are formalized.
4. **Resolution rule**:
    - If an `EXIT` edge has `travelMs`, it provides the **base** duration/cost for `move` across that edge.
    - If absent/null, fall back to `ActionRegistry`’s base duration for `move`.
    - Modifiers (encumbrance, wounds, terrain, etc.) apply **multiplicatively** on top of the base duration, regardless of which source provided it.

## Rationale

- **World structure belongs in the graph**: Exit-to-exit variability is a property of the world topology (a bridge is faster than a bog).
- **Inspectability**: Edge properties are easy to inspect and reason about during debugging and content authoring.
- **Separation of concerns**: `ActionRegistry` defines the default action cost model; edges optionally override movement cost for specific traversals.
- **Future-proofing**: Declaring the unit as “ticks” (semantic) avoids baking in ms as a design constraint.

## Consequences

### Positive

- Supports uneven traversal cost without proliferating action types.
- Enables future weighted pathfinding experiments (bounded neighborhood) without changing schemas.
- Keeps the default simple (registry-only) for early content.

### Negative

- Adds one more field to keep consistent across world authoring/generation workflows.
- If we later persist travel durations into historical logs (TemporalLedger / world events), changing semantics becomes more expensive.

## Alternatives considered

1. **Registry-only (no edge override)**
    - Simpler but cannot represent world-specific traversal variability.
2. **Derived cost from vectors / spatial geometry**
    - Promising long-term, but requires stable vector semantics and introduces implicit coupling.
3. **Separate SQL container for traversal costs**
    - More flexible, but splits “world structure” across stores and complicates debugging.

## Revisit triggers

Revisit this ADR when any of the following becomes true:

- **Tick unit migration**: Clocks/durations move from ms-like representation to an explicit unit type or generic tick unit.
- **Exit-cost authoring becomes first-class**: Tooling or generation begins writing per-exit traversal costs at scale.
- **Durations become persisted history**: Movement begins recording per-exit duration/cost into `temporalLedger` and/or `worldEvents`.
- **Derived geometry starts driving travel**: We begin deriving travel cost from vectors/regions and need precedence rules.

## References

- Epic #497 (closed): World Time & Temporal Reconciliation Framework (PI-0 scaffolding)
- Epic #696: Temporal PI-1 Integration (Clocks, Ledger, Narrative)
- Epic #697: Temporal Presence & Occupancy (Extensibility)
- `docs/design-modules/navigation-and-traversal.md` (EXIT edge schema includes `travelMs`)
- `docs/design-modules/world-time-temporal-reconciliation.md` (temporal framework overview; partly aspirational)
- `docs/architecture/location-clock-storage-decision.md` (temporal storage separation rationale)
