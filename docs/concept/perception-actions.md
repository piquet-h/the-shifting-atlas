# Concept Facet: Perception & Sensory Actions

> FACET: CONCEPT · Implementation details (transient flags, telemetry) live in `../modules/perception-actions.md`.

## Essence

Perception actions temporarily widen the descriptive lens—surfacing ambient sound, motion, wildlife, scent—without altering structural world state. They heighten immersion and prepare players to interact with emergent details.

## Goals

| Goal              | Description                                                  |
| ----------------- | ------------------------------------------------------------ |
| Immersive quiet   | Listening reveals subtle environment micro‑signals.          |
| Discovery primer  | Wildlife scan introduces latent entities organically.        |
| Non-invasive play | No unintended world mutation; pure observation.              |
| Narrative pacing  | Provides low-intensity beats between transformative actions. |

## Player Experience Examples

-   "Stay very quiet and listen" → Dripping mist, distant creak, leaf rustle.
-   "Look for wildlife" → Deer shapes, owl glide, rat skittering—none persisted yet.
-   Follow-up targeting ("Shoot the owl") promotes the previously latent detail.

## Boundaries

-   Cannot resolve structural change (no tree felling, no exit creation).
-   Ephemeral sensory fragments vanish after narration.
-   Does not force entity promotion—agency preserved.

## Interactions

-   **Entity Promotion:** Perception supplies targetable nouns.
-   **Narration Governance:** Ensures sensory embellishments stay within class boundaries (ambient / hint).
-   **Layering:** Uses existing layers as substrate; does not create new persistent layers directly.

## Risks

| Risk                    | Mitigation Concept                                          |
| ----------------------- | ----------------------------------------------------------- |
| Sensory spam            | Cap fragments; enforce brevity guidelines.                  |
| Player confusion        | Clear narrative cues differentiating action types.          |
| Implicit mutation creep | Architectural separation of transient vs persistent fields. |

## Success Signals

-   Players use perception tactically before interaction.
-   Emergent nouns feel organic, not forced or artificial.
-   Minimal redundancy (no repeated identical sensory lines back-to-back).

## Change Log

| Date       | Change                        | Author        |
| ---------- | ----------------------------- | ------------- |
| 2025-10-31 | Initial concept articulation. | Copilot Agent |

_Pure observation keeps conceptual clarity distinct from technical flag handling._
