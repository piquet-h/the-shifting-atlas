# Design Document: Narration Governance & Controlled Hallucination

> FACET: ARCHITECTURE / EXECUTION
> Concept summary: `../concept/narration-governance.md`. This file captures validator pipeline mechanics, classification tables, and drift audit processes; broader narrative intent sits in the concept facet.

> STATUS: INTRODUCTORY SPEC (2025-10-31). Defines guardrails for AI‑driven Dungeon Master narration, layer validation, and bounded creative hallucination. Aligns with vision tenets (AI‑driven narration + immutable base prose) and success metrics (drift audit, rejection band).
>
> Related: `../design-modules/description-layering-and-variation.md` · `parameterized-action-flow.md` · `../design-modules/entity-promotion.md` · `../concept/dungeon-master-style-guide.md` · `perception-actions.md`

## Summary (Governance Mechanics Scope)

AI acts as the primary narrator, but its creative output is **ephemeral** until validated. Governance ensures:

- Canon stability (no base mutation)
- Bounded creativity (ambient, flavor, hints only)
- Deterministic replay (provenance hashes)
- Low drift & controlled rejection rates

## Output Classifications

| Class            | Persistence                 | Typical Length | Examples                                         | Rejection Reasons                           |
| ---------------- | --------------------------- | -------------- | ------------------------------------------------ | ------------------------------------------- |
| Ambient          | Additive layer (validated)  | <140 chars     | "Mist drips steadily from pine boughs"           | Duplicates existing layer; excessive length |
| Flavor           | Additive layer (validated)  | <160 chars     | "A gull struts like a self‑appointed dockmaster" | High cardinality noun invents canon         |
| Ephemeral Hint   | Not persisted (one render)  | <120 chars     | "Faint scraping below—perhaps disturbed stone"   | Contradicts recent state                    |
| Structural Event | Additive (strict validator) | <180 chars     | "Fresh stumps dot the clearing"                  | Retcon base description; invalid invariant  |
| Meta / Unsafe    | Rejected                    | N/A            | (Not emitted)                                    | Out‑of‑era, unsafe content                  |

Only validated additive classes enter the layering repository. Ephemeral hints enhance a single narration cycle then vanish.

## Validation Pipeline (High Level)

1. **Provenance Assembly** – Structured prompt (scene facts + player action + persona tags).
2. **Generation** – Model returns candidate lines (k ≤ 3); seeded for deterministic ordering.
3. **Classifier** – Assign class (ambient / flavor / hint / structural_event / reject) via rule + lightweight model.
4. **Invariants Check** – Ensure no base contradiction (e.g. trees already felled, avoids regrowth claim).
5. **Cardinality & Duplication** – Reject if near‑duplicate (lev distance / hash) of recent layers.
6. **Length / Style Filter** – Enforce class length bounds; apply DM style heuristics.
7. **Decision** – Persist additive classes; discard ephemeral; log rejections.
8. **Telemetry Emit** – Track event outcome (`Narration.Layer.Accepted`, `Narration.Layer.Rejected`).

## Drift Audit

Periodic process (batch or streaming):

- Re-scan persisted layers vs canonical base
- Verify no contradictory structural claims (e.g. "tower collapsed" without collapse event)
- Mark anomalies (`drift=true`) and schedule review or auto-quarantine (hide layer until moderation)

Success Metric: ≥95% layers pass audit; anomaly ratio ≤5% per sprint.

## Provenance Model

```ts
interface LayerProvenance {
    id: string
    locationId: string
    playerContext?: string // optional, if player action triggered
    promptHash: string // hash(prompt template + variable block)
    classification: 'ambient' | 'flavor' | 'structural_event'
    generatedUtc: string
    validatorVersion: string
    rejectedReason?: string
    driftFlag?: boolean
}
```

All persisted layers must contain provenance; absence → automatic quarantine.

## Telemetry (Illustrative; actual names via central enum)

| Event                       | Payload Highlights                           |
| --------------------------- | -------------------------------------------- |
| `Narration.Layer.Candidate` | classes attempted, raw counts                |
| `Narration.Layer.Accepted`  | classification, length, validatorVersion     |
| `Narration.Layer.Rejected`  | reason, classificationAttempt                |
| `Narration.Layer.DriftFlag` | layerId, driftType                           |
| `Narration.Style.Enforced`  | style adjustments applied (humor trim, etc.) |

## Controlled Hallucination Boundaries

| Boundary               | Enforcement                                               |
| ---------------------- | --------------------------------------------------------- |
| Base text immutability | Layer-only; never regenerate full base (see layering doc) |
| Lore consistency       | Fact block grounding; disallow new named factions         |
| Length discipline      | Class-specific max chars; reject overflow                 |
| Sensory realism        | Cross-check biome tags vs sensory adjectives              |
| Temporal coherence     | Time-of-day & season tokens must align                    |
| Entity continuity      | Promoted entity states respected (dead owl ≠ gliding)     |

## Integration Points

| Module                    | Role                                            |
| ------------------------- | ----------------------------------------------- |
| Description Layering      | Stores accepted additive layers                 |
| Parameterized Action Flow | Provides contextual parameter diff for prompt   |
| Entity Promotion          | Supplies entity state to prevent contradictions |
| Perception Actions        | Ephemeral hints generation scope                |
| DM Style Guide            | Provides tone constraints & allowed humor       |

## Example Flow

```
Player: Chop down all the trees
→ Parameters updated (forestDensity=0)
→ Prompt template assembled (structure change + time + weather)
→ Model candidates: ["Fresh stumps dot the clearing", "Sap steams in the cool air"]
→ Classifier: both structural_event (1) + ambient (2)
→ Validator: pass (no contradiction, within length)
→ Persist: structural_event + ambient; ephemeral hint discarded
→ Telemetry: Accepted x2
```

## Rejection Examples

| Candidate Line                             | Rejection Reason            |
| ------------------------------------------ | --------------------------- |
| "Ancient tower looms nearby"               | Contradicts base (no tower) |
| "Galaxy-brained squirrel lectures you"     | Tone drift (out-of-era)     |
| "Fog fog fog fog fog fog fog fog fog fog"  | Length / repetition         |
| "Seven new factions raise banners at once" | Lore introduction blocked   |
| "Dead owl glides silently overhead"        | Entity state contradiction  |

## Open Questions

1. Quarantine policy: auto-hide drift layers or mark for manual review first?
2. Adaptive rejection band: dynamic thresholding based on recent acceptance ratio?
3. Layer aging: schedule archival of stale flavor layers after N weeks?

## Change Log

| Date       | Change                                 | Author        |
| ---------- | -------------------------------------- | ------------- |
| 2025-10-31 | Initial governance specification added | Copilot Agent |

---

_Governance preserves immersion while enabling safe creative expansion; all additive content must remain audit-friendly and reversible._
