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

/** Check if input is a relative direction */
export function isRelativeDirection(value: string): value is RelativeDirection {
    return ['left', 'right', 'forward', 'back'].includes(value.toLowerCase())
}

/**
 * Resolve relative direction to canonical direction using lastHeading context.
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
 * Handles both canonical directions and relative directions.
 */
export function normalizeDirection(input: string, lastHeading?: Direction): DirectionNormalizationResult {
    const trimmed = input.toLowerCase().trim()

    // Handle canonical directions directly
    if (isDirection(trimmed)) {
        return { status: 'ok', canonical: trimmed }
    }

    // Handle relative directions
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

    // Unknown input
    return {
        status: 'unknown',
        clarification: `"${input}" is not a recognized direction. Try: north, south, east, west, up, down, in, out, or relative directions like left, right, forward, back.`
    }
}
