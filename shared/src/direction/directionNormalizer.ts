import { Direction, DIRECTIONS, isDirection } from '../domainModels.js'

/**
 * Direction Normalizer (N1)
 *
 * PURPOSE: Provide fault-tolerant resolution of player input strings to canonical Direction values.
 *
 * FEATURES (N1 - Current):
 * - Exact match: case-insensitive canonical direction recognition
 * - Shortcuts: single/double letter abbreviations (n→north, ne→northeast)
 * - Typo tolerance: edit distance ≤1 from canonical (nrth→north)
 * - Relative directions: left/right/forward/back (requires player heading)
 *
 * FUTURE EXTENSIONS:
 * - N2 (#33): Semantic exit names (e.g., "wooden door" → resolves to direction)
 * - N3 (#256): Enhanced relative direction support with persistent heading state
 *
 * DESIGN PRINCIPLES:
 * - Never throw exceptions (all failures return structured { status: 'unknown' })
 * - Deterministic (same input always produces same output for given heading)
 * - Fast (<1ms for all cases; in-memory only)
 * - Extensible (new stages can be added without breaking existing logic)
 *
 * See: docs/architecture/direction-resolution-rules.md for detailed algorithm
 * See: docs/developer-workflow/direction-normalizer-usage.md for integration patterns
 */

/** Relative direction tokens that require lastHeading for resolution */
export type RelativeDirection = 'left' | 'right' | 'forward' | 'back'

/** Normalization result status */
export type NormalizationStatus = 'ok' | 'ambiguous' | 'unknown'

/** Direction normalization result */
export interface DirectionNormalizationResult {
    /** Resolution outcome: ok (success), ambiguous (needs clarification), unknown (no match) */
    status: NormalizationStatus
    /** Canonical direction (only present when status === 'ok') */
    canonical?: Direction
    /** Human-readable explanation (always present for ambiguous/unknown; optional for ok) */
    clarification?: string
}

/**
 * Shortcut mappings for common direction abbreviations (Stage 1)
 *
 * DESIGN DECISION: Limit to unambiguous single/double letter shortcuts.
 * Rationale: Prevents conflict with future semantic exit names (e.g., "inn" should not auto-expand to "in").
 *
 * Supported shortcuts:
 * - Single letter: n, s, e, w (cardinal)
 * - Single letter: u, d (vertical)
 * - Single letter: i, o (radial) — NOTE: 'o' for 'out' is non-standard but unambiguous
 * - Double letter: ne, nw, se, sw (diagonal)
 *
 * NOT supported (to avoid conflicts):
 * - Multi-char abbreviations (no "nor", "sou", "eas", "wes")
 * - Typo-like shortcuts (no "nw" → "now", which could be a typo for "north")
 */
const DIRECTION_SHORTCUTS: Record<string, Direction> = {
    n: 'north',
    s: 'south',
    e: 'east',
    w: 'west',
    ne: 'northeast',
    nw: 'northwest',
    se: 'southeast',
    sw: 'southwest',
    u: 'up',
    d: 'down',
    i: 'in',
    o: 'out'
}

/** Check if input is a relative direction */
export function isRelativeDirection(value: string): value is RelativeDirection {
    return ['left', 'right', 'forward', 'back'].includes(value.toLowerCase())
}

/**
 * Calculate Levenshtein edit distance between two strings.
 * Used for typo tolerance (Stage 1: edit distance ≤1).
 *
 * ALGORITHM: Dynamic programming matrix approach.
 * TIME COMPLEXITY: O(n*m) where n,m are string lengths.
 * SPACE COMPLEXITY: O(n*m) for matrix storage.
 *
 * TUNING PARAMETER: Edit distance threshold set to 1.
 * Rationale: Balance between helpful correction ("nrth"→"north") and false positives.
 * Future: Consider making threshold configurable or using phonetic matching (Soundex).
 *
 * EXAMPLES:
 * - editDistance("north", "nrth") = 1 (deletion)
 * - editDistance("east", "esst") = 1 (substitution)
 * - editDistance("west", "wset") = 1 (transposition counts as 2 operations, but Levenshtein treats as sub+sub=2)
 */
