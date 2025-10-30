# Direction Resolution Rules

> Purpose: Document the canonical rules for normalizing player direction input, focusing on ambiguous and edge cases. This document serves as the authoritative reference for how the `normalizeDirection` function handles all input types.

## Overview

Direction normalization converts player input (which can be messy, abbreviated, or contextual) into canonical direction tokens that are stored on EXIT edges. The normalization process returns one of three statuses:

- **`ok`** – Input successfully resolved to a canonical direction
- **`ambiguous`** – Input requires additional context to resolve (e.g., relative direction without heading)
- **`unknown`** – Input cannot be mapped to any canonical direction

## Canonical Direction Set

The following directions are considered canonical and can be stored on EXIT edges:

**Cardinal (8-way compass):**
- `north`, `south`, `east`, `west`
- `northeast`, `northwest`, `southeast`, `southwest`

**Vertical:**
- `up`, `down`

**Radial (portal/doorway semantics):**
- `in`, `out`

## Resolution Pipeline (Priority Order)

Input is processed through the following stages in order. The first matching stage determines the result.

### 1. Empty Input
**Input:** Empty string or whitespace only  
**Status:** `unknown`  
**Clarification:** "Direction cannot be empty. Try: north, south, east, west, up, down, in, out."

### 2. Exact Canonical Match
**Input:** Already a canonical direction (case-insensitive)  
**Examples:** `north`, `SOUTH`, `NorthEast`  
**Status:** `ok`  
**Result:** Lowercased canonical direction

### 3. Shortcut Expansion
**Input:** Single-character or two-character abbreviation  
**Mapping:**
- `n` → `north`
- `s` → `south`
- `e` → `east`
- `w` → `west`
- `ne` → `northeast`
- `nw` → `northwest`
- `se` → `southeast`
- `sw` → `southwest`
- `u` → `up`
- `d` → `down`
- `i` → `in`
- `o` → `out`

**Status:** `ok`  
**Result:** Expanded canonical direction

### 4. Relative Direction (Context-Dependent)
**Input:** `left`, `right`, `forward`, `back` (case-insensitive)

#### 4a. With Last Heading Context
**Requires:** `lastHeading` parameter must be provided  
**Status:** `ok`  
**Behavior:** Resolves relative direction based on compass rotation from the player's last heading

**Resolution Table:**

| Last Heading | Forward       | Back          | Left          | Right         |
|-------------|---------------|---------------|---------------|---------------|
| north       | north         | south         | west          | east          |
| south       | south         | north         | east          | west          |
| east        | east          | west          | north         | south         |
| west        | west          | east          | south         | north         |
| northeast   | northeast     | southwest     | northwest     | southeast     |
| northwest   | northwest     | southeast     | southwest     | northeast     |
| southeast   | southeast     | northwest     | northeast     | southwest     |
| southwest   | southwest     | northeast     | southeast     | northwest     |
| up          | up            | down          | up            | up            |
| down        | down          | up            | down          | down          |
| in          | in            | out           | in            | in            |
| out         | out           | in            | out           | out           |

**Note:** Vertical (`up`/`down`) and radial (`in`/`out`) directions have ambiguous left/right semantics. When the last heading is vertical or radial, left/right resolve to the same direction as forward (the system cannot determine a lateral orientation).

#### 4b. Without Last Heading Context (Ambiguous Case)
**Status:** `ambiguous`  
**Canonical:** `undefined`  
**Clarification:** `Relative direction "<input>" requires a previous move to establish heading. Try a specific direction like "north" or "south".`

**Rationale:** Without knowing which direction the player previously moved, relative directions cannot be unambiguously resolved. The player must either:
1. Use a cardinal direction instead, or
2. Make an initial move to establish a heading, after which relative directions become available

### 5. Typo Tolerance (Edit Distance ≤1)
**Input:** String with a single character edit (substitution, insertion, or deletion) from a canonical direction  
**Examples:**
- `nort` → `north` (deletion)
- `sooth` → `south` (substitution)
- `norrth` → `north` (insertion)
- `dwn` → `down` (deletion)

**Algorithm:** Levenshtein edit distance calculation against all canonical directions

#### 5a. Single Match Found
**Status:** `ok`  
**Result:** The matched canonical direction  
**Clarification:** `Interpreted "<input>" as "<canonical>".`

**Example:** Input `nort` returns:
```typescript
{
  status: 'ok',
  canonical: 'north',
  clarification: 'Interpreted "nort" as "north".'
}
```

#### 5b. Multiple Matches (Ambiguous Typo)
**Status:** `unknown`  
**Canonical:** `undefined`  
**Clarification:** Generic unknown message (see stage 6)

