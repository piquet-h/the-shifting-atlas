# API Reference

## Purpose

This document provides the canonical reference for The Shifting Atlas HTTP API endpoints. It covers RESTful URL patterns, request/response formats, error handling, and migration guidance from legacy query-string patterns.

Target audience: Frontend developers, future third-party integrations, and backend contributors implementing new endpoints.

## Current RESTful Routes

All endpoints are prefixed with `/api/` when deployed. During local development with Azure Functions Core Tools, endpoints are available at `http://localhost:7071/api/`.

### Player Operations

#### Get Player by ID

Retrieve an existing player by their unique identifier.

**Endpoint:** `GET /api/player/{playerId}`

**Path Parameters:**
- `playerId` (required): Player GUID in UUID v4 format

**Headers:**
- `x-player-guid` (optional): Fallback for backward compatibility if `playerId` is not in path

**Success Response (200 OK):**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "guest": true,
  "externalId": null
}
```

**Response Headers:**
- `x-correlation-id`: Request correlation identifier for troubleshooting
- `x-player-guid`: Echo of player GUID for client convenience

**Error Responses:**

*400 Bad Request* - Missing or invalid player ID:
```json
{
  "error": "InvalidPlayerId",
  "message": "Player id must be a valid GUID format",
  "correlationId": "abc-123-def"
}
```

*404 Not Found* - Player does not exist:
```json
{
  "error": "NotFound",
  "message": "Player not found",
  "correlationId": "abc-123-def"
}
```

#### Bootstrap New Player

Allocate a new player GUID for session initialization.

**Endpoint:** `GET /api/player`

**Success Response (200 OK):**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "guest": true
}
```

**Response Headers:**
- `x-correlation-id`: Request correlation identifier
- `x-player-guid`: Newly allocated player GUID

#### Move Player

Execute a directional movement action.

**Endpoint:** `POST /api/player/{playerId}/move`

**Path Parameters:**
- `playerId` (required): Player GUID in UUID v4 format

**Headers:**
- `x-player-guid` (optional): Fallback for backward compatibility if `playerId` is not in path

**Request Body:**
```json
{
  "direction": "north",
  "fromLocationId": "456e7890-e89b-12d3-a456-426614174001"
}
```

