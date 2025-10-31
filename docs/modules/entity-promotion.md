# Design Document: Entity Promotion & Emergent Interaction

> STATUS: FUTURE / NOT IMPLEMENTED (2025-10-23). No promotion engine, noun extraction, persistence layer, or telemetry events exist yet. This is a specification only; implementation is deferred until baseline traversal and intent parsing (PI-0 / PI-1) are stable.
>
> Related: [Player Interaction & Intents](player-interaction-and-intents.md) · [Description Layering & Variation](description-layering-and-variation.md) · [Navigation & Traversal](navigation-and-traversal.md) · [AI Prompt Engineering](ai-prompt-engineering.md) · [World Rules & Lore](world-rules-and-lore.md)

## Summary

Players frequently reference details that originate solely in descriptive text ("owl", "shimmering mote", "collapsed arch"). To preserve improvisational freedom, the system promotes referenced narrative elements into lightweight, interactable entities at the moment of targeting. Promotion makes ephemeral flavor persistent, enabling follow‑up actions, state change, and future reappearance.

Core goals:

-   Freedom: Act on any described detail without prior authoring.
-   Continuity: Once promoted, the entity persists with an ID and mutable state.
-   Auditability: Promotion decision and source description recorded for replay/analysis.
-   Restraint: Minimal initial model (avoid premature deep stats / faction linkage).

### DM Persona Alignment (2025-10-31)

The humorous DM parser narrows initial promotion scope:

-   **Trigger verbs (Phase MVP):** `take | grab | pick | attack | throw | examine` only.
-   **Promotion attempt timing:** After ActionFrame assembly if the frame's direct target fails resolution against existing entities.
-   **Ambiguity handling:** If multiple noun candidates found, 50% humorous misfire (narrative joke), 50% clarification prompt (future EP-3). No AI alias expansion in MVP.
-   **Traits (deferred):** Omit trait inference until EP-2; store empty `traits: []`.
-   **Confidence logic:** Deterministic heuristic only (exact noun match). If absent → no promotion (humorous narration allowed: "You gesture at something that isn't quite there.").
-   **Telemetry (minimal):** `Entity.Promotion.Created` and `Entity.Promotion.Rejected` (reason) with correlation ID from parser; other events deferred.
-   **Out of scope now:** Semantic alias derivation, AI-assisted trait enrichment, inferred secondary entities.

This alignment prevents overbuilding before core playful parsing is validated and keeps failure states entertaining rather than blocking.

**Cross-Link:** For parser integration details and guiding principles (including the "narrative over simulation" tenet), see `../architecture/dm-persona-parsing.md` (Sections 2 & 12). Promotion only triggers after ActionFrame direct target resolution fails for eligible verbs.

## Conceptual Flow

| Phase                | Purpose                                                  | Output / Record              |
| -------------------- | -------------------------------------------------------- | ---------------------------- |
| Intent Parse         | Extract verb + target surface form                       | `{ verb, targetSurface }`    |
| Eligibility Check    | Verify target not already resolved entity                | Boolean                      |
| Description Scan     | Detect noun match / semantic alias in current scene text | Candidate set                |
| Promotion Decision   | Create minimal entity if confidence ≥ threshold          | New `Entity` object          |
| Action Resolution    | Apply verb logic (attack, examine, interact)             | Updated entity state         |
| Narrative Generation | Produce success / failure / partial outcome lines        | Layered description fragment |
| Consequence Ripple   | Emit downstream hooks (faction dislike, loot hook, etc.) | Domain events                |

## Data Model (Initial)

```ts
interface Entity {
    id: string // GUID or deterministic slug + suffix
    type: string // 'creature' | 'object' | 'phenomenon' | 'ephemeral'
    status: string // 'active' | 'inactive' | 'destroyed' | custom
    locationId: string // Current location (GUID)
    traits: string[] // Lightweight semantic tags ('nocturnal','flying')
    provenance?: {
        sourceDescriptionHash: string // Hash of text that triggered promotion
        createdUtc: string
        promotedByPlayerId: string // Actor who first targeted it
        generationMode: 'direct' | 'alias' | 'inferred'
    }
    revision?: number // Optimistic concurrency (optional future)
}

interface PromotionResult {
    promoted: boolean
    entityId?: string
    reason?: 'matched_noun' | 'alias' | 'already_exists' | 'confidence_low'
}
```

The initial implementation omits deep stat blocks, faction alignment, inventory ownership, or health systems. These can layer later without mutating the base promotion contract.

## Promotion Trigger Conditions

Promotion should occur only when ALL are true:

1. Target surface form (normalized) not already mapped to an existing entity in scope.
2. Matched noun OR semantic alias appears in current location description layer set.
3. Confidence score (heuristic or model-assisted) ≥ configurable threshold (default 0.6).
4. Target not on exclusion list (e.g., purely atmospheric tokens like 'mist', unless specifically acted upon with an interaction verb).
5. Player has required perception capability if gating emerges later (future).

## Generic Promotion Algorithm (Pseudo-Code)