**Example:** Input `est` could match both `east` (edit distance 1) and `west` (edit distance 1)  
**Rationale:** When multiple directions match with the same edit distance, the system cannot determine user intent and treats it as unknown rather than guessing incorrectly.

#### 5c. No Match Within Tolerance
**Status:** `unknown`  
**Proceeds to stage 6**

### 6. Unknown Input (Fallback)
**Input:** Any string that doesn't match stages 1-5  
**Status:** `unknown`  
**Canonical:** `undefined`  
**Clarification:** `"<input>" is not a recognized direction. Try: north, south, east, west, up, down, in, out, or shortcuts like n, s, e, w.`

**Examples:**
- `invalid`
- `northeast-east` (unsupported composite)
- `xyz`
- `weast` (ambiguous typo)

## Edge Cases

### Case-Insensitivity
All input is converted to lowercase before processing. `NORTH`, `North`, and `north` are treated identically.

### Whitespace Trimming
Leading and trailing whitespace is trimmed. `"  north  "` becomes `"north"`.

### Composite/Unsupported Directions
Directions not in the canonical set (e.g., `north-northeast`, `ESE`) are treated as unknown. Future expansion may support 16-way compass, but currently only 8-way cardinal plus vertical and radial are recognized.

### Semantic Exit Names (Future)
The current normalizer handles only abstract direction tokens. Named semantic exits (e.g., `archway`, `tunnel`, `gate`) will be handled at a higher layer (see `navigation-and-traversal.md` for roadmap).

## Implementation Reference

**Module:** `shared/src/direction/directionNormalizer.ts`  
**Function:** `normalizeDirection(input: string, lastHeading?: Direction): DirectionNormalizationResult`  
**Tests:** `shared/test/directionNormalizer.test.ts`

## Usage in Movement Logic

When a player attempts to move:

1. Call `normalizeDirection(playerInput, lastHeading)`
2. Check result status:
   - **`ok`** → Proceed with movement using `canonical` direction
   - **`ambiguous`** → Return 400 error with `clarification` message prompting for cardinal direction
   - **`unknown`** → Return 400 error with `clarification` message listing valid directions

3. If status is `ok`, verify an EXIT edge exists in the graph with the canonical direction before updating player location.

## Telemetry Considerations

The following telemetry events are relevant to direction resolution:

- `Navigation.Input.Parsed` – Logs successful normalization (status `ok`)
- `Navigation.Input.Ambiguous` – Logs ambiguous resolution requiring clarification

Instrumentation should use the centralized `trackGameEventStrict` to enforce event name validity.

## Design Rationale

### Why Three Statuses?
- **`ok`** clearly indicates success
- **`ambiguous`** distinguishes "needs more context" from "invalid input", allowing better user feedback
- **`unknown`** covers all other failure cases with helpful suggestions

### Why Reject Ambiguous Typos?
When edit distance produces multiple candidates (e.g., `est` matching both `east` and `west`), choosing arbitrarily would be error-prone. Treating it as unknown and prompting the user ensures intentional movement.

### Why Preserve Relative Directions?
Player convenience and natural language feel. "Go left" is more intuitive than forcing players to always think in cardinal terms. The heading store enables this without compromising data model simplicity (only canonical directions are stored).

### Why Edit Distance ≤1?
Balance between helpfulness and safety. Edit distance of 1 catches common typos (missing letter, extra letter, wrong letter) without producing false matches. Larger thresholds would increase ambiguity.

## Future Enhancements (Deferred)

- **Semantic disambiguation:** "north gate" vs "north tunnel" when multiple north exits exist
- **Landmark resolution:** "go to fountain" resolved to direction based on location data
- **16-way compass:** Add intercardinal refinements (NNE, ENE, etc.) for higher precision navigation
- **Natural language prefixes:** Strip "go", "walk", "head" automatically before processing

See `navigation-and-traversal.md` for the full normalization roadmap.

## Related Documentation

-   [Exit Edge Invariants](./exits.md) – Exit creation/removal flow and invariants
-   [Navigation & Traversal](../modules/navigation-and-traversal.md) – Full normalization roadmap and movement semantics
-   [Direction Normalizer Usage](../developer-workflow/direction-normalizer-usage.md) – Practical usage guide
-   [Architecture Overview](./overview.md) – Implementation to design mapping
-   [Dungeons](./dungeons.md) – Dungeon-specific direction handling

---

_Last updated: 2025-10-21 – Extracted from implementation as authoritative reference per issue #[issue-number]_
