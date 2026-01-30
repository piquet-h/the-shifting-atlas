# Concept Facet: Parameterized Action Flow

> FACET: CONCEPT · High-level invariant: player free-form commands map to structured state changes before narration. Technical schemas / telemetry live in `../architecture/parameterized-action-flow.md`.

## Essence

Turn raw player language into structured, replayable world evolution without rewriting base prose. A three‑step invariant:

1. Interpret (derive verb, targets, scope, prerequisites).
2. Parameterize (apply safe state diffs; do not regenerate base text).
3. Narrate (compose base + additive layers + ephemeral sensory flavor).

## Why It Matters

- Prevents lore retcons (base description immutable).
- Enables emergent combination (felled forest + dusk + mist = new mood) without bespoke scripts.
- Creates audit trail (diffs > freeform text mutation) supporting replay & moderation.
- Provides stable substrate for AI to suggest additive variation rather than overwrite canon.

## Player Experience Patterns

| Intent                       | Conceptual Outcome                                         |
| ---------------------------- | ---------------------------------------------------------- |
| "Chop down all the trees"    | Environment shifts state; later narration reflects it.     |
| "Stay very quiet and listen" | No world mutation; heightened sensory detail surfaces.     |
| "Look for wildlife"          | Latent fauna surfaced; becomes interactable if targeted.   |
| "Shoot the owl"              | Emergent narrative detail promoted into persistent entity. |

## Boundaries

- Never regenerate base description for routine change.
- Structural edits require validated additive layers.
- Failure (missing tool) yields narration only; no state mutation.

## Interaction With Other Concepts

- **Layering:** Parameter diffs feed additive layer suggestions.
- **Perception:** Transient flags widen descriptive lens without mutation.
- **Entity Promotion:** Targets move from flavor to persistence post-parameter check.
- **Narration Governance:** Ensures any AI-proposed snippet stays additive and bounded.

## Risks (Conceptual)

| Risk                | Mitigation Concept                                                       |
| ------------------- | ------------------------------------------------------------------------ |
| Overcomplex schemas | Start minimal; add parameters only when a new verb requires persistence. |
| Hidden state drift  | Audit diff logs; keep parameter names stable & explicit.                 |
| AI overreach        | Partition advisory vs authoritative; validator gate for layers.          |

## Success Signals

- Players see consistent aftermath of actions across locations / sessions.
- Minimal confusion when performing sensory vs mutating commands.
- Audit reviewers can explain story progression from parameter timeline alone.

## Change Log

| Date       | Change                              | Author        |
| ---------- | ----------------------------------- | ------------- |
| 2025-10-31 | Initial concept articulation added. | Copilot Agent |

_Concept facet keeps philosophical and experiential framing separate from architectural detail._
