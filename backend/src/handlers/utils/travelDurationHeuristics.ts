import type { Direction } from '@piquet-h/shared'

/**
 * Default travel duration in milliseconds for most exit directions.
 * Matches the ActionRegistry 'move' base duration (1 minute).
 */
export const DEFAULT_TRAVEL_DURATION_MS = 60_000

/**
 * Short travel duration in milliseconds for interior transitions (in/out).
 * These represent crossing a threshold rather than traversing distance.
 */
export const INTERIOR_TRAVEL_DURATION_MS = 10_000

/**
 * Travel duration for ascending vertical moves (up).
 * Climbing is slower than a flat traverse – e.g. scaling a cliff face.
 */
export const ASCENT_TRAVEL_DURATION_MS = 120_000

/**
 * Travel duration for descending vertical moves (down).
 * Descending is faster than ascending – e.g. sliding or stepping down.
 */
export const DESCENT_TRAVEL_DURATION_MS = 30_000

/**
 * Returns a deterministic default travel duration in milliseconds for a given direction.
 *
 * Used when travelDurationMs is not explicitly provided by generation or seed context.
 * Ensures all newly materialised exit edges carry a positive duration for downstream
 * UX (maps, proximity, narration pacing) without breaking backward compatibility on
 * edges that were created before this heuristic was introduced.
 *
 * Policy:
 * - `in` / `out` – short interior transitions (stepping through a doorway)
 * - `up`         – slower ascent (climbing)
 * - `down`       – faster descent (sliding or stepping down)
 * - all other directions (cardinal, diagonal) – standard step duration
 */
export function defaultTravelDurationForDirection(direction: Direction): number {
    switch (direction) {
        case 'in':
        case 'out':
            return INTERIOR_TRAVEL_DURATION_MS
        case 'up':
            return ASCENT_TRAVEL_DURATION_MS
        case 'down':
            return DESCENT_TRAVEL_DURATION_MS
        default:
            return DEFAULT_TRAVEL_DURATION_MS
    }
}
