# Concept Facet: Narration Governance & Bounded Creativity

> FACET: CONCEPT · Detailed validator pipeline and telemetry live in `../architecture/narration-governance.md`.

## Essence

AI narrates every turn in a consistent Dungeon Master voice while remaining a _steward_ of canon. Creativity is bounded: additive, ephemeral first, never destructive. Governance defines what kind of narrative flourish is safe to persist.

## Invariants

| Invariant                  | Rationale                                  |
| -------------------------- | ------------------------------------------ |
| Base prose immutable       | Prevent lore retcon & audit loss           |
| Additive layering only     | Historical narrative diff chain            |
| Ephemeral before persist   | Review surface; reduce drift risk          |
| Provenance for every layer | Enables audit, rollback, moderation        |
| Rejection is normal        | Healthy creative filter, not failure state |

## Layer Framing

Simplified conceptual classes:

- **Ambient:** Atmospheric sensory detail (rain hiss, mist drip).
- **Flavor:** Personality / tone inline (wry gull posture).
- **Hint:** Ephemeral clue; not persisted.
- **Structural Event:** Canon-altering additive (stumps after tree felling) under stricter scrutiny.

## Creative Boundaries

| Boundary        | Example Allowed             | Example Blocked              |
| --------------- | --------------------------- | ---------------------------- |
| Lore extension  | "Old sigils crowd the arch" | Inventing a new kingdom name |
| Sensory realism | Mist, creak, distant gull   | Laser beams (wrong genre)    |
| Entity state    | "Feathers settle" after hit | Dead owl still flying        |
| Temporal frame  | Dusk refracted light        | Sun overhead at midnight     |

## Interaction With Other Concepts

- **Parameterized Action Flow:** Supplies authoritative state changes to narrate.
- **Perception Actions:** Source of safe ephemeral hints.
- **Entity Promotion:** Ensures references to promoted entities respect state.
- **DM Style Guide:** Tone filter; governance rejects style drift.

## Risks

| Risk                 | Mitigation Concept                            |
| -------------------- | --------------------------------------------- |
| Canon creep          | Strict whitelist of structural event triggers |
| Layer redundancy     | Similarity checks & rotation                  |
| Humor overload       | Style guide: humor as seasoning, not core     |
| Validator stagnation | Versioned validator; upgrade path logged      |

## Success Signals

- High audit pass rate (≥95%).
- Rejection ratio within healthy exploratory band (e.g. 20–40%).
- Players perceive consistent voice without lore contradictions.

## Change Log

| Date       | Change                              | Author        |
| ---------- | ----------------------------------- | ------------- |
| 2025-10-31 | Initial concept articulation added. | Copilot Agent |

_Governance concept sets philosophical boundaries; runtime enforcement occurs elsewhere._
