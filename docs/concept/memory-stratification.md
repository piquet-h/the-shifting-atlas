# Concept Facet: Memory Stratification

> FACET: CONCEPT · Stable vocabulary and invariants.
>
> Related:
>
> - Canonicality boundary: `./interaction-modes-and-canonicality.md`
> - Player interaction profile: `./player-interaction-profile.md`
> - NPC disposition: `./npc-disposition-and-dialogue-collapsing.md`
> - Narration governance: `./narration-governance.md`
> - Description layering: `../design-modules/description-layering-and-variation.md`
> - Lore storage & surfacing: `../architecture/lore-storage-growth-and-surfacing.md`

## Essence

The Shifting Atlas uses multiple kinds of “remembering.” Not every remembered thing should become canon.

This facet defines a consistent three-tier vocabulary:

1. **World State** (canonical)
2. **NPC Micro‑Memory** (subjective, persistent)
3. **Scene Ephemeral Context** (short-lived)

### Shared narrative artifacts (persistent, non-canonical)

In addition to the three tiers above, the world may maintain **shared narrative artifacts** (a lore corpus): persistent, reviewable story-shaped chunks (rumours, legends, eyewitness accounts) that can be retrieved to enrich dialogue and descriptions.

**Invariant**: Narrative artifacts may be wrong (diegetically) and must not be treated as authoritative world state.

Reference: `../architecture/lore-storage-growth-and-surfacing.md`

## 1) World state (canonical)

**Definition**: Authoritative, replayable facts that the world must treat as true.

Examples:

- Locations, exits, and structural changes
- Player location, inventory, currency
- Contracts / reservations / quest flags (where applicable)

**Invariant**: Canonical world state changes must cross validation and must be consistent with the authority boundary.

## 2) NPC micro‑memory (subjective, persistent)

**Definition**: An NPC’s internal, _subjective_ record of what they believe about the player or recent interactions.

Micro-memory exists to support continuity (“this NPC remembers you”), not to create new hard constraints.

Typical contents:

- NPC ↔ player relationship state (trust, affinity, fear, respect)
- Anchors (“sold map”, “paid fairly”, “lied about name”)
- Beliefs with confidence (and possible decay)

**Invariants**:

- Micro-memory may be wrong: it is not automatically canon.
- If micro-memory is used to justify a canonical consequence, that consequence must still be validated.
- Updates should be confidence-weighted and resistant to spam (no single-turn whiplash).

## 3) Scene ephemeral context (short-lived)

**Definition**: Temporary context used to enrich narration and resolution within a narrow window.

Examples:

- Atmosphere (fog, crowd mood)
- Recently mentioned notable actions
- Short-lived tensions (“the merchant is now wary after that outburst”)

**Invariants**:

- Ephemeral context decays quickly and should not be treated as canonical history.
- Ephemeral context may be used for narration and soft interpretation, but must not invent canonical facts.

## Boundaries between tiers

- **World state** is authoritative.
- **Micro-memory** is durable but subjective.
- **Ephemeral context** is useful but disposable.

**Rule of thumb**: If a fact must be true for all players and all future narration, it belongs in world state. If it only affects how a specific NPC behaves, it belongs in micro-memory. If it only affects the next few beats, it belongs in ephemeral context.
