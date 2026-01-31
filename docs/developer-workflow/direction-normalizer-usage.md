# Direction Normalizer Usage Guide

> **Implementation**: `shared/src/direction/directionNormalizer.ts`  
> **Design**: `docs/concept/direction-resolution-rules.md`  
> **Status**: Implemented (canonical, semantic, and relative resolution)

## Purpose

The direction normalizer provides consistent, fault-tolerant resolution of player input strings to canonical `Direction` values, handling shortcuts, typos, and case variations.

## Quick Start

Use the normalizer directly from the shared package and branch on the returned status.

Implementation references:

- `shared/src/direction/directionNormalizer.ts` (API + behavior)
- `shared/src/domainModels.ts` (`Direction`, `DIRECTIONS`, and `isDirection()`)
- `shared/test/directionNormalizer.test.ts` (canonical + relative resolution)
- `shared/test/directionNormalizerSemantic.test.ts` (semantic exit names + synonyms)

## API Reference

### `normalizeDirection(input: string): DirectionResolutionResult`

Normalizes a raw direction input string to a canonical `Direction` value.

**Parameters:**

- `input` — Raw player input (case-insensitive, whitespace trimmed)

**Returns:** a structured result (see `DirectionNormalizationResult` in `shared/src/direction/directionNormalizer.ts`).

**Resolution stages:**

1. **Exact match** — Input matches canonical direction (case-insensitive)
2. **Shortcut expansion** — Single-letter shortcuts (`n` → `north`, `ne` → `northeast`)
3. **Semantic resolution** — Exit names/synonyms/landmark aliases (when location context is provided)
4. **Relative resolution** — `left|right|forward|back` (when heading is provided)
5. **Typo tolerance** — Edit distance ≤1 from canonical
6. **Fallback** — Return `{ status: 'unknown' }` if no match

Avoid embedding examples here; the canonical behaviors are asserted in `shared/test/directionNormalizer*.test.ts`.

### `isDirection(value: string): boolean`

Type guard checking if a string is a valid canonical `Direction`.

**Parameters:**

- `value` — String to validate

**Returns:** `true` if value is in canonical direction set, `false` otherwise

See `shared/src/domainModels.ts` for the canonical set and type guard.

## Canonical Direction Set

There are 12 canonical directions (all lowercase):

| Category | Directions                                         |
| -------- | -------------------------------------------------- |
| Cardinal | `north`, `south`, `east`, `west`                   |
| Diagonal | `northeast`, `northwest`, `southeast`, `southwest` |
| Vertical | `up`, `down`                                       |
| Radial   | `in`, `out`                                        |

**Shortcuts:**

- Single-letter: `n`, `s`, `e`, `w`, `u`, `d`
- Two-letter: `ne`, `nw`, `se`, `sw`

## Integration Patterns

Integration notes:

- Normalize once per request and pass the canonical `Direction` downstream.
- Treat `ambiguous` as “needs clarification” (UX prompt) rather than guessing.
- If you have location context (exit names/synonyms) or player heading, pass it to improve resolution.

## Telemetry Instrumentation

Always emit `Navigation.Input.Parsed` when normalizing player input.

Reference: `docs/observability/telemetry-catalog.md` → `Navigation.Input.Parsed`.

**Purpose:** Track normalization success rate, identify common typos, tune edit distance threshold.

## Extension points

Semantic exit names and relative directions are implemented; the behavior is covered by:

- `shared/test/directionNormalizerSemantic.test.ts`
- `shared/test/directionNormalizer.test.ts`

## Error Handling

| Scenario               | Behavior                                                                | HTTP Response   |
| ---------------------- | ----------------------------------------------------------------------- | --------------- |
| Valid direction        | Return `{ status: 'ok', canonical }`                                    | 200 (proceed)   |
| Valid but missing exit | Return `{ status: 'generate', canonical, generationHint }` (if context) | 409 / UX prompt |
| Ambiguous              | Return `{ status: 'ambiguous', clarification, ambiguityCount? }`        | 409 / UX prompt |
| Unknown input          | Return `{ status: 'unknown', clarification }`                           | 400 Bad Request |

**Never throw exceptions** — all failure modes return structured results.

## Performance Considerations

- **Normalization latency:** <1ms for in-memory cases
- **Cache exits:** If using semantic resolution, cache exit lookups per location
- **Avoid repeated calls:** Normalize once per request; pass `Direction` downstream

## Common Pitfalls

1. **Case sensitivity:** Always use lowercase internally; normalizer handles case conversion
2. **Whitespace:** Input is trimmed automatically; no need to pre-process
3. **Type safety:** Don't cast raw strings to `Direction` — use `isDirection()` guard
4. **Telemetry:** Emit `Navigation.Input.Parsed` even on failure (observability requirement)

## Testing Checklist

- [ ] Exact match (all 12 canonical directions)
- [ ] Shortcuts (all 8 shortcuts)
- [ ] Typos (1-char edit distance for common typos: `nrth`, `esst`, `wset`)
- [ ] Case insensitivity (`NORTH`, `North`, `north`)
- [ ] Whitespace trimming (`" north "`)
- [ ] Unknown input (`xyz`, `123`, empty string)
- [ ] Edge cases (numeric input, special chars)

## Related Documentation

- [Direction Resolution Rules](../concept/direction-resolution-rules.md) — Normalization invariants (concept facet)
- [Exit Edge Invariants](../concept/exits.md) — Exit edge invariants (concept facet)
- [Telemetry Events](../observability.md) — Event catalog

---

**Last Updated:** 2026-01-30
