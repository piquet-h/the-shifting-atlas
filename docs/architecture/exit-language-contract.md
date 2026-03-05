---
title: Exit Language Contract
description: Bounded specification for generated exit descriptions — duration buckets, language hints, content rules, layering relationship, and validator checks.
---

# Exit Language Contract

> STATUS: DEFINED (2026-03-03). Spec-only; no generation engine implemented yet. Aligns with tokenless layering model and narration governance constraints.
>
> Related: `../design-modules/description-layering-and-variation.md` · `narration-governance.md` · `../concept/exits.md` · `exit-generation-hints.md` · `../DESIGN_CLARIFICATION_intent_vs_narrative.md`

## Purpose

Exit descriptions convey **placement and distance conservatively**. They are a single-sentence spatial cue — not ambient narration, not destination spoilers, and never a substitute for the richer prose that additive layers supply.

This contract defines:

1. Deterministic travel-duration buckets that map `travelDurationMs` → language register.
2. Low-cardinality optional language hints that guide (not constrain) AI generation.
3. The bounded description contract: maximum length, target range, forbidden content, and direction coherence rules.
4. How exit text relates to tokenless layering — why it stays conservative by design.
5. Validator checks that enforce the contract at generation time.

---

## 1. Travel Duration Buckets

Generated exit language must reflect distance **qualitatively** without leaking mechanical durations ("37 minutes", "two hours"). A deterministic bucket is derived from the exit edge's `travelDurationMs` property at generation time.

### 1.1 Bucket Definitions

| Bucket       | `travelDurationMs` range | Narrative register                                    | Typical verbs / phrases                             |
| ------------ | ------------------------ | ----------------------------------------------------- | --------------------------------------------------- |
| `threshold`  | < 15 000 (15 s)          | Immediate transition; no journey implied              | "leads through", "opens into", "steps down into"    |
| `near`       | 15 000 – 299 999         | A few paces; same district, short cross               | "leads across to", "a short path connects"          |
| `moderate`   | 300 000 – 1 799 999      | Brief walk; connecting areas (urban default = 5 min)  | "continues toward", "a road heads", "the lane runs" |
| `far`        | 1 800 000 – 14 399 999   | Significant leg; traveller leaves immediate vicinity  | "winds toward", "a track leads", "stretches toward" |
| `distant`    | ≥ 14 400 000 (4 h)       | Long journey; horizon scale                           | "disappears toward", "the way extends far"          |

**Fallback**: When `travelDurationMs` is absent on an edge, treat as `moderate` (aligns with `DEFAULT_TRAVEL_DURATION_MS = 60 000` ms, which falls in the `near` band — implementers may choose either; document the choice in the generation prompt).

> **Note on `in`/`out` exits**: Regardless of duration, `in` and `out` exits are almost always `threshold` transitions (doorways, archways, hatches, entrances). If their stored `travelDurationMs` falls outside the threshold range, clamp language to `threshold` unless a `transitionKind` hint explicitly overrides this.

### 1.2 Prohibited Duration Language

Regardless of bucket, exit descriptions MUST NOT contain:

- Explicit numeric durations: "five minutes", "an hour", "37 minutes".
- Relative time qualifiers keyed to real units: "a day's ride", "two days' walk" — use `far` or `distant` register language instead.

---

## 2. Exit Language Hints

A small, low-cardinality set of optional fields may be attached to an exit edge to guide AI generation. These are **advisory** (AI may deviate where narrative demands), **not constraints**.

### 2.1 Hint Schema

| Field            | Values (enum)                                                                    | Persisted? | Purpose                                                                   |
| ---------------- | -------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------- |
| `pathKind`       | `road` \| `track` \| `trail` \| `door` \| `gate` \| `stair` \| `ladder` \| `gap` \| `ford` \| `passage` | **Yes** | Stable structural fact about the physical surface / crossing type. |
| `grade`          | `ascending` \| `descending` \| `level`                                           | **Yes**    | Topographic elevation change; informs vertical-motion verb selection.     |
| `transitionKind` | `outdoor-to-indoor` \| `indoor-to-outdoor` \| `above-to-below` \| `below-to-above` \| `water-crossing` \| `open-air` | **Yes** | Spatial transition type; governs threshold vs journey language. |
| `occlusion`      | `open` \| `dim` \| `obscured` \| `sealed`                                        | **No**     | Ephemeral visibility / access state; generation-only; not stored on edge. |

