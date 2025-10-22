import { Direction, ExitEdge } from '../domainModels.js'

/**
 * Deterministic ordering for exits display.
 * Cardinal directions first (N→S→E→W), then intercardinals (NE→NW→SE→SW),
 * then vertical (U→D), then special (In→Out).
 */
const DIRECTION_ORDER: readonly Direction[] = [
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
] as const

/**
 * Generate a human-readable exits summary from an array of exit edges.
 * Produces deterministic, sorted output suitable for caching.
 *
 * @param exits - Array of ExitEdge objects representing available exits
 * @returns Formatted exits summary string
 *
 * @example
 * generateExitsSummary([
 *   { direction: 'north', fromLocationId: '1', toLocationId: '2', description: 'archway' },
 *   { direction: 'east', fromLocationId: '1', toLocationId: '3' }
 * ])
 * // Returns: "Exits: north (archway), east"
 *
 * @example
 * generateExitsSummary([])
 * // Returns: "No visible exits"
 */
export function generateExitsSummary(exits: ExitEdge[]): string {
    if (!exits || exits.length === 0) {
        return 'No visible exits'
    }

    // Filter out blocked exits
    const availableExits = exits.filter((exit) => !exit.blocked)

    if (availableExits.length === 0) {
        return 'No visible exits'
    }

    // Sort exits by the deterministic direction order
    const sortedExits = [...availableExits].sort((a, b) => {
        const indexA = DIRECTION_ORDER.indexOf(a.direction)
        const indexB = DIRECTION_ORDER.indexOf(b.direction)
        // If direction not found in order, push to end
        const orderA = indexA === -1 ? DIRECTION_ORDER.length : indexA
        const orderB = indexB === -1 ? DIRECTION_ORDER.length : indexB
        return orderA - orderB
    })

    // Format each exit with optional description (only non-empty descriptions)
    const formattedExits = sortedExits.map((exit) => {
        if (exit.description && exit.description.trim().length > 0) {
            return `${exit.direction} (${exit.description})`
        }
        return exit.direction
    })

    // Construct final summary with proper grammar
    const prefix = availableExits.length === 1 ? 'Exit' : 'Exits'
    return `${prefix}: ${formattedExits.join(', ')}`
}

/**
 * Determine if two exit arrays would produce the same summary.
 * Useful for cache invalidation logic.
 *
 * @param exits1 - First array of exits
 * @param exits2 - Second array of exits
 * @returns true if summaries would match, false otherwise
 */
export function exitsSummaryEquals(exits1: ExitEdge[], exits2: ExitEdge[]): boolean {
    return generateExitsSummary(exits1) === generateExitsSummary(exits2)
}