**Body Fields:**
- `direction` (required): One of the canonical directions (see [Direction Semantics](#direction-semantics))
- `fromLocationId` (optional): Current location GUID for validation

**Success Response (200 OK):**
```json
{
  "success": true,
  "newLocationId": "789e0123-e89b-12d3-a456-426614174002",
  "message": "You move north."
}
```

**Error Responses:**

*400 Bad Request* - Invalid direction or missing required fields:
```json
{
  "error": "InvalidDirection",
  "message": "Direction must be one of: north, south, east, west, up, down, in, out",
  "correlationId": "abc-123-def"
}
```

*404 Not Found* - No exit in specified direction:
```json
{
  "error": "NoExit",
  "message": "You cannot go north from here.",
  "correlationId": "abc-123-def"
}
```

### Location Operations

#### Get Location Details

Retrieve location information including description and available exits.

**Endpoint:** `GET /api/location/{locationId}`

**Path Parameters:**
- `locationId` (required): Location GUID in UUID v4 format

**Query Parameters (Deprecated):**
- `id` (legacy): Use path parameter instead
- `fromLocationId` (optional): Previous location for contextual descriptions

**Success Response (200 OK):**
```json
{
  "id": "789e0123-e89b-12d3-a456-426614174002",
  "name": "Ancient Crossroads",
  "description": "Weathered stone paths converge at this junction.",
  "exits": ["north", "south", "east"]
}
```

**Error Responses:**

*404 Not Found* - Location does not exist:
```json
{
  "error": "NotFound",
  "message": "Location not found",
  "correlationId": "abc-123-def"
}
```

#### Get Default Starting Location

Retrieve the default starting location (used during player initialization).

**Endpoint:** `GET /api/location`

**Success Response (200 OK):**
Same format as location details above, returns the configured starter location.

### Health & Diagnostics

#### Backend Health Check

General health status for the Functions backend.

**Endpoint:** `GET /api/backend/health`

**Success Response (200 OK):**
```json
{
  "status": "healthy",
  "timestamp": "2025-11-04T00:42:29.532Z"
}
```

#### Gremlin Database Health

Validate connectivity to Cosmos DB Gremlin API.

**Endpoint:** `GET /api/backend/health/gremlin`

**Success Response (200 OK):**
```json
{
  "status": "healthy",
  "gremlin": "connected"
}
```

#### Container Health

Validate connectivity to Cosmos DB SQL API containers.

**Endpoint:** `GET /api/backend/health/container`

**Success Response (200 OK):**
```json
{
  "status": "healthy",
  "containers": ["players", "inventory"]
}
```

## Legacy Endpoints (Deprecated)

The following endpoints use query string parameters and are maintained for backward compatibility during the migration period. **These endpoints will be removed in a future release.**

### ⚠️ Deprecated: Get Exits (Query String)

**Endpoint:** `GET /api/location/exits?locationId={locationId}`

**Deprecation Status:** Maintained for backward compatibility only. Removal planned once all clients migrate.

**Migration Path:** Use `GET /api/location/{locationId}` which includes exits in the response.

### ⚠️ Deprecated: Move with Query String

**Endpoint:** `GET /api/player/{playerId}/move?dir={direction}&from={locationId}`

**Deprecation Status:** Maintained for backward compatibility only. Removal planned once all clients migrate.

**Migration Path:** Use `POST /api/player/{playerId}/move` with JSON body containing `direction` and `fromLocationId` fields.

**Why deprecated:** GET requests should not modify state. POST with JSON body clarifies operation intent and aligns with RESTful HTTP verb semantics.

## Migration Guide: From Query Strings to RESTful Patterns

### Player Movement

**Legacy Pattern:**
```bash
GET /api/player/{playerId}/move?dir=north&from={locationId}
```

**RESTful Pattern:**
```bash
POST /api/player/{playerId}/move
Content-Type: application/json

{
  "direction": "north",
  "fromLocationId": "{locationId}"
}
```

**JavaScript Example:**
```javascript
// Legacy (deprecated)
const response = await fetch(
  `/api/player/${playerId}/move?dir=north&from=${fromId}`
);

// RESTful (current)
const response = await fetch(`/api/player/${playerId}/move`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    direction: 'north',
    fromLocationId: fromId
  })
});
```

### Location Lookup

**Legacy Pattern:**
```bash
GET /api/location?id={locationId}
```

**RESTful Pattern:**
```bash
GET /api/location/{locationId}
```

**JavaScript Example:**
```javascript
// Legacy (deprecated)
const response = await fetch(`/api/location?id=${locationId}`);

// RESTful (current)
const response = await fetch(`/api/location/${locationId}`);
```

## CORS Behavior

CORS configuration is managed by Azure Static Web Apps for production deployments. During local development, the Azure Functions Core Tools allow all origins by default.

**Allowed Methods:** GET, POST, OPTIONS
**Allowed Headers:** Content-Type, x-player-guid, x-correlation-id
**Exposed Headers:** x-correlation-id, x-player-guid

## x-player-guid Header Usage

The `x-player-guid` header serves dual purposes:

1. **Request Header (Backward Compatibility):** Older clients may send player GUID in header instead of path parameter. Handlers check path parameter first, then fall back to header value.

2. **Response Header (Client Convenience):** Server echoes player GUID in response headers to simplify client-side session management without parsing response bodies.

**Rationale:** Path parameters provide clearer REST semantics for resource identification. Header fallback ensures zero-downtime migration for existing clients during the transition period.

## Error Response Formats

All error responses follow a consistent JSON envelope structure:

### Standard Error Envelope

```json
{
  "error": "ErrorCode",
  "message": "Human-readable description",
  "correlationId": "abc-123-def"
}
```

### Common HTTP Status Codes

**400 Bad Request** - Invalid path parameter or malformed request:
- Missing required field (e.g., `playerId` in path)
- Invalid GUID format
- Invalid direction value
- Malformed JSON body

**404 Not Found** - Resource does not exist:
- Player not found
- Location not found
- No exit in specified direction

**429 Too Many Requests** *(Future Placeholder)* - Rate limiting:
```json
{
  "error": "RateLimitExceeded",
  "message": "Too many requests. Retry after 60 seconds.",
  "correlationId": "abc-123-def",
  "retryAfter": 60
}
```

**500 Internal Server Error** - Unexpected server failure:
```json
{
  "error": "InternalError",
  "message": "An unexpected error occurred. Please try again.",
  "correlationId": "abc-123-def"
}
```

**Correlation IDs:** All responses include a `correlationId` field and `x-correlation-id` header for troubleshooting. Include this value when reporting issues.

## Direction Semantics

Valid direction values for movement operations. Refer to concept documentation for normalization rules and relative direction handling.

**Canonical Directions:**
- Cardinal: `north`, `south`, `east`, `west`
- Vertical: `up`, `down`
- Portal/Threshold: `in`, `out`

**Relative Directions (Context-Dependent):**
- `forward`, `back`, `left`, `right`

Relative directions require previous heading context. If context is unavailable, the API returns an `ambiguous` error prompting the player to use a canonical direction.

**Detailed Semantics:** See [Direction Resolution Rules](../concept/direction-resolution-rules.md) for normalization algorithm, typo tolerance, and ambiguity handling.

## Versioning Strategy

**Current Approach:** All endpoints use the `/api/` prefix without explicit version numbers. The Shifting Atlas controls both frontend and backend, enabling coordinated deployments without parallel API versions.

**Future Versioning:** If third-party integrations or external clients require stability guarantees, versioned prefixes (e.g., `/api/v1/`, `/api/v2/`) will be introduced. See [Issue #229](https://github.com/piquet-h/the-shifting-atlas/issues/229) for ongoing versioning strategy discussion.

**ADRs:** No versioning-specific ADRs exist yet. Future versioning decisions will be documented via ADR and linked here.

## Architecture References

- **Exit Invariants:** [Exit Edge Invariants](./exits.md) and [Concept: Exits](../concept/exits.md)
- **Direction Resolution:** [Direction Resolution Rules](./direction-resolution-rules.md) and [Concept: Direction Semantics](../concept/direction-resolution-rules.md)
- **Frontend Contract:** [Frontend API Contract](./frontend-api-contract.md)
- **Versioning Discussion:** [Issue #229: API Versioning Strategy](https://github.com/piquet-h/the-shifting-atlas/issues/229)

## Out of Scope

The following items are explicitly out of scope for this document:

- **OpenAPI/Swagger Specification:** Future enhancement. When implemented, generated spec will be published separately (not embedded here).
- **Interactive API Explorer:** Future enhancement (e.g., Swagger UI integration).
- **Multi-Language Code Samples:** Only JavaScript/TypeScript and curl examples provided. Additional language bindings (Python, C#, etc.) are future enhancements.
- **Authentication/Authorization:** Player session management and auth propagation are under development (see backend README for status). Current endpoints use `authLevel: 'anonymous'`.
