# ActionIntent Migration Shape (Concise)

> Status: DESIGN  
> Purpose: Describe the migration _shape_ required to comply with ActionIntent persistence.

This document intentionally avoids detailed pseudocode. Sequencing is tracked in GitHub issues/milestones.

## Contract recap (normative)

See `docs/architecture/action-intent-persistence.md`. Summary:

- Player-initiated envelopes MUST include `WorldEventEnvelope.payload.actionIntent`.
- `WorldEventEnvelope.payload` is passthrough, but must satisfy the envelope rule above.

## Migration shape (non-normative)

1. **Shared contract + validation**
    - Define `ActionIntent` (type + schema)
    - Enforce: `actor.kind === 'player'` ⇒ `payload.actionIntent` required

2. **Producers updated together (breaking change)**
    - Any producer emitting player-actor envelopes must populate ActionIntent
    - Start with canonical player actions (Move + other core actions that emit events)

## Boundary to keep explicit

The component that emits a world event must have ActionIntent available.

If intent is captured in a handler but emission happens in middleware/orchestration, propagate `actionIntent` explicitly (do not reconstruct it later).

## References

- `docs/architecture/action-intent-persistence.md` (contract)
- `docs/architecture/event-classification-matrix.md` (Rule 2.5)
