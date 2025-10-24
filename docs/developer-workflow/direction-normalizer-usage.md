# Direction Normalizer Usage Guide

> **Implementation**: `shared/src/direction/directionNormalizer.ts`  
> **Design**: `docs/architecture/direction-resolution-rules.md`  
> **Status**: Implemented (N1 complete; N2/N3 planned)

## Purpose

The direction normalizer provides consistent, fault-tolerant resolution of player input strings to canonical `Direction` values, handling shortcuts, typos, and case variations.

## Quick Start

```typescript
import { normalizeDirection, isCanonicalDirection } from '@piquet-h/shared/direction'

// Basic usage
const result = normalizeDirection('n')
if (result.status === 'ok') {
    console.log(result.direction) // 'north'
}

// Validation
if (isCanonicalDirection('northeast')) {
    // Direction is valid
}
```

## API Reference

### `normalizeDirection(input: string): DirectionResolutionResult`

Normalizes a raw direction input string to a canonical `Direction` value.

**Parameters:**

-   `input` — Raw player input (case-insensitive, whitespace trimmed)

**Returns:** `DirectionResolutionResult`

```typescript
type DirectionResolutionResult =
    | { status: 'ok'; direction: Direction }
    | { status: 'ambiguous'; candidates: Direction[] }
    | { status: 'unknown' }
```

**Resolution Stages (N1):**

1. **Exact match** — Input matches canonical direction (case-insensitive)
2. **Shortcut expansion** — Single-letter shortcuts (`n` → `north`, `ne` → `northeast`)
3. **Typo tolerance** — Edit distance ≤1 from canonical (e.g., `nrth` → `north`)
4. **Fallback** — Return `{ status: 'unknown' }` if no match

**Examples:**

```typescript
normalizeDirection('NORTH') // { status: 'ok', direction: 'north' }
normalizeDirection('ne') // { status: 'ok', direction: 'northeast' }
normalizeDirection('nrth') // { status: 'ok', direction: 'north' } (typo)
normalizeDirection('xyz') // { status: 'unknown' }
```

### `isCanonicalDirection(value: string): boolean`

Type guard checking if a string is a valid canonical `Direction`.

**Parameters:**

-   `value` — String to validate

**Returns:** `true` if value is in canonical direction set, `false` otherwise

**Example:**

```typescript
if (isCanonicalDirection(userInput)) {
    // Safe to cast: userInput as Direction
}
```

## Canonical Direction Set

N1 supports 12 canonical directions (all lowercase):

| Category | Directions                                         |
| -------- | -------------------------------------------------- |
| Cardinal | `north`, `south`, `east`, `west`                   |
| Diagonal | `northeast`, `northwest`, `southeast`, `southwest` |
| Vertical | `up`, `down`                                       |
| Radial   | `in`, `out`                                        |

**Shortcuts (N1):**

-   Single-letter: `n`, `s`, `e`, `w`, `u`, `d`
-   Two-letter: `ne`, `nw`, `se`, `sw`

## Integration Patterns

### HTTP Handler Usage

```typescript
import { normalizeDirection } from '@piquet-h/shared/direction'
import { trackGameEventStrict } from '../telemetry.js'

export async function HttpMovePlayer(req: HttpRequest, context: InvocationContext) {
    const rawDirection = req.query.get('direction') || ''
    const resolution = normalizeDirection(rawDirection)

    // Telemetry (always emit, regardless of outcome)
    trackGameEventStrict('Navigation.Input.Parsed', {
        rawInput: rawDirection,
        status: resolution.status,
        direction: resolution.status === 'ok' ? resolution.direction : undefined
    })

    if (resolution.status !== 'ok') {
        return { status: 400, jsonBody: { error: 'Invalid direction' } }
    }

    // Proceed with resolution.direction (guaranteed valid)
    // ...
}
```

### Test Usage

```typescript
import { normalizeDirection } from '@piquet-h/shared/direction'
import { describe, it, expect } from 'vitest'

describe('Direction normalization', () => {
    it('resolves shortcuts', () => {
        expect(normalizeDirection('n')).toEqual({ status: 'ok', direction: 'north' })
    })

    it('handles typos', () => {
        expect(normalizeDirection('esst')).toEqual({ status: 'ok', direction: 'east' })
    })

    it('rejects invalid input', () => {
        expect(normalizeDirection('invalid')).toEqual({ status: 'unknown' })
    })
})
```

## Telemetry Instrumentation

Always emit `Navigation.Input.Parsed` event when normalizing player input:

```typescript
trackGameEventStrict('Navigation.Input.Parsed', {
    rawInput: string,           // Original player input
    status: 'ok' | 'ambiguous' | 'unknown',
    direction?: Direction,      // Only if status === 'ok'
    candidates?: Direction[],   // Only if status === 'ambiguous'
    latencyMs?: number          // Optional resolution time
})
```

**Purpose:** Track normalization success rate, identify common typos, tune edit distance threshold.

## Extension Points (N2/N3 Planned)

### N2: Semantic Exit Names

Extend `normalizeDirection()` to accept location context:

```typescript
// Future API (not yet implemented)
normalizeDirection(input, {
    locationExits: [{ direction: 'north', name: 'wooden_door', synonyms: ['door', 'gate'] }]
})
// Input "door" → resolves to 'north' if unambiguous
```

See issue #33 for N2 implementation plan.

### N3: Relative Directions

Extend to support player heading:

```typescript
// Future API (not yet implemented)
normalizeDirection(input, { currentHeading: 'north' })
// Input "left" → resolves to 'west'
```

See issue #256 for N3 implementation plan.

## Error Handling

| Scenario        | Behavior                                     | HTTP Response   |
| --------------- | -------------------------------------------- | --------------- |
| Valid direction | Return `{ status: 'ok' }`                    | 200 (proceed)   |
| Unknown input   | Return `{ status: 'unknown' }`               | 400 Bad Request |
| Ambiguous (N2+) | Return `{ status: 'ambiguous', candidates }` | 409 Conflict    |

**Never throw exceptions** — all failure modes return structured results.

## Performance Considerations

-   **Normalization latency:** <1ms for all N1 cases (in-memory operations only)
-   **Cache exits:** If using semantic resolution (N2), cache exit lookups per location
-   **Avoid repeated calls:** Normalize once per request; pass `Direction` downstream

## Common Pitfalls

1. **Case sensitivity:** Always use lowercase internally; normalizer handles case conversion
2. **Whitespace:** Input is trimmed automatically; no need to pre-process
3. **Type safety:** Don't cast raw strings to `Direction` — use `isCanonicalDirection()` guard
4. **Telemetry:** Emit `Navigation.Input.Parsed` even on failure (observability requirement)

## Testing Checklist

-   [ ] Exact match (all 12 canonical directions)
-   [ ] Shortcuts (all 8 shortcuts)
-   [ ] Typos (1-char edit distance for common typos: `nrth`, `esst`, `wset`)
-   [ ] Case insensitivity (`NORTH`, `North`, `north`)
-   [ ] Whitespace trimming (`" north "`)
-   [ ] Unknown input (`xyz`, `123`, empty string)
-   [ ] Edge cases (numeric input, special chars)

## Related Documentation

-   [Direction Resolution Rules](../architecture/direction-resolution-rules.md) — Algorithm design & decision rationale
-   [Exits Architecture](../architecture/exits.md) — Exit edge invariants
-   [Telemetry Events](../observability.md) — Event catalog
-   Issue #33 — Semantic Exit Names (N2)
-   Issue #256 — Relative Directions (N3)

---

**Last Updated:** 2025-10-24
