/**
 * API Contract Types (Requests & Responses)
 *
 * Type definitions for HTTP API request/response payloads.
 * All backend responses are wrapped in ApiEnvelope (success/error) - see domainModels.ts.
 * Response types define the shape of the `data` field within successful envelopes.
 */

// ============================================================================
// REQUEST TYPES (what frontend sends to backend)
// ============================================================================

/** POST /api/player/link - Request body */
export interface PlayerLinkRequest {
    playerGuid: string
}

/** POST /api/player/{playerId}/move - Request body */
export interface MoveRequest {
    direction: string
    fromLocationId?: string
}

/** POST /api/ping - Request body */
export interface PingRequest {
    message?: string
}

// ============================================================================
// RESPONSE TYPES (what backend returns in ApiEnvelope.data)
// ============================================================================

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
    exits?: Array<{ direction: string }>
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
