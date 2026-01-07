/**
 * Prompt Template Cache Config
 *
 * Controls cache headers and in-memory template repository TTL.
 *
 * Environment variables:
 * - PROMPT_TEMPLATE_CACHE_TTL_SECONDS: number of seconds for cache TTL (default 300)
 *   - set to 0 to disable caching headers + repository caching.
 */

export interface PromptTemplateCacheConfig {
    /** TTL in milliseconds for in-memory repository caching. */
    ttlMs: number
    /** TTL in seconds for Cache-Control max-age. */
    maxAgeSeconds: number
    /** Whether caching is enabled (ttl > 0). */
    enabled: boolean
}

const DEFAULT_TTL_SECONDS = 5 * 60

function parseNonNegativeInt(value: string | undefined): number | null {
    if (value === undefined) return null
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number.parseInt(trimmed, 10)
    if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed < 0) return null
    return parsed
}

export function getPromptTemplateCacheConfig(): PromptTemplateCacheConfig {
    const ttlSeconds = parseNonNegativeInt(process.env.PROMPT_TEMPLATE_CACHE_TTL_SECONDS) ?? DEFAULT_TTL_SECONDS

    const enabled = ttlSeconds > 0
    return {
        enabled,
        maxAgeSeconds: enabled ? ttlSeconds : 0,
        ttlMs: enabled ? ttlSeconds * 1000 : 0
    }
}
