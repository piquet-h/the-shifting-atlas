---
title: DM Persona Parsing & Humorous Action Engine (Concept)
status: Draft
lastUpdated: 2025-10-31
adrRef: (future ADR TBD)
facet: concept
---

# DM Persona Parsing & Humorous Action Engine

Purpose: Lightweight foundation for a humorous Dungeon Master style interpreter converting free‑form player text into playful action frames. Implementation planning tracked in roadmap milestones.

## Guiding Principles

1. Narrative > simulation accuracy.
2. Humor enhances ambiguity; never blocks progression.
3. Deterministic first pass; minimal model fallback for verb/target disambiguation.
4. Minimal IR (flat ordered frames).
5. Failures become flavor lines, not hard errors.
6. Reproducible humor via seeded RNG.
7. Feature‑flag all new behaviors.
8. No hallucinated entity mutation.
9. Promotion attempts precede humorous fallback when verb eligible.

## Minimal ActionFrame IR

```
ActionFrame {
  verb: 'move'|'take'|'throw'|'attack'|'use'|'talk'|'look'|'unknown'
  subject: playerId
  direct?: EntityRef
  secondary?: EntityRef
  adverbs?: string[]
  toneHints?: string[]
  rawText: string
  confidence: number
  ambiguity?: string[]
}
```

## Parsing Pipeline

1. Clause segmentation
2. Lexicon verb mapping (cheap model fallback)
3. Fuzzy entity match (visible + inventory)
4. Pronoun heuristic (recency)
5. Ambiguity detection
6. Frame assembly + humor decision
7. Execution adapter (unsupported verb → humorous fallback)
8. Narrative templating (deterministic; optional embellish flag)

## Humor Handling

Trigger reasons: unknownVerb, ambiguousObject, invalidTarget, redundantAction.
Outcome: comedic narration + harmless side effect (never blocks core loop).

## Feature Flags

| Flag               | Purpose                             |
| ------------------ | ----------------------------------- |
| humorousParsing    | Enable persona narration & misfires |
| aiVerbAssist       | Verb/target disambiguation assist   |
| narrativeEmbellish | Optional flourish layer             |

## Telemetry (Concept)

Events: Parser.Frame.Created, Parser.Frame.HumorousFallback, Parser.Frame.ActionResult, Parser.AI.Invoked.
Dimensions: playerId, humorSeed, ambiguityReasons[]. No raw text logs (privacy & cost). Hash if needed.

## Deferred Scope

Conditional phrases, advanced coreference, complex DAG planning, high‑fidelity physics, multi‑player merge logic.

## Risks & Mitigations

| Risk                         | Category         | Mitigation                              |
| ---------------------------- | ---------------- | --------------------------------------- |
| Excess humor reduces clarity | RUNTIME-BEHAVIOR | Cap misfire frequency; telemetry tuning |
| Model hallucination          | RUNTIME-BEHAVIOR | Verb whitelist + schema validation      |
| Ambiguity frustration        | RUNTIME-BEHAVIOR | Offer clarify prompt path               |
| Locale drift                 | DATA-MODEL       | Explicit locale flag; fallback English  |

## Success Criteria (Initial)

- ≥80% inputs parse without clarification.
- Humor fallback <40% of ambiguous cases.
- No irreversible state from misfires.
- Telemetry schema error rate <5%.

## Next Concept Steps

Define `ActionFrame` type in shared package; baseline lexicon list; seed humor line examples (see `./dungeon-master-style-guide.md`).

## Related

- `./dungeon-master-style-guide.md` – tone & persona
- `../modules/player-interaction-and-intents.md` – verbs & intents module
- `../architecture/overview.md` – integration context

---

_Last updated: 2025-10-31 (relocated; placeholder examples trimmed)_