function editDistance(a: string, b: string): number {
    if (a.length === 0) return b.length
    if (b.length === 0) return a.length

    const matrix: number[][] = []

    // Initialize first column
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i]
    }

    // Initialize first row
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j
    }

    // Fill in the rest of the matrix
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1]
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1, // insertion
                    matrix[i - 1][j] + 1 // deletion
                )
            }
        }
    }

    return matrix[b.length][a.length]
}

/**
 * Find canonical direction matching input with typo tolerance (edit distance ≤1).
 * Returns undefined if no match or multiple ambiguous matches found.
 *
 * AMBIGUITY HANDLING: If multiple directions have edit distance ≤1, return undefined.
 * Rationale: Prefer "unknown" over guessing incorrectly (e.g., "wst" could be "west" or "east").
 *
 * PERFORMANCE: Checks all 12 canonical directions; O(12 * O(editDistance)) ≈ constant for short strings.
 *
 * EXTENSION POINT (N2): When semantic exits are added, this function should:
 * 1. Check canonical directions first (current behavior)
 * 2. Check semantic exit names second (if location context provided)
 * 3. Return ambiguous if matches found in both sets
 */
function findTypoMatch(input: string): Direction | undefined {
    const candidates: Direction[] = []

    // Check all canonical directions from domainModels.DIRECTIONS
    for (const dir of DIRECTIONS) {
        if (editDistance(input, dir) <= 1) {
            candidates.push(dir)
        }
    }

    // Return single match, or undefined if no match or ambiguous
    return candidates.length === 1 ? candidates[0] : undefined
}

/**
 * Resolve relative direction to canonical direction using lastHeading context.
 * Based on standard compass navigation where:
 * - Forward continues in the same direction
 * - Back reverses direction (180° turn)
 * - Left turns counter-clockwise (90° left)
 * - Right turns clockwise (90° right)
 *
 * COORDINATE SYSTEM: Standard compass (north=up, east=right in 2D map view).
 *
 * DIAGONAL HANDLING: Diagonals follow 45° intervals (northeast left→northwest, right→southeast).
 *
 * VERTICAL/RADIAL AMBIGUITY: For up/down/in/out, left/right are meaningless (return same direction).
 * Rationale: Vertical/radial directions have no inherent left/right orientation.
 * Future (N3): Consider rejecting left/right for these directions entirely.
 *
 * CALLER RESPONSIBILITY: Ensure lastHeading is a valid Direction (use isDirection() check).
 * This function assumes lastHeading is well-formed.
 *
 * FUTURE ENHANCEMENT (N3): Persist heading in player state for session continuity.
 * Current limitation: Heading resets on page refresh or logout.
 */
export function resolveRelativeDirection(relativeDir: RelativeDirection, lastHeading: Direction): Direction | undefined {
    const directionMap: Record<Direction, Record<RelativeDirection, Direction>> = {
        north: { forward: 'north', back: 'south', left: 'west', right: 'east' },
        south: { forward: 'south', back: 'north', left: 'east', right: 'west' },
        east: { forward: 'east', back: 'west', left: 'north', right: 'south' },
        west: { forward: 'west', back: 'east', left: 'south', right: 'north' },
        northeast: { forward: 'northeast', back: 'southwest', left: 'northwest', right: 'southeast' },
        northwest: { forward: 'northwest', back: 'southeast', left: 'southwest', right: 'northeast' },
        southeast: { forward: 'southeast', back: 'northwest', left: 'northeast', right: 'southwest' },
        southwest: { forward: 'southwest', back: 'northeast', left: 'southeast', right: 'northwest' },
        up: { forward: 'up', back: 'down', left: 'up', right: 'up' }, // vertical ambiguity
        down: { forward: 'down', back: 'up', left: 'down', right: 'down' }, // vertical ambiguity
        in: { forward: 'in', back: 'out', left: 'in', right: 'in' }, // portal ambiguity
        out: { forward: 'out', back: 'in', left: 'out', right: 'out' } // portal ambiguity
    }

    return directionMap[lastHeading]?.[relativeDir]
}

