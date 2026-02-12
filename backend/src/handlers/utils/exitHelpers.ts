/**
 * Utility functions for exit handling in handlers.
 *
 * Shared conversion logic to avoid duplication between move and look handlers.
 */
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
export function convertLocationExitsToExitInfo(exits: LocationExit[] | undefined): ExitInfo[] {
    // Convert exits array to map format for buildExitInfoArray
    const exitsMap: Partial<Record<Direction, string>> = {}
    if (exits) {
        for (const exit of exits) {
            if (exit.to) {
                exitsMap[exit.direction as Direction] = exit.to
            }
        }
    }

    // TODO(persistence): When Location.exitAvailability is wired from persistence layer,
    // pass it as the second parameter to buildExitInfoArray to include pending/forbidden states.
    // Tracking: Part of broader persistence integration for exit availability metadata.
    return buildExitInfoArray(exitsMap, undefined)
}