```ts
function attemptPromotion(playerInput: string, sceneDescription: string, existingEntities: Entity[]): PromotionResult {
    const { verb, targetSurface } = parsePlayerIntent(playerInput) // PI pipeline (spec) reuse
    if (!targetSurface) return { promoted: false, reason: 'confidence_low' }

    const already = existingEntities.find((e) => e.id === targetSurface || e.id.startsWith(targetSurface + '_'))
    if (already) return { promoted: false, entityId: already.id, reason: 'already_exists' }

    const nouns = extractNouns(sceneDescription) // Placeholder heuristic / future NLP
    const aliases = deriveSemanticAliases(nouns) // e.g. 'owl' -> ['avian','bird']

    const matched = nouns.includes(targetSurface) || aliases.includes(targetSurface)
    if (!matched) return { promoted: false, reason: 'confidence_low' }

    const entityId = makeEntityId(targetSurface) // e.g. `${slug(targetSurface)}_${randSuffix()}`
    const newEntity: Entity = {
        id: entityId,
        type: classifyTarget(targetSurface), // heuristic mapping
        status: 'active',
        locationId: currentLocationId(),
        traits: inferTraits(targetSurface, sceneDescription),
        provenance: {
            sourceDescriptionHash: sha256(sceneDescription),
            createdUtc: new Date().toISOString(),
            promotedByPlayerId: currentPlayerId(),
            generationMode: 'direct'
        }
    }

    persistEntity(newEntity) // Cosmos (document) write (future)
    emitTelemetry('Entity.Promotion.Created', { type: newEntity.type }) // Centralized name registry ONLY
    return { promoted: true, entityId, reason: 'matched_noun' }
}
```

All helper functions (`parsePlayerIntent`, `extractNouns`, `persistEntity`, etc.) are deferred to later phases; they must not introduce direct DB writes before validation scaffolding exists.

## Latent vs Promoted Entities

Not every described object is persisted immediately. Two states exist:

| State    | Origin                                | Persistence | Interaction | Example                                      |
| -------- | ------------------------------------- | ----------- | ----------- | -------------------------------------------- |
| Latent   | Appears only in layered description   | None        | Indirect    | "a large axe rests on the rack"              |
| Promoted | Player targets / interacts (eligible) | Document    | Direct      | Player: "take the axe" → `axe_29af3` created |

Rules:

1. Latent items do NOT block narrative reuse; they can repeat until promotion occurs.
2. Promotion triggers when a verb in the eligible set targets a latent noun and confidence ≥ threshold.
3. Once promoted, subsequent descriptions should reference the canonical entity (e.g. include its current status) rather than re‑describing it as flavor.
4. Demotion is disallowed—entities remain persisted; removal uses status transitions (`destroyed`, `taken`).
5. NPC Promotion: When a player speaks to / trades with an implied actor (e.g. smith), the NPC is promoted PLUS any referenced inventory items become promotable latent children. Inventory items are promoted only on direct interaction verbs (`inspect`, `take`, `buy`).
6. Inventory Snapshot: NPC promotion records an initial inventory manifest (IDs generated lazily on item promotion). This prevents premature entity explosion while allowing deterministic later promotion.
7. Latent Object Revisit: If a player leaves and returns without prior promotion, the object remains latent; a second interaction still promotes it—no time decay applied in MVP.

### NPC Promotion Minimal Shape (Deferred Implementation)

```ts
interface NpcEntity extends Entity {
    npcType: 'smith' | 'vendor' | 'bard' | 'generic'
    inventoryRefs: string[] // Item entity IDs (promoted) or latent descriptors
}
```

### Promotion Telemetry Extension (Illustrative)

| Event                         | Purpose                                     |
| ----------------------------- | ------------------------------------------- |
| `Entity.Promotion.NpcCreated` | NPC promoted; inventory latent count logged |
| `Entity.Promotion.ItemLinked` | Item promoted from NPC latent inventory     |

Cross‑Link: See `parameterized-action-flow.md` for how promotion integrates after intent interpretation, and `narration-governance.md` for rules ensuring humorous fallback when promotion is rejected.

## Narrative & Action Resolution

After promotion, the resolving action (attack, examine, interact) proceeds using the **intent adjudication pipeline**. Outcome text is layered (do not mutate original description) and may append transient sensory fragments (e.g., falling feathers). Future rule: destructive results create follow‑up entities (corpse, dropped object) via secondary promotion with `generationMode: 'inferred'`.

## Benefits

| Benefit       | Description                                                                            |
| ------------- | -------------------------------------------------------------------------------------- |
| Immersion     | Players engage any described detail, reducing “invisible wall” feeling.                |
| Flexibility   | Supports improvisational / D&D‑style emergent interactions.                            |
| Continuity    | Promoted entities persist, enabling later reference and narrative callbacks.           |
| Extensibility | Traits allow later systems (AI prompts, faction logic) to branch on semantic labels.   |
| Auditability  | Provenance hash links entity creation to the exact scene text for moderation / replay. |

