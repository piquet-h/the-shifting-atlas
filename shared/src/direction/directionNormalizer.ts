import { Direction, isDirection } from '../domainModels.js'

/** Relative direction tokens that require lastHeading for resolution */
export type RelativeDirection = 'left' | 'right' | 'forward' | 'back'

/** Normalization result status */
export type NormalizationStatus = 'ok' | 'ambiguous' | 'unknown'

/** Direction normalization result */
export interface DirectionNormalizationResult {
    status: NormalizationStatus
    canonical?: Direction
    clarification?: string
}

/** Shortcut mappings for common direction abbreviations (Stage 1) */
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
 */
function findTypoMatch(input: string): Direction | undefined {
    const candidates: Direction[] = []

    // Check all canonical directions from domainModels
    const allCanonicalDirections: Direction[] = [
        'north',
        'south',
        'east',
        'west',
        'northeast',
        'northwest',
        'southeast',
        'southwest',
        'up',
        'down',
        'in',
        'out'
    ]

    for (const dir of allCanonicalDirections) {
        if (editDistance(input, dir) <= 1) {
            candidates.push(dir)
        }
    }

    // Return single match, or undefined if no match or ambiguous
    return candidates.length === 1 ? candidates[0] : undefined
}

/**
 * Resolve relative direction to canonical direction using lastHeading context..
 * Based on standard compass navigation where:
 * - Forward continues in the same direction
 * - Back reverses direction (180° turn)
 * - Left turns counter-clockwise (90° left)
 * - Right turns clockwise (90° right)
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
 * Handles canonical directions, shortcuts (n→north), typo tolerance (edit distance ≤1),
 * and relative directions (left/right/forward/back).
 *
 * Stage 1 features: shortcuts + typo tolerance
 * Future: semantic exits & disambiguation (deferred to #33)
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
