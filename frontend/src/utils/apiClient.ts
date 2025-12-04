/**
 * API client utilities – shared helpers for calling backend endpoints.
 * - Validates player GUID format.
 * - Provides typed request helpers for common backend operations.
 */
import type { MoveRequest } from '@piquet-h/shared'

/**
 * Validates a string is a valid GUID format
 */
export function isValidGuid(guid: string | null | undefined): guid is string {
    if (!guid) return false
    return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(guid)
}

/**
 * Build URL for GET /api/player/{playerId}
 * @throws Error if playerId is not a valid GUID
 */
export function buildPlayerUrl(playerId: string | null): string {
    if (!isValidGuid(playerId)) {
        throw new Error('Player ID must be a valid GUID')
    }
    return `/api/player/${playerId}`
}

/**
 * Build URL for GET /api/location/{locationId}
 * @throws Error if locationId is not a valid GUID
 */
export function buildLocationUrl(locationId: string | null | undefined): string {
    if (!locationId) {
        return '/api/location'
    }
    if (!isValidGuid(locationId)) {
        throw new Error('Location ID must be a valid GUID')
    }
    return `/api/location/${locationId}`
}

/**
 * Build URL and body for move command
 * POST /api/player/{playerId}/move with body { direction }
 * Server reads player's current location from database (authoritative)
 * @throws Error if playerId is not a valid GUID
 */
export function buildMoveRequest(playerId: string | null, direction: string): { url: string; method: string; body: MoveRequest } {
    if (!isValidGuid(playerId)) {
        throw new Error('Player ID must be a valid GUID')
    }
    return {
        url: `/api/player/${playerId}/move`,
        method: 'POST',
        body: { direction }
    }
}

/**
 * Build headers for API requests
 */
export function buildHeaders(additionalHeaders?: Record<string, string>): HeadersInit {
    return {
        ...additionalHeaders
    }
}