**Why persisted vs not**: `pathKind`, `grade`, and `transitionKind` are stable spatial facts about the edge (they rarely change without a structural world event). `occlusion` is ephemeral context (time-of-day, weather, open/closed state) and must not be persisted on the exit edge — it belongs in an ambient or structural-event layer if world-state relevant.

### 2.2 Hint Usage Rules

- A hint's absence means "AI decides, conservatively". Never infer a structural hint from an adjacent location's description.
- When `grade = ascending` or `grade = descending` is present on a cardinal direction (`north`, `south`, `east`, `west`), the AI may use vertical-motion language ("climbs steeply", "drops away").
- When `grade = ascending/descending` is absent, cardinal exits must not use climbing/descending verbs.
- `transitionKind` takes precedence over duration bucket for threshold classification: `outdoor-to-indoor` always produces threshold-register language regardless of duration.
- `pathKind = door | gate | stair | ladder | gap | passage` implies `threshold` register. `pathKind = road | track | trail | ford` defers to duration bucket.

---

## 3. Bounded Exit Description Contract

### 3.1 Length

| Metric          | Value           |
| --------------- | --------------- |
| Maximum chars   | 120             |
| Target range    | 40 – 90 chars   |
| Sentences       | Exactly 1       |

Rationale: Exit text is spatial glue, not prose. It must be scannable at a glance. Richer language lives in ambient and enhancement layers (see §4).

### 3.2 Forbidden Content

Exit descriptions MUST NOT contain:

| Category                  | Rule                                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| **Proper nouns**          | No new named locations, settlements, NPCs, factions, or deities unless explicitly provided in the `destinationName` generation parameter. |
| **Faction / NPC references** | No faction banners, NPC names, quest actors, or political allegiances.                    |
| **Mechanical durations**  | No clock times, day counts, or numeric distances (see §1.2).                                 |
| **Weather / time-of-day** | No "foggy morning path", "sunset-lit road". Those are ambient layer content.                 |
| **Conditional state**     | No "the road that was blocked last week", no event-dependent wording.                        |
| **Multiple clauses**      | No coordinate conjunctions that add a second sentence-worth of information.                  |
| **Destination spoilers**  | Never name or describe what is at the destination unless `destinationName` is provided.      |

### 3.3 Direction Coherence Rules

| Direction            | Required language register                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `north/south/east/west` | Horizontal movement implied. No climbing/descending verbs unless `grade ≠ level` hint is present.            |
| `up`                 | Upward motion always implied. Use `stair`, `ladder`, `slope` register. No flat-road language.                    |
| `down`               | Downward motion always implied. Mirror of `up` rules.                                                           |
| `in`                 | Threshold transition into an interior. Use entry-register language. Never "a road leads in".                    |
| `out`                | Threshold transition to exterior. Use exit-register language.                                                    |
| Diagonal (`northeast`, etc.) | Same rules as cardinal with diagonal qualifier. Avoid pure cardinal in text ("north" for "northeast").  |

**Stub / missing destination rule**: When the destination location is absent or a stub (not yet generated), exit text MUST remain fully generic. It may not infer toponym, biome, or building type from context. Use the safest bucket-appropriate phrase: e.g., "A track continues north." rather than "A track leads toward the distant hills."

---

## 4. Relationship to Tokenless Layering

Exit text is **deliberately conservative** because the tokenless layering model provides richer ambient context additively. The layering principle (see `description-layering-and-variation.md`) is:

```
Base → Structural Events → Ambient → Enhancement → Exit Summary → Personalization
```

Exit descriptions feed the **Exit Summary** step, which assembles exit text into the rendered view after ambient layers are applied. This means:

- Exit text is static (stable on the edge), not re-generated per render.
- Sensory atmosphere ("the cool mist of the forest path"), seasonal mood, and faction context all arrive via overlays, never via the exit description itself.
- Exit text surviving many render contexts must remain true across all of them — it cannot describe conditions that vary.

**Generation contract (summary)**:

> Exit text is the label on the spatial graph edge. Layers paint the scene around it. Exit text must remain true when the ambient layer is "midday sun" and equally true when it is "dense fog". Write accordingly.

---

## 5. Validator Checks

Validators run at generation time (before persistence) and at audit time (batch re-scan). A failing check discards the candidate and requests a regeneration (bounded retry, same as narration governance policy).

### 5.1 Checks Table

