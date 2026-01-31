# Concept Facet: NPC Disposition & Dialogue Collapsing

> FACET: CONCEPT · Stable vocabulary and invariants.
>
> Related:
>
> - Interaction modes & canonicality: `./interaction-modes-and-canonicality.md`
> - Player interaction profile: `./player-interaction-profile.md`
> - Dialogue systems (future): `../design-modules/quest-and-dialogue-trees.md`

## Essence

When interactions are resolved implicitly (fast-forward) or when an NPC response must be produced quickly, the world needs a consistent way to:

1. Describe **who the NPC is** (disposition traits)
2. Combine NPC traits with **how the player tends to act** (player interaction profile)
3. Decide **when to render dialogue vs collapse it**

This facet defines vocabulary and invariants for that behavior.

## NPC disposition model

An NPC’s **disposition** is a small set of relatively stable traits that influence how they interpret and respond to players.

Common traits (non-exhaustive):

- Agreeableness
- Suspicion
- Greed
- Lawfulness
- **Gossip propensity** (likelihood to spread rumors / talk about interactions)

**Invariant**: Disposition traits shape _tone and choices_, but do not override canonical world rules (e.g., an NPC cannot sell an item they do not have).

## Interaction resolution logic (high level)

When an interaction involves an NPC, the system may consult:

- **Player Interaction Profile** (aggregate, confidence-weighted)
- **NPC disposition traits** (stable)
- **Local context** (scene, culture, risk, ongoing conflict)

The output is a resolution posture, e.g.:

- cooperative / neutral / guarded / hostile
- verbose vs terse
- transactional vs conversational

**Invariant**: Profile-based adaptation affects NPC response style and framing, not the set of actions a player is allowed to attempt.

## Dialogue collapsing rules

### Definition

**Dialogue collapsing** is the act of resolving an interaction without rendering full turn-by-turn dialogue.

Instead, the system produces:

- A short outcome summary (narrative), and/or
- A structured outcome (for UI), and
- Any canonical deltas that are legitimately implied by the validated outcome

### When to collapse

Collapse is preferred when all are true:

- Low branching risk
- No moral ambiguity requiring careful adjudication
- No irreversible failure risks hidden behind missing information

### When not to collapse

Prefer explicit dialogue when any are true:

- Ambiguity is high (misunderstandings likely)
- Stakes are high (irreversible outcomes)
- Character conflict or persuasion matters
- The NPC is actively deceptive or the player is negotiating in detail

## Canonical deltas still apply

Even when dialogue is collapsed, the system may still generate validated, authoritative deltas such as:

- Inventory / currency changes
- Contracts / reservations / flags (where such systems exist)
- Relationship / memory updates **only if** the relevant system defines them as canonical and the update crosses validation

**Invariant**: Collapsing reduces rendered text, not correctness. Narration must only claim committed state.
