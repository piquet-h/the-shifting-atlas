/**
 * API Client utilities for constructing RESTful URLs and making API calls
 * Supports feature flag for gradual rollout of RESTful patterns
 */

/**
 * Feature flag for RESTful URL patterns
 * Set via environment variable or default to true (new pattern)
 */
const USE_RESTFUL_URLS = import.meta.env.VITE_USE_RESTFUL_URLS !== 'false'

/**
 * Validates a string is a valid GUID format
 */
export function isValidGuid(guid: string | null | undefined): guid is string {
    if (!guid) return false
    return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(guid)
}

/**
 * Build URL for GET /api/player or /api/player/{playerId}
 */
export function buildPlayerUrl(playerId: string | null): string {
    if (USE_RESTFUL_URLS && isValidGuid(playerId)) {
        return `/api/player/${playerId}`
    }
    return '/api/player'
}

/**
 * Build URL for GET /api/location or /api/location/{locationId}
 */
export function buildLocationUrl(locationId: string | null | undefined): string {
    if (USE_RESTFUL_URLS && isValidGuid(locationId)) {
        return `/api/location/${locationId}`
    }
    // Legacy query string pattern
    return locationId ? `/api/location?id=${encodeURIComponent(locationId)}` : '/api/location'
}

/**
 * Build URL and body for move command
 * RESTful: POST /api/player/{playerId}/move with body { direction, fromLocationId }
 * Legacy: GET /api/player/move?dir={dir}&from={from}
 */
export function buildMoveRequest(
    playerId: string | null,
    direction: string,
    fromLocationId?: string
): { url: string; method: string; body?: Record<string, unknown> } {
    if (USE_RESTFUL_URLS && isValidGuid(playerId)) {
        return {
            url: `/api/player/${playerId}/move`,
            method: 'POST',
            body: {
                direction,
                ...(fromLocationId ? { fromLocationId } : {})
            }
        }
    }

    // Legacy query string pattern
    const fromParam = fromLocationId ? `&from=${encodeURIComponent(fromLocationId)}` : ''
    return {
        url: `/api/player/move?dir=${encodeURIComponent(direction)}${fromParam}`,
        method: 'GET'
    }
}

/**
 * Build headers including x-player-guid for backward compatibility
 */
export function buildHeaders(playerId: string | null, additionalHeaders?: Record<string, string>): HeadersInit {
    const headers: Record<string, string> = {
        ...additionalHeaders
    }

    if (playerId) {
        headers['x-player-guid'] = playerId
    }

    return headers
}
