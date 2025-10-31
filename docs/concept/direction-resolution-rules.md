# Direction Resolution Rules (Concept Facet)

> Purpose: Canonical normalization rules for player direction input. Runtime components reference this doc; architecture links updated after relocation.

## Overview

Normalization converts messy input into canonical tokens stored on EXIT edges. Result statuses:

- `ok` – resolved
- `ambiguous` – needs heading context
- `unknown` – unresolvable

## Canonical Set

Cardinal: north,south,east,west,northeast,northwest,southeast,southwest
Vertical: up,down
Radial: in,out

## Pipeline (Priority)

1. Empty → unknown
2. Exact canonical → ok
3. Shortcut expansion (n,s,e,w,ne,nw,se,sw,u,d,i,o) → ok
4. Relative (left,right,forward,back)
    - With lastHeading → ok via rotation table
    - Without lastHeading → ambiguous
5. Typo tolerance (edit distance ≤1)
    - Single candidate → ok (clarification message)
    - Multiple candidates → unknown
6. Fallback → unknown

## Relative Rotation Table (Excerpt)

| Heading   | Left      | Right     | Forward   | Back      |
| --------- | --------- | --------- | --------- | --------- |
| north     | west      | east      | north     | south     |
| east      | north     | south     | east      | west      |
| southwest | southeast | northwest | southwest | northeast |

Vertical & radial headings treat left/right same as forward.

## Typo Examples

`nort`→north, `sooth`→south, `dwn`→down.
Ambiguous: `est` (east/west) → unknown.

## Edge Cases

Whitespace trimmed; case-insensitive; unsupported composites (north-northeast) → unknown.

## Usage Contract

Movement handler:

1. normalizeDirection(input,lastHeading?)
2. status switch → proceed / 400 with clarification
3. verify canonical exit exists before location update

## Telemetry Events (Concept)

- Navigation.Input.Parsed
- Navigation.Input.Ambiguous

Logged via centralized telemetry constants (no inline literals).

## Design Rationale

Three statuses distinguish context-required vs invalid; edit distance bounded for safety; relative directions preserved for player comfort.

## Deferred Enhancements

Semantic exits, landmark resolution, 16‑way compass, natural language prefix stripping.

## Related Docs

- [Exit Edge Invariants](./exits.md)
- [Dungeons](./dungeons.md)
- [Architecture Overview](../architecture/overview.md)
- [Navigation & Traversal Module](../modules/navigation-and-traversal.md)

---

_Last updated: 2025-10-31 (relocated to concept facet; trimmed extraneous sections for clarity)_
