# Design Document: Player Interaction & Intent Parsing

> STATUS: FUTURE / NOT IMPLEMENTED (2025-10-02, updated 2025-10-07). No intent schema, parser, or backend ingestion is implemented yet. This document is a specification only. Implementation is intentionally deferred until traversal + baseline telemetry are stable.
>
> Related: [Navigation & Traversal](navigation-and-traversal.md) · [AI Prompt Engineering](ai-prompt-engineering.md) · [Multiplayer Mechanics](multiplayer-mechanics.md) · [Quest & Dialogue Trees](quest-and-dialogue-trees.md) · [World Rules & Lore](world-rules-and-lore.md)

## Summary

This module defines how free‑form player text commands ("Defend myself from the dragon while I back out of the cavern and throw a gold coin behind it") are transformed into a structured, ordered, and partially validated set of atomic **Intents**. These intents drive authoritative world actions via the **Backend Function App** (optionally fronted by API Management) with minimal latency suitable for real‑time, conversational play reminiscent of a human Dungeon Master.

Key principles:

-   **Freedom First:** Players can mix tactics, narration, humor, and multi‑step plans in one input.
-   **Deterministic Core:** Only validated, canonical intents are persisted as Event vertices; freeform text never directly changes world state.
-   **Edge‑Optimized:** Primary parsing runs client-side (browser model + heuristics) to reduce round trips; backend endpoint adjudicates, clarifies, or escalates.
-   **Progressive Enhancement:** Heuristic + minimal schema first; local LLM extraction and server refinement later.
-   **Auditability:** Every accepted command has a parse artifact (versioned schema + telemetry correlation IDs).

## Scope & Non‑Goals

In Scope (Phase progression):

-   Text command ingestion → normalized structured Intents.
-   Ordering & concurrency grouping (e.g., defend + move concurrently, then throw).
-   Ambiguity detection + optional clarifying question generation.
-   Backend contract for submission & clarification loop.
-   Telemetry events and evaluation metrics definitions.

Out of Scope (initial phases):

-   Full tactical planning / optimization (deferred AI augmentation).
-   Rich natural language negotiation or multi-turn dialogue memory beyond short context window.
-   Automatic spell or item effect simulation (handled by downstream systems).
-   Voice input / speech recognition (future extension layer).

## Conceptual Architecture

### Intent Parsing Phase Glossary (PI Series)

Lightweight shared vocabulary for incremental rollout (not strict milestones):

-   PI-0 Seed: Heuristic parsing + minimal schema validation (no LLM required).
-   PI-1 Local Extraction: Add on-device / browser LLM structured extraction with confidence scoring.
-   PI-2 Clarification Loop: Server adjudication + interactive ambiguity resolution.
-   PI-3 Escalated Semantics: Server-side model refinement for multi-step / low-confidence inputs.
-   PI-4 Evaluation Harness: Telemetry-driven precision/recall measurement; automated regression fixtures.
-   PI-5 Optimization: Cost + latency tuning, caching, speculative parsing.

Docs should reference phases sparingly; avoid coupling code paths to numeric labels (use capability flags instead).

```
Player Input → (Client Heuristics + Local LLM Extraction) → ParsedCommand Draft
   ↓ (POST /player/command)
Backend Intent Adjudicator → (Validation + Policy + Optional Server LLM Escalation) → Accepted Intents → Event Vertices / Queue
   ↘ (if ambiguities) Clarification Prompt (response cycles until resolved or timeout)
```

## Intent Data Model (Specification)

Each atomic **Intent** represents one actionable world operation.

