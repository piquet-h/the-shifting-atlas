import { Direction, DIRECTIONS, isDirection } from '../domainModels.js'

/**
 * Direction Normalizer (N1 + N2)
 *
 * PURPOSE: Provide fault-tolerant resolution of player input strings to canonical Direction values.
 *
 * FEATURES:
 * - N1 (Current): Exact match, shortcuts, typo tolerance, relative directions
 * - N2 (Issue #33): Semantic exit names, synonyms, landmark aliases
 *
 * FUTURE EXTENSIONS:
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

/**
 * Location-specific exit context for semantic resolution (N2) and generation hints (N4).
 * This data enables the normalizer to resolve semantic exit names, landmark aliases,
 * and determine when exit generation hints should be emitted.
 */
export interface LocationExitContext {
    /** Location ID for generation hint context */
    locationId: string
    /** List of exits with optional semantic names and synonyms */
    exits: Array<{
        direction: Direction
        name?: string
        synonyms?: string[]
    }>
    /** Landmark alias mapping: landmark name (lowercase) -> canonical direction */
    landmarkAliases?: Record<string, Direction>
}

/** Relative direction tokens that require lastHeading for resolution */
export type RelativeDirection = 'left' | 'right' | 'forward' | 'back'

/**
 * Normalization result status
 *
 * - 'ok': Direction resolved successfully and exit exists (or no context provided)
 * - 'generate': Direction is valid but no exit exists at this location (N4)
 * - 'ambiguous': Multiple matches or relative direction without heading
 * - 'unknown': Direction not recognized
 */
export type NormalizationStatus = 'ok' | 'generate' | 'ambiguous' | 'unknown'

/**
 * Generation hint payload for exit generation events (N4 - Issue #35).
 * Included when status is 'generate' to provide context for AI expansion.
 */
export interface GenerationHintPayload {
    /** Origin location ID where the exit is requested */
    originLocationId: string
    /** Canonical direction for the requested exit */
    direction: Direction
}

/** Direction normalization result */
export interface DirectionNormalizationResult {
    /**
     * Resolution outcome:
     * - ok: success (exit exists or no context provided)
     * - generate: valid direction but no exit (emit generation hint)
     * - ambiguous: needs clarification
     * - unknown: no match
     */
    status: NormalizationStatus
    /** Canonical direction (present when status is 'ok' or 'generate') */
    canonical?: Direction
    /** Human-readable explanation (always present for ambiguous/unknown; optional for ok/generate) */
    clarification?: string
    /** Number of semantic matches found (N2 telemetry) - only present when > 1 */
    ambiguityCount?: number
    /** Generation hint for AI expansion (only present when status is 'generate') */
    generationHint?: GenerationHintPayload
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
 * Resolve semantic exit name or landmark alias to canonical direction(s).
 * Returns array of matching directions (empty if no match).
 *
 * STAGE N2: Semantic resolution
 * - Check exit names (exact match, case-insensitive)
 * - Check exit synonyms (exact match, case-insensitive)
 * - Check landmark aliases (exact match, case-insensitive)
 *
 * AMBIGUITY HANDLING:
 * - Multiple matches → return all candidates (caller handles ambiguity)
 * - No matches → return empty array
 *
 * PRIORITY: Exit names/synonyms are checked before landmark aliases to avoid confusion
 * when an exit might have the same name as a landmark.
 */
function resolveSemanticExit(input: string, context?: LocationExitContext): Direction[] {
    if (!context) {
        return []
    }

    const lowerInput = input.toLowerCase()
    const matches: Direction[] = []

    // Check exit names and synonyms
    for (const exit of context.exits) {
        // Check exit name
        if (exit.name && exit.name.toLowerCase() === lowerInput) {
            matches.push(exit.direction)
        }
        // Check synonyms
        if (exit.synonyms) {
            for (const synonym of exit.synonyms) {
                if (synonym.toLowerCase() === lowerInput) {
                    matches.push(exit.direction)
                    break // Only count this exit once
                }
            }
        }
    }

    // Check landmark aliases (only if no exit matches)
    // PRIORITY RATIONALE: Exit names/synonyms are more specific and contextual to the immediate
    // navigation choice, while landmarks are meant as convenient aliases. If both match, the
    // exit is the primary entity and takes precedence. This also handles the case where an exit
    // might have the same name as a landmark pointing toward it (result would be identical).
    if (matches.length === 0 && context.landmarkAliases) {
        // Normalize all landmark alias keys to lowercase for comparison
        const normalizedAliases: Record<string, Direction> = {}
        for (const [key, value] of Object.entries(context.landmarkAliases)) {
            normalizedAliases[key.toLowerCase()] = value
        }

        const landmarkDir = normalizedAliases[lowerInput]
        if (landmarkDir) {
            matches.push(landmarkDir)
        }
    }

    return matches
}

/**
 * Check if an exit exists for the given direction in the location context.
 * Returns true if no context is provided (backward compatible behavior).
 */
function exitExistsForDirection(direction: Direction, locationContext?: LocationExitContext): boolean {
    if (!locationContext) {
        return true // No context means we can't check, assume exists
    }
    return locationContext.exits.some((exit) => exit.direction === direction)
}

/**
 * Build a resolved direction result, checking for exit existence (N4).
 *
 * If locationContext is provided and no exit exists for the direction,
 * returns status 'generate' with a generationHint payload instead of 'ok'.
 */
function buildResolvedResult(
    direction: Direction,
    locationContext?: LocationExitContext,
    clarification?: string
): DirectionNormalizationResult {
    if (exitExistsForDirection(direction, locationContext)) {
        // Exit exists or no context - return 'ok'
        const result: DirectionNormalizationResult = {
            status: 'ok',
            canonical: direction
        }
        if (clarification) {
            result.clarification = clarification
        }
        return result
    }

    // Exit doesn't exist - return generate status
    return {
        status: 'generate',
        canonical: direction,
        clarification: clarification ?? `No exit exists to the ${direction}. This direction may be available for world expansion.`,
        generationHint: {
            originLocationId: locationContext!.locationId,
            direction
        }
    }
}

/**
 * Normalize direction input using optional lastHeading and locationContext.
 *
 * RESOLUTION PIPELINE (executed in order):
 * 1. Exact match: input matches canonical direction (case-insensitive)
 * 2. Shortcut expansion: input is a known abbreviation (n→north, ne→northeast)
 * 3. Semantic resolution (N2): input matches exit name, synonym, or landmark alias
 * 4. Relative resolution: input is left/right/forward/back (requires lastHeading)
 * 5. Typo tolerance: input within edit distance 1 of canonical direction
 * 6. Fallback: return { status: 'unknown' } if no match
 *
 * EXIT EXISTENCE CHECK (N4 - Issue #35):
 * When locationContext is provided, resolved directions are checked against available exits.
 * If no exit exists, status 'generate' is returned with a generationHint payload.
 *
 * STAGES IMPLEMENTED:
 * - N1: shortcuts + typo tolerance + relative directions
 * - N2 (Issue #33): Semantic exit names + synonyms + landmark aliases
 * - N4 (Issue #35): Exit generation fallback with generationHint
 *
 * STAGES PLANNED:
 * - N3 (#256): Enhanced relative support with persistent heading state + turn commands
 *
 * PARAMETERS:
 * @param input - Raw player input string (case-insensitive, whitespace trimmed automatically)
 * @param lastHeading - Optional previous direction traveled (enables left/right/forward/back)
 * @param locationContext - Optional location-specific exit context (enables semantic resolution and N4 generation hints)
 *
 * RETURNS:
 * - { status: 'ok', canonical: Direction } — Successfully resolved and exit exists
 * - { status: 'generate', canonical: Direction, generationHint } — Valid direction but no exit (N4)
 * - { status: 'ambiguous', clarification: string, ambiguityCount: number } — Multiple semantic matches
 * - { status: 'unknown', clarification: string } — No match found
 *
 * TELEMETRY: Caller should emit Navigation.Input.Parsed event with:
 * - rawInput, status, direction (if ok), ambiguityCount (if ambiguous)
 *
 * EXAMPLES:
 * - normalizeDirection("NORTH") → { status: 'ok', canonical: 'north' }
 * - normalizeDirection("ne") → { status: 'ok', canonical: 'northeast' }
 * - normalizeDirection("wooden_door", undefined, context) → { status: 'ok', canonical: 'north' }
 * - normalizeDirection("door", undefined, context) → { status: 'ambiguous', ambiguityCount: 2 } (if 2 doors)
 * - normalizeDirection("fountain", undefined, context) → { status: 'ok', canonical: 'south' } (landmark)
 * - normalizeDirection("left") → { status: 'ambiguous', clarification: "Requires heading" }
 * - normalizeDirection("left", "north") → { status: 'ok', canonical: 'west' }
 * - normalizeDirection("xyz") → { status: 'unknown', clarification: "Not recognized..." }
 */
export function normalizeDirection(
    input: string,
    lastHeading?: Direction,
    locationContext?: LocationExitContext
): DirectionNormalizationResult {
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
        return buildResolvedResult(trimmed, locationContext)
    }

