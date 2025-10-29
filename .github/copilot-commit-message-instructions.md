---
description: Commit message style & structure guidelines
applyTo: '**'
---

# Commit Message Instructions

Follow this lightweight format to keep history clean, searchable, and automation‑friendly.

## Format

1. Subject line (≤ 50 characters, imperative mood)
2. Blank line
3. Optional body (wrap at ~72 chars) with rationale / context / breaking notes.

```
Add exits summary cache regen

Implements invalidation hook called after EXIT create/update/delete.
Updates traversal docs reference and adds unit tests around ordering.
```

If the change is trivially clear (docs typo, comment tweak), omit the body.

## Subject Line Rules

-   Use imperative present tense: "Add", "Fix", "Refactor" (not "Added" or "Adds").
-   Keep ≤ 50 chars (hard stop). Rewrite rather than truncate mid‑word.
-   Do NOT suffix with a period.
-   Prefer a single, specific action: `Refactor exit normalizer`, not `Refactor + test + doc`.
-   Avoid noisy prefixes (`chore:` / `feat:`). The taxonomy already lives in the issue.

## Body Guidelines (When Needed)

Answer the minimal set:

-   What changed beyond the obvious filename diff?
-   Why (problem / constraint / motivation)?
-   How (notable approach, trade‑off, perf / safety consideration)?
-   Any follow‑up tasks or TODO anchors created?

Separate logical paragraphs with a blank line. Use bullet lists sparingly for multiple points. Reference code symbols in backticks.

## Issue & Taxonomy References

-   Reference the issue number on a separate final line if an opened issue exists: `Refs #123` or `Fixes #123` (auto‑closure keyword when appropriate).
-   Do NOT replicate labels (e.g. `scope:world`, `feature`) in the commit; ordering automation has been deprecated.
-   If no issue exists for a non‑trivial change, open one first; commits should advance tracked work.

## Breaking Changes

If a public API, data contract, or migration requirement changes, add a `BREAKING:` paragraph at the end summarizing required consumer action.

```
BREAKING: Renamed Location.exits to Location.outboundExits; update seed scripts.
```

## Examples

```
Persist location vertex schema

Adds minimal Cosmos Gremlin upsert + fetch with idempotent revision bump.
Emits telemetry event World.Location.Upsert (ru, ms). Refs #41.
```

```
Refactor direction parser

Extract normalization steps into pipeline functions enabling granular tests
and future semantic exit synonym resolution. No behavior change. Refs #58.
```

```
Fix look handler null deref

Guard against missing exitsSummaryCache; falls back to recompute. Adds test.
Fixes #77.
```

## Anti-Patterns (Avoid)

| Bad                                              | Why                                         |
| ------------------------------------------------ | ------------------------------------------- |
| `update stuff`                                   | Vague; unsearchable.                        |
| `fix bug in movement`                            | What bug? Provide symptom or cause.         |
| `feat: add new traversal`                        | Redundant prefix; verbose.                  |
| `Refactored exits.`                              | Past tense, trailing period, unclear scope. |
| `Add direction normalization and tests and docs` | Multiple actions; split commits.            |

## Quick Checklist Before Commit

-   [ ] Subject ≤ 50 chars & imperative
-   [ ] Blank line after subject
-   [ ] Body only if it adds decision/value context
-   [ ] References issue (`Refs # / Fixes #`) if applicable
-   [ ] No stray debug code / focus artifacts

> Keep it **succinct**, **actionable**, and **just enough context**—the issue and code diff carry the rest.

_Last reviewed: 2025-10-29_
