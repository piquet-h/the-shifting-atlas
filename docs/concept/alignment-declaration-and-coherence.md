# Concept Facet: Alignment (Declaration & Coherence)

> FACET: CONCEPT · Stable vocabulary and invariants.
>
> Related:
>
> - Character-driven roleplaying: `./character-driven-roleplaying.md`
> - Canonicality boundary: `./interaction-modes-and-canonicality.md`
> - Player interaction profile: `./player-interaction-profile.md`

## Essence

Alignment in The Shifting Atlas is a **player declaration** of moral posture and intent — not a constraint on what the player can attempt.

The system evaluates **coherence over time** between:

- what the player says they are (declared alignment), and
- what the player tends to do (observed alignment)

This coherence is used for _narrative continuity_ and _incentives_, not for punishment.

## Alignment as declaration (not constraint)

- Players may declare an intended posture (e.g. principled, mercenary, oath-bound, anarchic).
- The world may react socially to patterns of behavior, but the system does not block actions with “alignment violation” errors.

**Invariant**: Alignment is descriptive and interpretive; it must not become a gate that removes player agency.

## Continuous alignment axes (vectors)

Alignment is represented as a vector of continuous axes rather than a single label.

A common (optional) schema is the classic two-axis model:

- Law ↔ Chaos
- Good ↔ Evil

Represent declared alignment as:

$$\vec{a}_d = (a_{law}, a_{good})$$

with each component in $[-1, 1]$.

**Invariant**: The representation must remain small and low-cardinality.

## Observed vs declared alignment

### Observed alignment

Observed alignment is estimated from aggregated behavioral evidence across many turns.

- Single turns are noisy.
- Interpretation is context-dependent.

### Coherence

Coherence measures how closely observed behavior matches declared posture.

Conceptually, coherence can be treated as a scalar score in $[0, 1]$ derived from the distance between $\vec{a}_d$ and an observed estimate $\vec{a}_o$.

**Invariant**: No single-action penalties. Coherence changes only gradually.

## Drift handling

- Coherence should decay gradually when play becomes inconsistent over long windows.
- The system does **not** automatically rewrite the player’s declared alignment.
- If drift persists, the system may use gentle narrative prompts (“Your reputation is… complicated lately.”) rather than punishments.

## What coherence influences

Coherence may influence:

- NPC interpretation and tone
- Faction/religious standing _as a social consequence_
- Optional reward modulation: `./reward-modulation.md`

Coherence must not directly influence:

- whether a player is allowed to attempt an action
- arbitrary random outcomes (“Chaotic Good means unpredictable physics”)

## Guardrails

- No per-turn judgement.
- No “alignment violation” punishments.
- Minimum sample window before coherence has any meaningful effect.
- Treat alignment as narrative continuity and incentive — never moral scoring.
