# Concept Facet: Interaction Modes & Canonicality

> FACET: CONCEPT · Stable vocabulary and invariants. Runtime sequencing belongs in `../workflows/`; technical persistence details belong in `../architecture/`.

## Essence

Players interact with The Shifting Atlas through **turns**. A turn may be rendered as explicit dialogue or collapsed into an implicit simulation, but the system always maintains a strict boundary between:

- **Canonical facts**: authoritative, replayable world state changes.
- **Non-canonical artifacts**: narrative phrasing, style, and inferred interpretation.

This facet defines the vocabulary and invariants used across Design Modules and Workflows.

## Interaction modes

### Explicit dialogue mode

**Definition**: The player’s interaction is rendered as turn-by-turn dialogue (player ↔ world/NPC), and the narrative is shown.

**Used when**: ambiguity, stakes, or character conflict makes the interaction itself part of the play.

### Implicit / fast-forward mode

**Definition**: The player states intent (“buy apples”, “ask for directions”), and the interaction is resolved without rendering the full dialogue. The system produces a concise outcome narration (or even just structured outcome) and applies any canonical deltas.

**Used when**: the interaction is routine and the branching risk is low.

## Canonical vs non-canonical data

### Canonical facts (authoritative)

Canonical facts are persisted and must be treated as truth by future narration.

Examples:

- Player location, inventory, currency
- Contracts/reservations/quest flags (where applicable)
- World events that change shared state
- Relationship state **only if** it is explicitly defined as canonical in the relevant Design Module

### Non-canonical artifacts (ephemeral)

Non-canonical artifacts may be generated freely but must not be treated as authoritative facts.

Examples:

- Exact dialogue text, NPC phrasing
- Tone, humor beats, emotional shading
- Inferred intent (until validated)
- Summaries of simulated interaction

## Observable behavioral signals (non-canonical)

A turn may emit **behavioral signals** describing _how_ the player tends to act. These are observations, not rules.

Common signals (non-exhaustive):

- Politeness ↔ hostility
- Verbosity (concise ↔ longform)
- Negotiation tendency (haggle ↔ accept)
- Use of force ↔ process
- Emotional expression (neutral, urgent, angry)
- Risk posture (cautious ↔ reckless)

**Invariant**: Behavioral signals do not directly change canonical world state.

## Normalisation invariants

- A turn may be represented in multiple forms (raw text, parsed intents, summarized dialogue).
- Only validated canonical deltas may be persisted as canonical facts.
- Narration may explain outcomes, but must not invent canonical facts.

## Related documentation

- Design Module: `../design-modules/player-interaction-and-intents.md` (command parsing and intent extraction)
- Workflow: `../workflows/foundry/resolve-player-command.md` (single-turn orchestration)
- Tenets: `../tenets.md` (authority boundary: canonical state vs narration)