## Example Transcript

```
Player: Look for wildlife
System: You spot an owl gliding silently between moss‑draped branches.
Player: Shoot the owl with my bow and arrow
→ Promotion: Entity created id=owl_7c9fe (type=creature, traits=[nocturnal,flying])
→ Action: Attack resolved (success)
→ Narrative: "Your arrow whistles upward and strikes the owl. It tumbles through drifting mist."
→ Consequence: Feathers layer added; potential predator attraction event queued.
```

## Telemetry (Descriptive – Must Use Central Registry)

Additions (names illustrative; actual constants added via shared telemetry enumeration before use):

-   `Entity.Promotion.Requested` (targetSurface, hasExisting, sceneHash)
-   `Entity.Promotion.Created` (entityType, traitsCount)
-   `Entity.Promotion.Rejected` (reason)
-   `Entity.Action.Resolved` (verb, outcome)

Emission MUST use `trackGameEventStrict`; no inline ad‑hoc strings. Correlate promotion and subsequent action using the same trace / intent correlation ID.

## Edge Cases & Handling

| Case                             | Strategy                                                                  |
| -------------------------------- | ------------------------------------------------------------------------- |
| Target already an entity         | Return existing ID; do NOT duplicate.                                     |
| Ambiguous multi-noun match       | Defer; request clarification (intent pipeline) before promotion.          |
| Atmospheric / infinite phenomena | Reject unless verb implies containment / alteration (e.g. "bottle mist"). |
| Mass / collective nouns          | Promote a group entity (type=`phenomenon`) with aggregate traits.         |
| Rapid repeated promotions (spam) | Rate-limit per player + cooldown telemetry marker.                        |
| Unsafe / disallowed noun content | Trigger safety filter; reject, log moderation flag.                       |
| Target removed mid-resolution    | Check revision; abort narrative mutation if stale.                        |

## Roadmap Phases (EP Series)

| Phase | Goal                                     | Scope                                                           |
| ----- | ---------------------------------------- | --------------------------------------------------------------- |
| EP-0  | Manual dev seeding                       | Hardcoded promotion for test scenarios.                         |
| EP-1  | Basic heuristic promotion                | Exact noun match + simple ID generation.                        |
| EP-2  | Alias & trait inference                  | Semantic alias mapping + lightweight trait extraction.          |
| EP-3  | Conflict / ambiguity resolution          | Multi-candidate handling + clarification loop integration.      |
| EP-4  | Ripple effects (faction / ecology hooks) | Emit secondary events on promotion (predator interest, etc.).   |
| EP-5  | AI-assisted enrichment                   | Augment traits / initial status via constrained AI prompt.      |
| EP-6  | Inferred secondary entities              | Auto-create derivative entities (corpse, remnants) post-action. |

## Risks & Controls

| Risk                     | Control                                                                  |
| ------------------------ | ------------------------------------------------------------------------ |
| Entity explosion / noise | Confidence threshold + rate limiting + trait dedupe script.              |
| Semantic duplication     | Hash + similarity check (future embedding) before commit.                |
| Unsafe content           | Reuse existing safety filter pipeline (AI prompt engineering).           |
| Performance (scan cost)  | Cache noun extraction per description hash; incremental diff on changes. |
| Unbounded trait growth   | Whitelist + merge logic; reject > N traits (configurable).               |

## Open Questions

1. Deterministic vs random suffix for entity IDs? (Deterministic aids replay; random reduces collision.)
2. Should ephemeral phenomena (fog, ambient light) be promotable or remain purely descriptive? (Likely gated by verb.)
3. Do we immediately persist promotion or stage pending until action resolves successfully? (Leaning: persist at promotion for audit continuity.)
4. Should promotion trigger AI enrichment immediately or defer until first interaction beyond creation? (Likely defer.)
5. How are duplicates cleaned if later canonical NPC is introduced? (Merge plan + alias table.)

## Integration Notes

| Module                       | Interaction                                                          |
| ---------------------------- | -------------------------------------------------------------------- |
| Player Interaction & Intents | Provides parsed verb + target surface form for promotion attempt.    |
| Description Layering         | Source text for noun extraction + provenance storage.                |
| Navigation & Traversal       | Location ID resolution; movement verbs may target promoted entities. |
| AI Prompt Engineering        | Future enrichment of traits / layered sensory augmentation.          |
| World Rules & Lore           | Trait validation (forbidden combinations, thematic consistency).     |

## See Also

-   `player-interaction-and-intents.md` – intent parsing phases feeding promotion.
-   `description-layering-and-variation.md` – immutable vs additive layers used for provenance.
-   `ai-prompt-engineering.md` – future enrichment pipeline.
-   `navigation-and-traversal.md` – spatial context for entity location.

## Change Log

| Date       | Change                                   | Author        |
| ---------- | ---------------------------------------- | ------------- |
| 2025-10-23 | Converted to structured design document. | Copilot Agent |

---

_Specification may evolve; amendments must update this document and reference roadmap alignment._
