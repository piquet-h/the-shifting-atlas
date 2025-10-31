# Direction Resolution Rules

> Purpose: Document the canonical rules for normalizing player direction input, focusing on ambiguous and edge cases. This document serves as the authoritative reference for how the `normalizeDirection` function handles all input types.

## Overview

Direction normalization converts player input (which can be messy, abbreviated, semantic, or contextual) into canonical direction tokens that are stored on EXIT edges. The normalization process returns one of three statuses:

- **`ok`** – Input successfully resolved to a canonical direction
- **`ambiguous`** – Input requires additional context to resolve (e.g., relative direction without heading, or multiple semantic matches)
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

### 4. Semantic Exit Resolution (N2)

**Input:** Exit name, synonym, or landmark alias (requires `locationContext`)  
**Behavior:** Matches player input against location-specific semantic names

#### 4a. Exit Name Match
**Input:** Matches an exit's `name` property exactly (case-insensitive)  
**Examples:** 
- Input: `wooden_door`, Exit: `{ direction: 'north', name: 'wooden_door' }` → `north`
- Input: `IRON_GATE`, Exit: `{ direction: 'east', name: 'Iron_Gate' }` → `east`

**Status:** `ok`  
**Result:** The direction of the matching exit

#### 4b. Synonym Match
**Input:** Matches any entry in an exit's `synonyms` array (case-insensitive)  
**Examples:**
- Input: `gate`, Exit: `{ direction: 'north', synonyms: ['gate', 'entrance'] }` → `north`
- Input: `ladder`, Exit: `{ direction: 'up', synonyms: ['ladder', 'stairs'] }` → `up`

**Status:** `ok`  
**Result:** The direction of the matching exit

#### 4c. Landmark Alias Match
**Input:** Matches a landmark alias from location's `landmarkAliases` mapping (case-insensitive)  
**Examples:**
- Input: `fountain`, Location: `{ landmarkAliases: { 'fountain': 'south' } }` → `south`
- Input: `Market_Square`, Location: `{ landmarkAliases: { 'Market_Square': 'north' } }` → `north`

**Priority:** Exit names and synonyms are checked before landmark aliases. If an exit has a name that matches a landmark alias, the exit direction takes precedence.

**Status:** `ok`  
**Result:** The direction from the landmark alias mapping

#### 4d. Ambiguous Semantic Match (Multiple Candidates)
**Input:** Matches multiple exits or landmarks  
**Examples:**
- Input: `door`, two exits have `synonyms: ['door']` → ambiguous
- Input: `passage`, two exits named `passage` → ambiguous

**Status:** `ambiguous`  
**Canonical:** `undefined`  
**Clarification:** `"<input>" matches multiple exits: <direction1>, <direction2>. Please specify which direction.`  
**Telemetry Field:** `ambiguityCount` set to the number of matching directions

**Rationale:** When multiple exits match the same semantic name, the system cannot determine user intent and requires disambiguation. Players should use either:
1. A more specific semantic name (if available)
2. A canonical direction
3. A shortcut

#### 4e. No Semantic Match
**Input:** Does not match any exit name, synonym, or landmark alias  
**Proceeds to stage 5**

**Note:** If no `locationContext` is provided to `normalizeDirection()`, semantic resolution is skipped entirely and the pipeline proceeds directly to stage 5.

### 5. Relative Direction (Context-Dependent)
**Input:** `left`, `right`, `forward`, `back` (case-insensitive)

#### 5a. With Last Heading Context
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

### 6. Typo Tolerance (Edit Distance ≤1)
**Input:** String with a single character edit (substitution, insertion, or deletion) from a canonical direction  
**Examples:**
- `nort` → `north` (deletion)
- `sooth` → `south` (substitution)
- `norrth` → `north` (insertion)
- `dwn` → `down` (deletion)

**Algorithm:** Levenshtein edit distance calculation against all canonical directions

#### 6a. Single Match Found
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

#### 6b. Multiple Matches (Ambiguous Typo)
**Status:** `unknown`  
**Canonical:** `undefined`  
**Clarification:** Generic unknown message (see stage 7)

**Example:** Input `est` could match both `east` (edit distance 1) and `west` (edit distance 1)  
**Rationale:** When multiple directions match with the same edit distance, the system cannot determine user intent and treats it as unknown rather than guessing incorrectly.

#### 6c. No Match Within Tolerance
**Status:** `unknown`  
**Proceeds to stage 7**

### 7. Unknown Input (Fallback)
**Input:** Any string that doesn't match stages 1-6  
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
All input is converted to lowercase before processing. `NORTH`, `North`, and `north` are treated identically. This applies to semantic names, synonyms, and landmark aliases as well.

### Whitespace Trimming
Leading and trailing whitespace is trimmed. `"  north  "` becomes `"north"`.

### Composite/Unsupported Directions
Directions not in the canonical set (e.g., `north-northeast`, `ESE`) are treated as unknown. Future expansion may support 16-way compass, but currently only 8-way cardinal plus vertical and radial are recognized.

