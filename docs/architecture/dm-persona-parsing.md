---
title: DM Persona Parsing & Humorous Action Engine (Concept Design)
status: Draft
lastUpdated: 2025-10-31
adrRef: (future ADR TBD)
---

# DM Persona Parsing & Humorous Action Engine (Concept Design)

> Purpose: Establish a lightweight, extensible foundation for a "slightly humorous D&D Dungeon Master" style interpreter that converts free‑flowing player text into playful in‑game actions. This document captures only the minimal agreed direction; deeper specifications and atomic issues will be derived later.

## 1. Scope

Focus on conversational, imperfect player inputs (English only) and turning ambiguity into entertaining outcomes rather than strict failures. This replaces a previously heavier multi‑clause semantic plan with a lean pipeline. Precision mechanics (timers, stealth windows, complex conditional gating) are explicitly deferred. Non‑English input is out of scope.

## 2. Guiding Principles

1. Narrative over simulation: Prioritize a witty, flowing DM narration above perfectly accurate world state modeling.
2. Humor over friction: Ambiguity feeds comedic narration.
3. Deterministic first pass; small model only for narrow fallback (verb or target disambiguation).
4. Minimal internal representation – list of action frames, no dependency graph.
5. Failures become flavor; no hard blocking unless essential (e.g., unknown location).
6. Reproducible humor via seeded RNG (telemetry includes seed).
7. Feature‑flag all new behavior (`humorousParsing`, `aiVerbAssist`, `narrativeEmbellish`).
8. No world mutation from hallucinated entities.
9. Promotion attempts (see entity promotion module) only occur after direct resolution fails for eligible verbs; otherwise humorous fallback applies.

## 3. Minimal Internal Representation (IR)

```
ActionFrame {
  verb: 'move'|'take'|'throw'|'attack'|'use'|'talk'|'look'|'unknown';
  subject: playerId;
  direct?: EntityRef;        // item/npc/location (primary target)
  secondary?: EntityRef;     // e.g. throw <direct> at <secondary>
  adverbs?: string[];        // flavor tokens
  toneHints?: string[];      // mood markers ("heroically", "sneakily")
  rawText: string;           // original clause
  confidence: number;        // parser/model composite
  ambiguity?: string[];      // reasons (pronoun, multi-match, unknownVerb)
}
```

No sequencing graph required – frames executed in listed order. Conditional phrases (“once”, “while”) treated as narrative flavor until an expansion phase.

## 4. Parsing Pipeline (High-Level)

1. Clause segmentation (split on punctuation + simple conjunction patterns).
2. Lexicon verb mapping (surface → canonical); if unresolved → optional cheap model.
3. Noun/target fuzzy match against visible entities & inventory.
4. Pronoun heuristic (last referenced compatible entity).
5. Ambiguity detection (multiple candidates / missing antecedent / unknown verb).
6. Frame assembly + humor decision (clarify vs playful misfire).
7. Execution adapter (attempt core action; if unsupported verb → humorous fallback).
8. Narrative templating (deterministic with optional embellish model later).

## 5. Humor & Failure Handling (Concept)

Trigger categories: unknownVerb, ambiguousObject, invalidTarget, redundantAction, emptyThrow.
Outcomes: comedic narration + harmless side effect (e.g., imaginary fatigue counter). Side effects never cause progression deadlocks.

## 6. Feature Flags (Initial)

| Flag               | Purpose                                                    |
| ------------------ | ---------------------------------------------------------- |
| humorousParsing    | Enables DM persona narration & misfire logic               |
| aiVerbAssist       | Minimal AI parsing assistance (verb/target disambiguation) |
| narrativeEmbellish | Adds optional style embellishment layer                    |

## 7. Telemetry (Minimal)

Events (names may be refined using existing telemetry conventions):

-   Parser.Frame.Created (verb, ambiguityFlag)
-   Parser.Frame.HumorousFallback (reason)
-   Parser.Frame.ActionResult (result: success|fail|partial)
-   Parser.AI.Invoked (reason: verb|target)

Dimensions: playerId, locale, humorSeed, ambiguityReasons[]. No raw text logged – consider token hash if needed.

