# Design Document: Parameterized Action Flow

> FACET: ARCHITECTURE / EXECUTION
> Concept summary: `../concept/parameterized-action-flow.md`. This specification focuses on pipeline mechanics, data surfaces, validation, and telemetry. Narrative tone & high-level philosophy intentionally excluded here to avoid facet leakage.

> STATUS: INTRODUCTORY SPEC (2025-10-31). Establishes the core three‑step loop converting free‑form player commands into consistent world state updates and layered narration.
>
> Related: `../design-modules/player-interaction-and-intents.md` · `../design-modules/description-layering-and-variation.md` · `../design-modules/entity-promotion.md` · `perception-actions.md` · `narration-governance.md`

## Summary (Scope Clarification)

The parameterized action flow decouples player language from world description. Instead of rewriting prose directly, actions update structured parameters which downstream renderers use to generate dynamic narration. This enables deterministic replay, layered enrichment, and safe AI involvement.

Core loop:

1. Interpret Intent (parse verb, targets, scope, tool prerequisites).
2. Update Parameters (mutate structured world / player state or mark ephemeral flags).
3. Generate Description (compose base + additive layers + ephemeral sensory fragments).

## Why Parameterization (Architecture Lens)

| Benefit       | Explanation                                                                              |
| ------------- | ---------------------------------------------------------------------------------------- |
| Determinism   | Replay by reapplying parameter diffs rather than regenerating text.                      |
| Composability | Multiple actions contribute to a shared state surface (e.g. felled trees + rain + dusk). |
| Extensibility | New verbs map to parameter changes without altering narration code paths.                |
| Auditability  | Each change is logged as a diff (e.g. `forestDensity: 0`).                               |
| AI Safety     | AI generates candidate layer snippets; parameters remain authoritative.                  |

## Core Data Surfaces (Illustrative – Execution Detail)

```ts
interface LocationParameters {
    structureIntegrity: number // 0..1 (damage, decay)
    forestDensity?: number // tree coverage percent (0 after mass felling)
    ambientWeather?: 'clear' | 'rain' | 'fog' | 'storm'
    timeOfDay: 'dawn' | 'day' | 'dusk' | 'night'
    season: 'spring' | 'summer' | 'autumn' | 'winter'
    wildlifePresence?: string[] // promoted entity IDs or latent tags
    transientSensory?: string[] // ephemeral one‑shot cues (cleared after render)
}

interface PlayerParameters {
    listening: boolean
    scanningWildlife: boolean
    stealthLevel?: number
    inventory: string[] // entity IDs
    tools: string[] // e.g. ['axe','bow']
}
```

Parameters may reside in Cosmos (document API) alongside layering metadata (see `../design-modules/description-layering-and-variation.md`). Transient flags (`listening`, `scanningWildlife`) clear automatically after one or more descriptive cycles.

## Action Classification (Implementation-Oriented)

| Type                 | Mutates Persistent Params | Adds Layer        | Example Command              |
| -------------------- | ------------------------- | ----------------- | ---------------------------- |
| Structural           | Yes                       | Optional          | "Chop down all the trees"    |
| Ambient Toggle       | Yes                       | Maybe             | "Light a bonfire"            |
| Sensory / Perception | No                        | Ephemeral         | "Stay very quiet and listen" |
| Scan / Query         | No                        | Ephemeral         | "Look for wildlife"          |
| Attack / Interaction | Maybe (entity state)      | Ephemeral + event | "Shoot the owl"              |
| Inventory            | Yes (player)              | None              | "Pick up the axe"            |

## Example: Environmental Modification

Command: "Chop down all the trees"

Interpret Intent:

- verb = `chop`
- target = `trees`
- scope = `all`

Prerequisite Check:

- tool required: `axe` present? If absent → failure narrative; **no parameter mutation**.

Parameter Update (success):

- `forestDensity = 0`
- `wildlifePresence` trimmed (push fleeing transient sensory: `rustling_departure`)
- Add structural layer snippet candidate: "Stumps dot the clearing." (validator gates persistence).

Generated Description (abbreviated):

> With a thunderous crash the forest falls silent; a barren clearing of fresh stumps replaces the dense stand.

## Example: Tool Absence Branch

Command: "Chop down all the trees" (no axe)

- Failure narrative: "You claw at bark with bare hands; the trees remain unmoved. Without an axe this task is impossible."
- Parameters unchanged.

## Perception Example

Command: "Stay very quiet and listen"

- Set `player.listening = true` (transient)
- Renderer adds layered auditory cues (dripping mist, distant creak) without mutating location parameters.
- Clear listening flag after render.

## Wildlife Scan Example

Command: "Look for wildlife"

- Set `player.scanningWildlife = true`
- Gather candidate entities: existing promoted + latent pattern matches (e.g. `owl`, `deer` inferred from biome tags).
- Promote only on direct targeting later (e.g. "Shoot the owl").

## Promotion Integration

Promotion occurs **after** intent interpretation but before parameter mutation for the resolving verb. If a target entity does not exist yet and matches latent description nouns, see `../design-modules/entity-promotion.md` for creation logic.

## Deterministic Rendering Contract

Renderer consumes:

- Base description (immutable).
- Ordered layer list (validated snippets).
- LocationParameters snapshot.
- Player transient flags.
- Promoted entity states.

No direct randomization; variability is driven by parameter changes and time progression. Controlled stochastic variation (e.g. choosing 1 of 3 owl reaction phrasings) allowed if seeded by deterministic hash (`locationId + tick + entityId`).

## Validation & Safety

| Rule                                         | Rationale                        |
| -------------------------------------------- | -------------------------------- |
| Base description never rewritten             | Prevent retcon / audit loss      |
| Structural parameter bounds enforced         | Avoid impossible states          |
| Ambient layer length capped (e.g. 180 chars) | Keep output concise & readable   |
| Tool prerequisites gate mutating verbs       | Maintain coherent progression    |
| Promotion only for eligible verbs            | Avoid noise explosion            |
| Ephemeral sensory cleared post-render        | Prevent stale perception effects |

See `narration-governance.md` for controlled hallucination classification and validator pipeline.

## Telemetry (Illustrative)

- `Action.Intent.Parsed` – verb, targets, scope, token count
- `Action.Parameters.Updated` – diff set (forestDensity:1→0)
- `Action.Parameters.Rejected` – reason (missing_tool)
- `Action.Render.Cycle` – included layers count + transient flags

Events must use centralized enumeration (no inline strings).

## Success Metrics Alignment (Vision)

| Metric                                | Target              | Source                               |
| ------------------------------------- | ------------------- | ------------------------------------ |
| Traversal reliability                 | ≥95%                | Movement success vs attempts         |
| Layering integrity                    | 0 retcon violations | Layer validator audit                |
| Narrative drift audit pass rate       | ≥95%                | Layer provenance + governance checks |
| Promotion decision telemetry coverage | 100%                | Created vs rejected ratio            |

## Open Questions

1. Do we version parameter schema separately per milestone? (Leaning yes – additive migrations.)
2. Should perception flags persist across movement? (Initial: clear on location change.)
3. How many concurrent transient flags allowed? (Cap at 3 to avoid combinatorial text sprawl.)

## Change Log

| Date       | Change                             | Author        |
| ---------- | ---------------------------------- | ------------- |
| 2025-10-31 | Initial specification (core loop). | Copilot Agent |

---

_Parameterization enables reusability and guards narration from uncontrolled mutation; extend cautiously and document all new parameter surfaces._
