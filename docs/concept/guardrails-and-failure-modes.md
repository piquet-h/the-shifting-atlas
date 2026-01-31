# Concept Facet: Guardrails & Failure Modes

> FACET: CONCEPT · Stable vocabulary and invariants.
>
> Related:
>
> - Tenets (non-negotiables): `../tenets.md`
> - Canonicality boundary: `./interaction-modes-and-canonicality.md`
> - Narration governance: `./narration-governance.md`
> - Player interaction profile guardrails: `./player-interaction-profile.md`
> - Alignment guardrails: `./alignment-declaration-and-coherence.md`
> - Reward modulation guardrails: `./reward-modulation.md`
> - Single-turn workflow failure modes: `../workflows/foundry/resolve-player-command.md`

## Essence

Guardrails protect the player experience from becoming brittle, unfair, or “gotcha.”

Failure modes are not edge cases — they are normal pathways. The system should fail safely, narrate clearly, and never invent canon to cover gaps.

## 8.1 Alignment guardrails

Alignment/coherence is **evaluation**, not control.

- No per-turn judgement.
- No “alignment violation” punishments.
- Minimum sample window before coherence has meaningful effect.
- No automatic reassignment of declared alignment.

(Details: `./alignment-declaration-and-coherence.md`)

## 8.2 Tone & behavior guardrails

Behavioral signals and the Player Interaction Profile exist to tune _presentation_.

- Never update the Player Interaction Profile from simulated-only interactions.
- Confidence weighting before behavior changes apply.
- Profile adaptation must not become a griefing exploit vector.

(Details: `./player-interaction-profile.md`)

## 8.3 Persistence guardrails

Persistence guardrails ensure reliability under retries, partial failures, and distributed execution.

- **Idempotent deltas**: repeating the same request must not create duplicate side-effects.
- **Atomic writes per store**: each store mutation should be atomic within that store’s constraints.
- **Narration only claims committed state**: narration may speculate ephemerally, but must not present uncommitted outcomes as facts.

These guardrails support the Reliability and Narrative Consistency tenets.

## Common failure modes (player-facing expectations)

- **Missing context**: request additional information or tools; do not guess canon.
- **Tool failure / timeout**: return a safe “try again” response; do not invent outcomes.
- **Validation reject**: do not commit; narrate why (within tone bounds) and suggest valid alternatives.
- **Partial progress**: if some operations committed and others failed, narration must reflect the committed subset only.

(Sequencing and examples: `../workflows/foundry/resolve-player-command.md`)
