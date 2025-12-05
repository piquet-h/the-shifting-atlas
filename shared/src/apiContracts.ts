/**
 * API payload types. Backend responses use ApiEnvelope; these define the `data` shapes.
 */
// Requests

/** POST /api/player/link - Request body */
export interface PlayerLinkRequest {
    playerGuid: string
}

/** POST /api/player/{playerId}/move - Request body */
export interface MoveRequest {
    direction: string
    // fromLocationId removed - server reads player.currentLocationId from database (authoritative)
}

/** POST /api/ping - Request body */
export interface PingRequest {
    message?: string
}
// Responses

/** GET /api/player or GET /api/player/{playerId} - Bootstrap/retrieve player session */
export interface PlayerBootstrapResponse {
    playerGuid: string
    created: boolean
    currentLocationId: string
    name?: string
    latencyMs?: number
}

/** POST /api/player/link - Link guest player to authenticated account */
export interface PlayerLinkResponse {
    playerGuid: string
    message: string
    latencyMs?: number
}

/** GET /api/player/{playerId} - Player details */
export interface PlayerGetResponse {
    id: string
    guest: boolean
    externalId?: string
}

/** Location data returned by look/move endpoints */
export interface LocationResponse {
    id: string
    name: string
    description: string
    exits?: Array<{ direction: string; description?: string }>
    latencyMs?: number
    metadata?: {
        exitsSummaryCache?: string
        tags?: string[]
        revision?: number
    }
}

/** POST /api/ping - Diagnostic endpoint response */
export interface PingResponse {
    service: string
    timestamp: string
    requestId?: string
    latencyMs: number
    echo?: string
    version?: string
}

/** POST /api/player/{playerId}/move - Returns new location after movement */
export type MoveResponse = LocationResponse

/** GET /api/location or GET /api/location/{locationId} - Location details */
export type LocationLookResponse = LocationResponse

// ============================================================================
// Header Contract Definitions
// ============================================================================

/**
 * Header names used across the API.
 * Use these constants instead of string literals to prevent typos and ensure
 * frontend/backend stay in sync.
 */
export const API_HEADERS = {
    /** Player identifier header - REQUIRED for player-specific operations */
    PLAYER_GUID: 'x-player-guid',
    /** Request correlation ID for distributed tracing */
    CORRELATION_ID: 'x-correlation-id',
    /** Standard content type header */
    CONTENT_TYPE: 'Content-Type'
} as const

/**
 * Validates that a headers object meets the move request contract.
 * Use this in tests to verify header compliance.
 *
 * CRITICAL: The backend MoveHandler requires x-player-guid to persist
 * player location after a move. Without it, moves succeed but location
 * is not saved.
 */
export function validateMoveHeaders(headers: Record<string, string | undefined>): {
    valid: boolean
    errors: string[]
} {
    const errors: string[] = []

    if (!headers[API_HEADERS.PLAYER_GUID]) {
        errors.push('Missing required header: x-player-guid')
    } else if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(headers[API_HEADERS.PLAYER_GUID]!)) {
        errors.push('Invalid x-player-guid format: must be a valid UUID')
    }

    if (headers[API_HEADERS.CONTENT_TYPE] !== 'application/json') {
        errors.push('Content-Type must be application/json')
    }

    return {
        valid: errors.length === 0,
        errors
    }
}