| Check ID | Check Name              | Rule                                                                                     | Failure action       |
| -------- | ----------------------- | ---------------------------------------------------------------------------------------- | -------------------- |
| EL-01    | Length hard limit       | `length(text) ≤ 120`                                                                     | Reject / retry       |
| EL-02    | Length minimum          | `length(text) ≥ 15` (guards against empty/stub output)                                  | Reject / retry       |
| EL-03    | Single sentence         | No more than one sentence-terminal punctuation mark (`[.!?]`) in the text                | Reject / retry       |
| EL-04    | No numeric duration     | Text matches no pattern `\d+\s*(minute|hour|day|second|min|hr)s?`                        | Reject / retry       |
| EL-05    | Direction mismatch      | If direction is `in` or `out`, text must not contain road/path/journey verbs (road, trail, track, journey, walk, ride) | Reject / retry |
| EL-06    | Vertical coherence      | If direction is `north/south/east/west` and `grade` hint is absent or `level`, text must not contain climb/descend verbs | Reject / retry |
| EL-07    | Canon creep — proper noun | Text must not introduce any token matching a proper-noun pattern (`[A-Z][a-z]+` preceded by neither sentence-start nor direction keyword) that is absent from the provided generation context | Reject / retry |
| EL-08    | No destination inference | When `destinationName` is absent, text must not contain place-name tokens from any location in the world graph | Reject / retry |
| EL-09    | Forbidden categories    | Text must not match patterns for: faction names, NPC names, weather/time-of-day adjectives (see narration governance blocklist) | Reject / quarantine |

### 5.2 Check Ordering (Fail-Fast)

Checks execute in the order listed above. The first failure triggers rejection; subsequent checks are skipped. This prevents partial mutations and aligns with the description-layering validation pipeline.

### 5.3 Audit Re-scan Policy

A nightly audit job re-runs checks EL-04, EL-07, EL-08, and EL-09 against all persisted exit descriptions. Anomalies raise `Navigation.Exit.DescriptionAuditFailed` telemetry and flag the exit for author review (no auto-correction).

---

## 6. Telemetry Events

_(All names are illustrative; add to `shared/src/telemetryEvents.ts` before first use.)_

| Event                                      | Trigger                                    | Key Dimensions                             |
| ------------------------------------------ | ------------------------------------------ | ------------------------------------------ |
| `Navigation.Exit.DescriptionGenerated`     | New exit description accepted              | `durationBucket`, `pathKind?`, `grade?`, `charLength` |
| `Navigation.Exit.DescriptionRejected`      | Validator rejects a candidate              | `checkId`, `attemptNumber`                 |
| `Navigation.Exit.DescriptionAuditFailed`   | Nightly audit finds anomaly                | `checkId`, `exitId`                        |

---

## 7. Example Descriptions (Illustrative)

The following are reference outputs at each duration bucket. They do not embed lore; test fixtures carry concrete location-specific samples.

| Bucket      | Direction | Hint(s)                    | Example text                                        |
| ----------- | --------- | -------------------------- | --------------------------------------------------- |
| `threshold` | `in`      | `pathKind=door`            | "A low door opens into the building."               |
| `threshold` | `down`    | `transitionKind=above-to-below` | "A short ladder descends into the darkness below." |
| `near`      | `north`   | —                          | "A narrow path leads north across the yard."        |
| `moderate`  | `east`    | `pathKind=road`            | "A cobbled road continues east toward open ground." |
| `far`       | `west`    | `pathKind=track, grade=ascending` | "A worn track climbs westward into the hills." |
| `distant`   | `north`   | —                          | "The road disappears north into the distance."      |

---

## 8. Out of Scope

- Full layering engine implementation (tracked in `description-layering-and-variation.md`).
- Exit inference from location prose (tracked separately).
- AI prompt templates for exit generation (tracked in `ai-prompt-engineering.md`).
- Runtime enforcement machinery (validators described here are specifications, not implemented code).

---

## Related Documentation

- [Exit Edge Invariants](../concept/exits.md) — structural integrity rules for exit edges
- [Exit Intent Capture](../concept/exit-intent-capture.md) — forbidden exit metadata and availability states
- [Exit Generation Hints – Architecture](./exit-generation-hints.md) — queue handler, debounce, and privacy
- [Description Layering & Variation](../design-modules/description-layering-and-variation.md) — tokenless layering model
- [Narration Governance](./narration-governance.md) — output classification, validator pipeline, drift audit
- [Design Clarification: State vs Narration](../DESIGN_CLARIFICATION_intent_vs_narrative.md) — why narration is ephemeral

---

_Last updated: 2026-03-03 (initial definition)_