### Semantic Exit Name Conflicts
When both an exit name and a landmark alias match the same input, the exit name takes precedence (see stage 4c priority rules).

**Example:**
```typescript
// Location has both:
// - Exit: { direction: 'north', name: 'fountain' }
// - Landmark: { landmarkAliases: { 'fountain': 'south' } }
// Input 'fountain' resolves to 'north' (exit name wins)
```

### Semantic Name Collisions with Cardinal Shortcuts
If an exit has a semantic name that matches a cardinal shortcut (e.g., `name: 'n'`), the shortcut takes precedence because it is processed earlier in the pipeline (stage 3 before stage 4).

**Example:**
```typescript
// Exit: { direction: 'south', name: 'n' }
// Input 'n' resolves to 'north' (shortcut), not 'south' (semantic name)
```

## Implementation Reference

**Module:** `shared/src/direction/directionNormalizer.ts`  
**Function:** `normalizeDirection(input: string, lastHeading?: Direction, locationContext?: LocationExitContext): DirectionNormalizationResult`  
**Tests:** `shared/test/directionNormalizer.test.ts`, `shared/test/directionNormalizerSemantic.test.ts`

**Parameters:**
- `input` - Player's direction input string
- `lastHeading` - Optional previous direction (enables relative directions)
- `locationContext` - Optional exit and landmark data (enables semantic resolution)

**Return Type:**
```typescript
interface DirectionNormalizationResult {
  status: 'ok' | 'ambiguous' | 'unknown'
  canonical?: Direction
  clarification?: string
  ambiguityCount?: number  // Only present when status === 'ambiguous' and multiple semantic matches found
}
```

## Usage in Movement Logic

When a player attempts to move:

1. Retrieve location context (if semantic resolution is desired):
   ```typescript
   const locationContext: LocationExitContext = {
     exits: await getExitsFromLocation(currentLocationId),
     landmarkAliases: location.landmarkAliases
   }
   ```

2. Call `normalizeDirection(playerInput, lastHeading, locationContext)`

3. Check result status:
   - **`ok`** → Proceed with movement using `canonical` direction
   - **`ambiguous`** → Return 400 error with `clarification` message
     - If `ambiguityCount` is present, multiple semantic matches were found
     - Player should use more specific input (canonical direction, shortcut, or less ambiguous semantic name)
   - **`unknown`** → Return 400 error with `clarification` message listing valid directions

4. If status is `ok`, verify an EXIT edge exists in the graph with the canonical direction before updating player location.

## Telemetry Considerations

The following telemetry events are relevant to direction resolution:

- `Navigation.Input.Parsed` – Logs successful normalization (status `ok`)
  - Properties: `rawInput`, `canonical`, `method` (e.g., 'shortcut', 'semantic', 'typo-correction')
  
- `Navigation.Input.Ambiguous` – Logs ambiguous resolution requiring clarification
  - Properties: `rawInput`, `reason` (e.g., 'no-heading', 'multiple-semantic-matches'), `ambiguityCount` (N2 feature)

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

### Why Semantic Resolution After Shortcuts?
Shortcuts (stage 3) are processed before semantic names (stage 4) to maintain backwards compatibility and predictability. A player typing `n` always expects `north`, even if a location happens to have an exit named `n`. This prevents semantic names from overriding core navigation conventions.

### Why Exit Names Take Priority Over Landmarks?
When both an exit name and a landmark alias match the same input, the exit name wins because:
1. Exit names are more specific and contextual to the immediate choice
2. Landmarks are meant as convenient aliases, not primary navigation
3. If a landmark points toward an exit with the same name, the result is identical anyway

### Why Report ambiguityCount?
The `ambiguityCount` field enables telemetry analysis of semantic naming quality. High ambiguity counts indicate:
- Poor semantic name choices (too generic like "door" or "passage")
- Need for more distinctive synonyms
- Opportunity for content improvement (rename exits for clarity)

## Future Enhancements (Deferred)

- **Semantic disambiguation with direction prefix:** "north gate" vs "south gate" when multiple gates exist
- **16-way compass:** Add intercardinal refinements (NNE, ENE, etc.) for higher precision navigation
- **Natural language prefixes:** Strip "go", "walk", "head" automatically before processing
- **Context-aware synonym expansion:** Learn player's preferred vocabulary over time

See `navigation-and-traversal.md` for the full normalization roadmap.

## Related Documentation

-   [Exit Edge Invariants](./exits.md) – Exit creation/removal flow and invariants
-   [Navigation & Traversal](../modules/navigation-and-traversal.md) – Full normalization roadmap and movement semantics
-   [Direction Normalizer Usage](../developer-workflow/direction-normalizer-usage.md) – Practical usage guide
-   [Architecture Overview](./overview.md) – Implementation to design mapping
-   [Dungeons](./dungeons.md) – Dungeon-specific direction handling

---

_Last updated: 2025-10-31 – Updated with N2 semantic exit resolution (Issue #33)_