| Field                 | Type       | Required                                   | Description                                                                   |
| --------------------- | ---------- | ------------------------------------------ | ----------------------------------------------------------------------------- |
| `id`                  | GUID       | optional (client may omit; server assigns) | Stable identifier for telemetry + referencing in clarifications.              |
| `verb`                | enum       | yes                                        | Canonical action (see Verb Set).                                              |
| `order`               | int        | yes                                        | Primary sequence index (0+).                                                  |
| `concurrencyGroup`    | string     | no                                         | Identifies intents intended to run in parallel at same `order`.               |
| `targetEntityId`      | GUID       | conditional                                | Resolved existing entity (e.g., dragon) if known.                             |
| `surfaceTargetName`   | string     | conditional                                | Raw text target placeholder when unresolved.                                  |
| `objectItemId`        | GUID       | conditional                                | Item used (e.g., specific coin) if resolved.                                  |
| `surfaceItemName`     | string     | conditional                                | Raw name when item unresolved.                                                |
| `direction`           | enum       | conditional                                | Movement direction (normalized).                                              |
| `quantity`            | number     | no                                         | Numeric quantity (e.g., number of coins).                                     |
| `modifiers`           | string[]   | no                                         | Adverbs / tactical qualifiers (`slowly`, `shield_up`).                        |
| `tacticalRole`        | string     | no                                         | High-level purpose (`distraction`, `retreat_cover`).                          |
| `conditions`          | string[]   | no                                         | Pre-conditions (`while_retreating`, `if_attacked`).                           |
| `priority`            | int        | no                                         | Tie-break within same order (lower processes first).                          |
| `confidence`          | 0–1        | yes (client-estimated or server)           | Extraction plausibility score.                                                |
| `issues`              | IssueRef[] | no                                         | IDs of ambiguity / validation issues affecting this intent.                   |
| `justification`       | string     | no                                         | Player's stated reasoning for capability (character-driven context).          |
| `backgroundReference` | string     | no                                         | Explicit background invocation if mentioned (e.g., "sailor", "cartographer"). |
| `meta`                | object     | no                                         | `{ sourceModel, processingStage }` (diagnostics only).                        |

### Character-Driven Context (PI-2+)

To support **character-driven roleplaying** (see [`../concept/character-driven-roleplaying.md`](../concept/character-driven-roleplaying.md)), parsed intents should extract **justification context** from player declarations:

**Purpose**: Enable the AI DM to evaluate action plausibility based on character background and narrative capability rather than mechanical skill checks.

**Fields**:

-   `justification`: Player's stated reasoning for why they can perform the action
-   `backgroundReference`: Explicit mention of character background, class, or past experience

**Example Parse**:

```json
{
    "verb": "climb",
    "order": 0,
    "rawText": "I climb the wall using techniques from my time on ships",
    "justification": "time on ships",
    "backgroundReference": "sailor",
    "confidence": 0.85,
    "meta": {
        "extractionMethod": "local-llm",
        "characterDrivenParse": true
    }
}
```

**Implementation Notes**:

-   Parser should detect phrases like:
    -   "my experience as a..."
    -   "from my time as..."
    -   "having trained in..."
    -   "my background in..."
    -   "as a former..."
-   If background reference is extracted, flag the intent for character-driven adjudication
-   AI DM receives this context along with player's stored background metadata
-   No mechanical bonuses applied; purely narrative context for plausibility evaluation

**Example with Multiple Intents**:

```
Player Input: "As a former thief, I check the strongbox for false bottoms while keeping watch on the door"

Parsed Intents:
[
  {
    "verb": "examine",
    "targetEntityId": "<strongbox-guid>",
    "order": 0,
    "concurrencyGroup": "simultaneous",
    "justification": "former thief checking for false bottoms",
    "backgroundReference": "thief",
    "confidence": 0.92
  },
  {
    "verb": "guard",
    "targetEntityId": "<door-guid>",
    "order": 0,
    "concurrencyGroup": "simultaneous",
    "confidence": 0.88
  }
]
```

The AI DM evaluates the `examine` intent considering:

1. Player's background includes "Former Street Urchin" or similar thief archetype
2. Justification explicitly references relevant experience
3. Situational plausibility (is there a strongbox present?)
4. Narrative coherence (does this fit the character's established capabilities?)

**Clarification Handling**:
If background reference is unclear or contradicts stored player profile:

```json
{
    "issueType": "background_mismatch",
    "spanText": "as a former thief",
    "prompt": "Your character profile doesn't mention thievery background. Did you mean to reference a different experience, or would you like to update your character history?",
    "critical": false
}
```

### Verb Set (Initial Canonical Enum)

`move`, `attack`, `defend`, `throw`, `use_item`, `examine`, `communicate`, `emote`, `interact`, `flee`, `guard`, `cast_spell` (placeholder future). Additional verbs require doc amendment + tests before adoption.

### ParsedCommand Envelope

```
{
  rawText: string,
  intents: Intent[],
  ambiguities?: AmbiguityIssue[],
  needsClarification: boolean,
  parseVersion: string,           // semver of schema/pipeline
  playerId: string (GUID),
  createdAt: ISO8601,
  clientLatencyMs?: number,
  provenance?: { model?: string; heuristicRulesApplied: number; }
}
```

### AmbiguityIssue

| Field         | Description                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------ |
| `id`          | Unique per parse (referenced by intents).                                                                    |
| `spanText`    | Raw text span causing ambiguity.                                                                             |
| `issueType`   | `unknown_entity` \| `unknown_item` \| `ambiguous_direction` \| `multi_interpretation` \| `missing_required`. |
| `suggestions` | Candidate disambiguations or prompts.                                                                        |
| `critical`    | If true, unresolved prevents execution of involved intents.                                                  |

## Backend API Contract

### Endpoint

`POST /player/command`

### Request (Client → API)

```
{
  "playerId": "<guid>",
  "rawText": "Defend myself...",
  "clientParse": { ...ParsedCommand },        // optional but strongly encouraged
  "clientContextVersion": "playerState-1",    // optimistic concurrency for state view
  "traceId": "<guid>"                         // for distributed telemetry correlation
}
```

### Response (200 OK – Accepted OR Clarification)

```
{
  "status": "accepted" | "needs_clarification" | "rejected",
  "acceptedIntents": Intent[],          // present if status=accepted or partial accept
  "pendingClarifications": [
     { "issueId": "a1", "prompt": "Which coin do you want to throw? (gold / silver)" }
  ],
  "escalated": boolean,                // server LLM refinement performed
  "serverAdjustments": {                // diff summary relative to clientParse
     "removedIntents": ["temp-id-3"],
     "modifiedIntents": [ { "id": "temp-id-2", "changes": ["direction"] } ]
  },
  "parseVersion": "1.0.0",
  "clarificationToken": "<opaque>"     // required for follow-up answers
}
```

### Clarification Follow-Up

`POST /player/command/clarify`

```
{
  "playerId": "<guid>",
  "clarificationToken": "<opaque>",
  "responses": [ { "issueId": "a1", "answer": "gold" } ],
  "traceId": "<guid>"
}
```

Response mirrors primary contract with updated acceptance.

### Error Codes (Non-200)

| HTTP | Code                    | Meaning                         |
| ---- | ----------------------- | ------------------------------- |
| 400  | `SCHEMA_INVALID`        | Client payload malformed.       |
| 409  | `STATE_STALE`           | Client context version too old. |
| 422  | `NO_ACTIONABLE_INTENTS` | All intents invalid / filtered. |
| 429  | `RATE_LIMIT`            | Command throughput exceeded.    |

## Parsing & Clarification Pipeline (Phases)

| Stage | Location   | Purpose                                                          | Output              |
| ----- | ---------- | ---------------------------------------------------------------- | ------------------- |
| H1    | Client     | Heuristic tokenization (directions, verbs, quantities)           | Draft spans         |
| H2    | Client     | Entity / item candidate resolution (local cache)                 | Annotated spans     |
| L1    | Client     | Local LLM extraction (JSON, grammar constrained)                 | ParsedCommand draft |
| V1    | API        | Schema + canonical verb/direction validation                     | Normalized intents  |
| P1    | API        | Policy filtering (authorization, inventory presence)             | Filtered intents    |
| A1    | API        | Ambiguity assessment; mark critical vs non-critical              | Ambiguity list      |
| E1    | API\*      | (Conditional) Server LLM escalation for complex / low confidence | Refined intents     |
| C1    | Client/API | Clarification loop (interactive)                                 | Resolved or partial |
| F1    | API        | Final accept; enqueue world events                               | Event records       |

Escalation triggers: zero valid intents, more than the configured maximum number of intents (see `MAX_INTENTS_PER_COMMAND` in implementation), unresolved critical ambiguity after first pass, or average confidence below the configured threshold (see `MIN_CONFIDENCE_THRESHOLD` in implementation; default 0.55).

## Telemetry Events (Canonical Names)

All events added centrally (extend `telemetryEvents.ts` before implementation; no inline literals):

| Event                                 | Key Fields                                               |
| ------------------------------------- | -------------------------------------------------------- |
| `PlayerCommand.Received`              | rawLength, hasClientParse, traceId                       |
| `PlayerCommand.ParseSucceeded`        | intentCount, latencyMsClient, latencyMsServer, escalated |
| `PlayerCommand.ParseFailed`           | failurePhase, reasonCode                                 |
| `PlayerCommand.AmbiguityDetected`     | ambiguityCount, criticalCount                            |
| `PlayerCommand.ClarificationPrompted` | issueCount                                               |
| `PlayerCommand.ClarificationResolved` | remainingAmbiguities                                     |
| `PlayerCommand.IntentFiltered`        | verb, filterReason                                       |
| `PlayerCommand.Escalated`             | triggerReasons[]                                         |

## Safety & Guardrails

| Risk                           | Control                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| Offensive / disallowed content | Client pre-filter + server policy classifier (reject or sanitize).                   |
| Hallucinated items/entities    | Cross-check against player inventory & location scope lists; downgrade to ambiguity. |
| Unauthorized actions           | Policy layer rejects intents requiring missing prerequisites (e.g., weapon).         |
| Prompt injection attempts      | Strip role/classic jailbreak markers before local model prompt.                      |
| Model drift / version mismatch | `parseVersion` + model ID logged; mismatch triggers warning telemetry.               |
| Excess complexity spam         | Hard cap intents per command (e.g., 8) + incremental penalty delay.                  |

## Evaluation Metrics

| Metric                      | Definition                             | Target (Initial) |
| --------------------------- | -------------------------------------- | ---------------- |
| Intent Precision            | Correct intents / proposed intents     | ≥ 0.80           |
| Intent Recall               | Correct intents / gold intents         | ≥ 0.80           |
| Ordering Accuracy           | % commands with correct relative order | ≥ 0.75           |
| Concurrency Accuracy        | Correct concurrency sets / total       | ≥ 0.70           |
| Ambiguity Resolution Rate   | Ambiguities resolved within 1 round    | ≥ 0.60           |
| Median Client Parse Latency | H1–L1 time                             | < 350 ms (warm)  |
| Escalation Rate             | % commands requiring E1                | < 15%            |

## Phased Roadmap

| Phase | Goal                                 | Deliverables                                         |
| ----- | ------------------------------------ | ---------------------------------------------------- |
| PI-0  | Baseline schema & heuristic only     | Intent spec, docs, telemetry stubs (no LLM)          |
| PI-1  | Local LLM extraction                 | Grammar-constrained JSON output, confidence scoring  |
| PI-2  | Backend adjudication + clarification | Endpoint live, ambiguity loop                        |
| PI-3  | Server escalation model              | Larger model refinement path                         |
| PI-4  | Contextual memory (short window)     | Pronoun / referent resolution across recent commands |
| PI-5  | Strategic planning augmentation      | Multi-step optimization suggestions (advisory)       |

## Cross-Module Integration Notes

| Module                 | Integration                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| Navigation & Traversal | Direction validator reused; movement intents become traversal events.                                         |
| AI Prompt Engineering  | Future server escalation & strategic planning prompts use existing assembly patterns & MCP tool access.       |
| Quest & Dialogue Trees | `communicate` & `interact` verbs feed dialogue / quest triggers when target entity is an NPC or quest object. |
| Multiplayer Mechanics  | Concurrency groups may interact with party coordination logic (e.g., synchronized defend + retreat).          |

## Open Questions

1. Do we persist clarifying dialogue transcripts for audit or discard after resolution? (Leaning: short-lived, hashed for metrics only.)
2. Should pronoun resolution ("hit it") live client-side or server-side to guarantee authoritative context? (Leaning: server for consistency.)
3. Minimum viable confidence threshold before forcing escalation? (Tunable; start 0.55.)
4. Are partial acceptances (execute safe intents while awaiting clarification for others) desirable for pacing? (Probably yes with clear UI.)
5. Should we unify `guard` and `defend` or keep both? (Collect telemetry; may alias.)

## Implementation Guardrails (When Work Begins)

-   No direct world mutations from client parse; server re-validates everything.
-   New verbs require: (1) doc update, (2) telemetry addition, (3) test vectors.
-   Clarification prompts must be deterministic (no model creativity at first) to reduce latency & drift.
-   All telemetry event names added centrally before emission (consistent with existing policy).

## Change Log

| Date       | Change                         | Author        |
| ---------- | ------------------------------ | ------------- |
| 2025-10-02 | Initial specification drafted. | Copilot Agent |

---

_This specification can evolve; amendments must update this document and reference roadmap alignment before implementation._
