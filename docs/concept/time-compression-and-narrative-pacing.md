# Concept Facet: Time Compression & Narrative Pacing

> FACET: CONCEPT · Stable vocabulary and invariants.
>
> Related:
>
> - Interaction modes & canonicality: `./interaction-modes-and-canonicality.md`
> - NPC disposition & dialogue collapsing: `./npc-disposition-and-dialogue-collapsing.md`
> - DM style guide (temporal transition narration): `./dungeon-master-style-guide.md`
> - Temporal reconciliation (implementation): `../design-modules/world-time-temporal-reconciliation.md`

## Essence

The game should feel like it speeds up and slows down naturally.

Pacing is a narrative choice layered on top of canonical outcomes:

- **Canonical state** stays authoritative.
- **Narration** compresses or expands time to match stakes and clarity.

## Interaction speeds

Interaction speed is a player experience mode that determines how much moment-to-moment detail is rendered.

### Role-play (high fidelity)

- Full or near-full turn-by-turn narration.
- Used when dialogue, tension, or uncertainty is the play.

### Guided (partial collapse)

- The system summarizes routine beats but surfaces meaningful choices.
- Used when the intent is clear but some branching risk remains.

### Fast-forward (pure simulation)

- The player states intent and the system produces outcomes without rendering the full exchange.
- Used for routine, low-risk interactions.

**Mapping note**: These speeds often correspond to the explicit vs implicit interaction modes in `./interaction-modes-and-canonicality.md`, and to dialogue collapsing rules in `./npc-disposition-and-dialogue-collapsing.md`.

## Pacing control rules

### Slow down when

- Stakes rise (irreversible outcomes, danger, scarce resources)
- Ambiguity increases (misunderstanding likely)
- Character conflict emerges (persuasion, deception, moral tension)

### Speed up when

- Outcomes are routine
- Player intent is clear
- No meaningful branching risk exists

## Time compression invariants

- Compression changes **rendered detail**, not correctness.
- If the system collapses an interaction, it must still apply any validated canonical deltas (inventory/currency/flags/etc.).
- Narration must not claim events that were not committed to canonical state.
- Avoid mechanical phrasing for time passage in player-facing text (e.g., avoid exact minutes/seconds) unless a subsystem explicitly requires it.

## Relationship to world time

World time and reconciliation may require advancing clocks and aligning timelines, but pacing determines how that change is _experienced_.

- The temporal system owns “what time is.”
- Pacing owns “how we narrate time passing.”
