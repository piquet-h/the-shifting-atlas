# Concept Facet: Player Interaction Profile

> FACET: CONCEPT · Stable vocabulary and invariants.
>
> - Parsing and intent extraction: `../design-modules/player-interaction-and-intents.md`
> - Canonicality boundary and interaction modes: `./interaction-modes-and-canonicality.md`

## Essence

A **Player Interaction Profile** is a long-lived, aggregate view of _how a player tends to interact_, derived from observed turns.

It is used to **tune presentation and interpretation** (especially NPC reactions and narration), not to constrain player agency.

## What the profile is (and is not)

### Is

- A summary of observed interaction patterns across many turns
- A low-cardinality set of scores with confidence
- A personalization input for narration and NPC response selection

### Is not

- A rule system that blocks actions
- A morality judge
- A substitute for canonical world state

## Relationship to canonicality

The profile is **non-canonical** by default.

- It may influence _how_ outcomes are narrated or which NPC stance is selected.
- It must not be treated as an authoritative fact about the world.

**Invariant**: Changes to the profile do not directly create canonical deltas.

## Suggested shape (conceptual)

A profile is a small set of continuous axes, each paired with a confidence estimate.

Example axes (non-exhaustive):

- Politeness ↔ hostility
- Verbosity (concise ↔ longform)
- Negotiation tendency (haggle ↔ accept)
- Risk posture (cautious ↔ reckless)
- Use of force ↔ process

Conceptual representation:

```
PlayerInteractionProfile {
  updatedUtc: ISO8601
  sampleCount: number
  axes: {
    politeness: { score: number; confidence: number }
    verbosity: { score: number; confidence: number }
    negotiation: { score: number; confidence: number }
    riskPosture: { score: number; confidence: number }
    forceVsProcess: { score: number; confidence: number }
  }
}
```

## Update & aggregation invariants

- **Minimum sample window**: do not act on early signals; confidence must accumulate before profile effects apply.
- **Gradual change**: updates are smoothed (rolling average / decay), never spiky.
- **No update from simulated-only interactions**: if an interaction was resolved via implicit/fast-forward mode with no grounding signals, do not update the profile.
- **Explainable inputs**: each axis should have a small set of well-defined contributing signals (avoid open-ended freeform tags).

## Guardrails

- The profile may bias _presentation_ (tone, brevity, NPC conversational posture) but must not:
    - change canonical success/failure rules for actions
    - generate punishments for “bad” style
    - become a griefing exploit vector (e.g., spam to force profile drift)

## Related docs

- `./interaction-modes-and-canonicality.md`
- `./dungeon-master-style-guide.md` (future: player style mimic)
- `../design-modules/quest-and-dialogue-trees.md` (future: NPC memory and relationship state)
