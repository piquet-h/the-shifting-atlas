# Design Document: Perception & Sensory Actions

> FACET: ARCHITECTURE / EXECUTION
> Concept summary: `../concept/perception-actions.md`. This document defines technical flags, pipeline behavior, and telemetry; high-level narrative rationale lives in the concept file.

> STATUS: INTRODUCTORY SPEC (2025-10-31). Defines non‑mutating player actions that surface hidden or ambient context without altering canonical world parameters. Supports immersion and entity targeting preparation.
>
> Related: `parameterized-action-flow.md` · `../design-modules/description-layering-and-variation.md` · `../design-modules/entity-promotion.md` · `narration-governance.md` · `../design-modules/player-interaction-and-intents.md`

## Summary (Architecture Scope)

Perception actions (e.g. "Stay very quiet and listen", "Look for wildlife", "Smell the air") temporarily shift the rendering pipeline into an observational mode. They never mutate structural parameters; instead they:

1. Set transient perception flags on the player.
2. Aggregate sensory data (ambient layers, latent entity hints, biome cues).
3. Generate enhanced narration (auditory, visual, olfactory) using existing layers + ephemeral fragments.
4. Clear the flags after rendering.

These actions prime later entity promotion (spotting an owl, deer, suspicious vapors) without forcing immediate persistence.

## Action Types

| Action            | Transient Flag      | Output Elements                            | Promotion Hook                     |
| ----------------- | ------------------- | ------------------------------------------ | ---------------------------------- |
| Listen            | `listening`         | Auditory fragments (drip, creak, whisper)  | Rare: hidden creature sound cues   |
| Look for wildlife | `scanningWildlife`  | Latent fauna descriptors                   | Direct targeting enables promotion |
| Smell the air     | `smelling` (future) | Olfactory adjectives (damp, acrid, spiced) | None (flavor only)                 |
| Watch closely     | `watching` (future) | Micro‑movement (flutter, ripple)           | Promotion if verb follows          |

## Data Model (Transient)

```ts
interface PlayerPerceptionState {
    listening?: boolean
    scanningWildlife?: boolean
    smelling?: boolean
    watching?: boolean
    expiresUtc?: string // Optional auto-expiry (short)
    sourceLocationId: string
}
```

Flags live in memory or short‑lived cache; they are **not** persisted long‑term. Persistence is unnecessary because perception effects are narratively immediate and deterministic.

## Rendering Pipeline Additions

1. Collect base description + active layers.
2. If perception flags set, evaluate sensory resolvers:
    - Auditory: derive from weather, season, promoted entities (e.g. `owl` → wing rustle).
    - Wildlife scan: compile latent fauna (biome tags) + existing `wildlifePresence` parameter.
    - Olfactory: combine season + structural decay + nearby layer tags (e.g. `smoke`).
3. Append ephemeral sensory fragments (NOT persisted as layers).
4. Clear flags.

## Latent Entity Surfacing

Wildlife scan outputs descriptive mentions **without promotion**:

> "A pair of deer move cautiously between stumps; an owl glides overhead."

If player follows with targeting verb ("Shoot the owl"), promotion logic (see `../design-modules/entity-promotion.md`) runs.

## Validation Rules

| Rule                                                 | Rationale                                |
| ---------------------------------------------------- | ---------------------------------------- |
| No structural parameter mutation                     | Maintain purity of observational actions |
| Ephemeral fragments length bounded (<140 chars each) | Prevent verbose cluttered output         |
| Do not duplicate existing layer content              | Reduce redundancy / noise                |
| Promote only on subsequent targeted verb             | Avoid unintended entity explosions       |
| Clear all perception flags after render              | Prevent accidental carryover             |

## Telemetry (Illustrative)

- `Perception.Action.Invoked` – type (listen, scan), flags
- `Perception.Fragments.Generated` – counts by category
- `Perception.LatentMentioned` – list of surfaced latent nouns

Telemetry correlates with original intent ID for audit.

## Example Transcript

```
Player: Stay very quiet and listen
System: You hold still. Dripping mist taps leaves; a distant creak echoes; something small rustles beneath fallen autumn foliage.
(Player flag listening cleared.)
Player: Look for wildlife
System: A fat gull eyes you; a rat skitters below the jetty; an owl glides in near‑silence.
(Player flag scanningWildlife cleared.)
Player: Shoot the owl with my bow and arrow
→ Owl promoted; attack outcome narrated.
```

## Integration Matrix

| Module                       | Interaction                                      |
| ---------------------------- | ------------------------------------------------ |
| Parameterized Action Flow    | Sets + clears transient flags                    |
| Description Layering         | Supplies base + additive for sensory composition |
| Entity Promotion             | Uses latent mentions as input to noun matching   |
| Narration Governance         | Ensures humor & tone guidelines apply uniformly  |
| Player Interaction & Intents | Provides verb classification                     |

## Open Questions

1. Should multiple perception actions stack (listen + scan)? (Initial: yes, but enforce combined fragment cap.)
2. Do we allow partial persistence of notable discoveries? (Future: maybe store a short `lastObservation` log.)
3. Do biome tags evolve via perception outcomes? (Future: telemetry‑driven enrichment.)

## Change Log

| Date       | Change                            | Author        |
| ---------- | --------------------------------- | ------------- |
| 2025-10-31 | Initial specification established | Copilot Agent |

---

_Perception reinforces immersion without mutating world structure; treat expansions as additive and keep narration concise._
