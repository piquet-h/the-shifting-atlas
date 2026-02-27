/**
 * Utility functions for exit handling in handlers.
 *
 * Shared conversion logic to avoid duplication between move and look handlers.
 */
import type { ExitAvailabilityMetadata } from '@piquet-h/shared'
import { buildExitInfoArray, type Direction, type ExitInfo, type LocationExit } from '@piquet-h/shared'

/**
 * Convert Location exits array to ExitInfo array.
 *
 * Location interface uses array format: LocationExit[]
 * ExitInfo requires map format: Partial<Record<Direction, string>>
 *
 * This helper performs the conversion and calls buildExitInfoArray.
 *
 * @param exits - Location exits array
 * @returns ExitInfo array with availability states
 */
export function convertLocationExitsToExitInfo(exits: LocationExit[] | undefined, exitAvailability?: ExitAvailabilityMetadata): ExitInfo[] {
    // Convert exits array to map format for buildExitInfoArray
    const exitsMap: Partial<Record<Direction, string>> = {}
    if (exits) {
        for (const exit of exits) {
            if (exit.to) {
                exitsMap[exit.direction as Direction] = exit.to
            }
        }
    }

    // Prefer not to surface forbidden exits by default; those are typically narrated only
    // when the player attempts the move (reveal=onTryMove). Pending exits are safe to show.
    const safeMetadata: ExitAvailabilityMetadata | undefined = exitAvailability
        ? {
              pending: exitAvailability.pending
          }
        : undefined

    return buildExitInfoArray(exitsMap, safeMetadata)
}
