/**
 * API Contract Types (Requests & Responses)
 *
 * Type definitions for HTTP API request/response payloads.
 * All backend responses are wrapped in ApiEnvelope (success/error) - see shared/src/domainModels.ts.
 * Response types define the shape of the `data` field within successful envelopes.
 *
 * TODO: Move to shared package once we can publish a new version (requires two-stage PR per Section 12.1).
 *        Backend handlers currently use inline interfaces that duplicate these types.
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

/** POST /api/ping - Request body (optional, can also use query param) */
export interface PingRequest {
    playerGuid?: string
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
    linked: boolean
    alreadyLinked: boolean
    externalId?: string
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
}

/** POST /api/ping - Diagnostic endpoint response */
export interface PingResponse {
    echo?: string
    reply?: string
    service?: string
    latencyMs?: number
}

/** POST /api/player/{playerId}/move - Returns new location after movement */
export type MoveResponse = LocationResponse

/** GET /api/location or GET /api/location/{locationId} - Location details */
export type LocationLookResponse = LocationResponse