## 8. Deferred / Out of Scope (Future Expansion)

-   Formal conditional gating ("once X", "while Y")
-   Coreference resolution beyond simple recency heuristic
-   Complex plan dependency graph (DAG / watchers)
-   High-fidelity physics or trajectory outcome modeling
-   Inventory stress tests & multi-player simultaneous narrative merging

## 9. Epics & Milestone Placement (Placeholders)

Milestone mapping aligns with existing roadmap taxonomy. M1 Traversal is now closed; no new epics will be added to that milestone. Existing related foundational work is referenced below.

| Milestone                | Epic / Issue Reference                       | Status      | Intent Summary                                                                     |
| ------------------------ | -------------------------------------------- | ----------- | ---------------------------------------------------------------------------------- |
| (Closed) M1 Traversal    | Direction Normalization Utility (#13)        | Completed   | Canonical direction normalization groundwork leveraged by humorous parser          |
| M2 Observability         | EPIC: Parser Telemetry & Humor Metrics       | Placeholder | Instrument events & dashboard queries                                              |
| M3 AI Read               | EPIC: Light AI Verb Assist                   | Placeholder | Cheap model fallback for unknown verbs                                             |
| M4 Layering & Enrichment | EPIC: Narrative Embellishment Layer          | Placeholder | Optional flourish templates / style                                                |
| M5 Systems               | Heuristic Player Command Parser Design (#56) | Open        | Evolving baseline for heuristic parsing; will absorb DM persona core parsing scope |
| M5 Systems               | EPIC: Conditional Phrase Upgrade             | Placeholder | Turn "once/while" into gated execution                                             |
| M5 Systems               | EPIC: Advanced Coreference & Targeting       | Placeholder | Pronoun & descriptor accuracy improvements                                         |
| M6 Dungeon Runs          | EPIC: Quest Chain Humor Dynamics             | Placeholder | Multi-step narrative arcs with adaptive humor                                      |

Notes:

-   Original placeholder "EPIC: DM Persona Core Parser" has been subsumed into existing open issue #56 under M5 Systems.
-   M3 explicitly includes minimal AI parsing functionality (`aiVerbAssist`).
-   Future atomic issues will reference this design doc and link to issue #56 where appropriate.
-   Placeholders remain intentionally terse to allow future decomposition without premature commitment.

## 10. Risks (Current Phase)

| Risk                                  | Category         | Mitigation                                |
| ------------------------------------- | ---------------- | ----------------------------------------- |
| Over-humor reduces clarity            | RUNTIME-BEHAVIOR | Cap misfire frequency; telemetry tune     |
| Cheap model hallucination             | RUNTIME-BEHAVIOR | Strict verb whitelist + schema validation |
| Ambiguity handling frustrates players | RUNTIME-BEHAVIOR | Provide clarify prompt option path        |
| Locale drift (future)                 | DATA-MODEL       | Explicit locale flag; fallback to English |

## 11. Success Criteria (Initial Rollout)

-   ≥80% of typical player action inputs produce frames without clarification.
-   Humor fallback invoked <40% of ambiguous cases (configurable).
-   No irreversible game state changes from misfires.
-   Telemetry events captured with <5% error rate (schema valid).

## 12. Next Steps (Not Yet Implemented)

1. Shared: Define `ActionFrame` type + export (atomic issue TBD).
2. Backend: Implement lexicon + parser skeleton (flagged off).
3. Backend: Humor consequence module + seeded RNG.
4. Backend: Telemetry emission integration.
5. Evaluation: Collect sample sentences & tune ambiguity thresholds.

### Cross-Link: Entity Promotion

When an ActionFrame's direct target cannot be resolved and the verb ∈ {take, grab, pick, attack, throw, examine}, the entity promotion module may attempt a lightweight promotion before humor fallback. See `../modules/entity-promotion.md` (DM Persona Alignment section) for narrowed scope and deferred features.

## 13. Revision & Evolution

This is a living concept; changes require minimal diff + reference to future ADR when scope shifts (e.g., conditional mechanics, future multilingual expansion). Early implementation should remain under feature flags until stability metrics achieved.

---

## Document classification: Concept / Draft. Not an ADR yet.