    // 2. Check shortcuts (n → north, ne → northeast, etc.)
    if (trimmed in DIRECTION_SHORTCUTS) {
        return buildResolvedResult(DIRECTION_SHORTCUTS[trimmed], locationContext)
    }

    // 3. Check semantic exits (N2: names, synonyms, landmark aliases)
    // Note: Semantic matches are from existing exits, so they always return 'ok'
    const semanticMatches = resolveSemanticExit(trimmed, locationContext)
    if (semanticMatches.length === 1) {
        // Unambiguous semantic match - exit already exists
        return { status: 'ok', canonical: semanticMatches[0] }
    } else if (semanticMatches.length > 1) {
        // Ambiguous semantic match
        const directions = semanticMatches.join(', ')
        return {
            status: 'ambiguous',
            clarification: `"${input}" matches multiple exits: ${directions}. Please specify which direction.`,
            ambiguityCount: semanticMatches.length
        }
    }

    // 4. Check relative directions (left/right/forward/back)
    if (isRelativeDirection(trimmed)) {
        if (!lastHeading) {
            return {
                status: 'ambiguous',
                clarification: `Relative direction "${trimmed}" requires a previous move to establish heading. Try a specific direction like "north" or "south".`
            }
        }

        const resolved = resolveRelativeDirection(trimmed, lastHeading)
        if (resolved) {
            return buildResolvedResult(resolved, locationContext)
        } else {
            return {
                status: 'unknown',
                clarification: `Cannot resolve "${trimmed}" from heading "${lastHeading}".`
            }
        }
    }

    // 5. Try typo tolerance (edit distance ≤1)
    const typoMatch = findTypoMatch(trimmed)
    if (typoMatch) {
        return buildResolvedResult(typoMatch, locationContext, `Interpreted "${input}" as "${typoMatch}".`)
    }

    // 6. Unknown
    return {
        status: 'unknown',
        clarification: `"${input}" is not a recognized direction. Try: north, south, east, west, up, down, in, out, or shortcuts like n, s, e, w.`
    }
}
