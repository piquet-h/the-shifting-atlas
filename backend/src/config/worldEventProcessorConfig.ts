const DEFAULT_PROCESSED_EVENTS_TTL_SECONDS = 604800 // 7 days
const DEFAULT_DUPLICATE_TTL_MS = 600_000 // 10 minutes
const DEFAULT_CACHE_MAX_SIZE = 10_000

function parseIntWithDefault(value: string | undefined, fallback: number): number {
    if (!value) {
        return fallback
    }
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : fallback
}

export const WORLD_EVENT_PROCESSED_EVENTS_TTL_SECONDS = parseIntWithDefault(
    process.env.PROCESSED_EVENTS_TTL_SECONDS,
    DEFAULT_PROCESSED_EVENTS_TTL_SECONDS
)

export const WORLD_EVENT_DUPLICATE_TTL_MS = parseIntWithDefault(process.env.WORLD_EVENT_DUPE_TTL_MS, DEFAULT_DUPLICATE_TTL_MS)

export const WORLD_EVENT_CACHE_MAX_SIZE = parseIntWithDefault(process.env.WORLD_EVENT_CACHE_MAX_SIZE, DEFAULT_CACHE_MAX_SIZE)
