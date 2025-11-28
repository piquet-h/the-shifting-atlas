/**
 * Exit Hint Debounce Configuration
 *
 * Configurable settings for the exit generation hint debounce store.
 * Controls how long to suppress duplicate exit hints per (player/location/direction).
 */

const DEFAULT_EXIT_HINT_DEBOUNCE_MS = 60_000 // 60 seconds

function parseIntWithDefault(value: string | undefined, fallback: number): number {
    if (!value) {
        return fallback
    }
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * Debounce window in milliseconds for exit generation hints.
 * Configure via EXIT_HINT_DEBOUNCE_MS environment variable.
 * Default: 60000 (60 seconds)
 */
export const EXIT_HINT_DEBOUNCE_MS = parseIntWithDefault(process.env.EXIT_HINT_DEBOUNCE_MS, DEFAULT_EXIT_HINT_DEBOUNCE_MS)

/**
 * TTL in seconds for Cosmos SQL documents (slightly longer than debounce window for cleanup buffer).
 * Calculated as debounce window + 60 seconds buffer.
 */
export const EXIT_HINT_DEBOUNCE_TTL_SECONDS = Math.ceil(EXIT_HINT_DEBOUNCE_MS / 1000) + 60