/**
 * Normalize direction input using optional lastHeading context.
 *
 * RESOLUTION PIPELINE (executed in order):
 * 1. Exact match: input matches canonical direction (case-insensitive)
 * 2. Shortcut expansion: input is a known abbreviation (n→north, ne→northeast)
 * 3. Relative resolution: input is left/right/forward/back (requires lastHeading)
 * 4. Typo tolerance: input within edit distance 1 of canonical direction
 * 5. Fallback: return { status: 'unknown' } if no match
 *
 * STAGES IMPLEMENTED:
 * - N1 (Current): shortcuts + typo tolerance + relative directions
 *
 * STAGES PLANNED:
 * - N2 (#33): Semantic exit names (e.g., "wooden door" resolves to direction via location context)
 * - N3 (#256): Enhanced relative support with persistent heading state + turn commands
 *
 * PARAMETERS:
 * @param input - Raw player input string (case-insensitive, whitespace trimmed automatically)
 * @param lastHeading - Optional previous direction traveled (enables left/right/forward/back)
 *
 * RETURNS:
 * - { status: 'ok', canonical: Direction } — Successfully resolved
 * - { status: 'ambiguous', clarification: string } — Multiple matches or missing heading
 * - { status: 'unknown', clarification: string } — No match found
 *
 * TELEMETRY: Caller should emit Navigation.Input.Parsed event with:
 * - rawInput, status, direction (if ok), candidates (if ambiguous)
 *
 * EXAMPLES:
 * - normalizeDirection("NORTH") → { status: 'ok', canonical: 'north' }
 * - normalizeDirection("ne") → { status: 'ok', canonical: 'northeast' }
 * - normalizeDirection("nrth") → { status: 'ok', canonical: 'north', clarification: "Interpreted..." }
 * - normalizeDirection("left") → { status: 'ambiguous', clarification: "Requires heading" }
 * - normalizeDirection("left", "north") → { status: 'ok', canonical: 'west' }
 * - normalizeDirection("xyz") → { status: 'unknown', clarification: "Not recognized..." }
 */
export function normalizeDirection(input: string, lastHeading?: Direction): DirectionNormalizationResult {
    const trimmed = input.toLowerCase().trim()

    // Empty input
    if (!trimmed) {
        return {
            status: 'unknown',
            clarification: 'Direction cannot be empty. Try: north, south, east, west, up, down, in, out.'
        }
    }

    // 1. Check if already a canonical direction
    if (isDirection(trimmed)) {
        return { status: 'ok', canonical: trimmed }
    }

    // 2. Check shortcuts (n → north, ne → northeast, etc.)
    if (trimmed in DIRECTION_SHORTCUTS) {
        return { status: 'ok', canonical: DIRECTION_SHORTCUTS[trimmed] }
    }

    // 3. Check relative directions (left/right/forward/back)
    if (isRelativeDirection(trimmed)) {
        if (!lastHeading) {
            return {
                status: 'ambiguous',
                clarification: `Relative direction "${trimmed}" requires a previous move to establish heading. Try a specific direction like "north" or "south".`
            }
        }

        const resolved = resolveRelativeDirection(trimmed, lastHeading)
        if (resolved) {
            return { status: 'ok', canonical: resolved }
        } else {
            return {
                status: 'unknown',
                clarification: `Cannot resolve "${trimmed}" from heading "${lastHeading}".`
            }
        }
    }

    // 4. Try typo tolerance (edit distance ≤1)
    const typoMatch = findTypoMatch(trimmed)
    if (typoMatch) {
        return {
            status: 'ok',
            canonical: typoMatch,
            clarification: `Interpreted "${input}" as "${typoMatch}".`
        }
    }

    // 5. Unknown
    return {
        status: 'unknown',
        clarification: `"${input}" is not a recognized direction. Try: north, south, east, west, up, down, in, out, or shortcuts like n, s, e, w.`
    }
}
