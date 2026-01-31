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
 */
export function generateExitsSummary(exits: ExitEdge[]): string {
    if (!exits || exits.length === 0) {
        return 'No visible exits'
    }

    const availableExits = exits.filter((exit) => !exit.blocked)

    if (availableExits.length === 0) {
        return 'No visible exits'
    }

    const sortedExits = [...availableExits].sort((a, b) => {
        const indexA = DIRECTION_ORDER.indexOf(a.direction)
        const indexB = DIRECTION_ORDER.indexOf(b.direction)
        const orderA = indexA === -1 ? DIRECTION_ORDER.length : indexA
        const orderB = indexB === -1 ? DIRECTION_ORDER.length : indexB
        return orderA - orderB
    })

    const formattedExits = sortedExits.map((exit) => {
        if (exit.description && exit.description.trim().length > 0) {
            return `${exit.direction} (${exit.description})`
        }
        return exit.direction
    })

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
