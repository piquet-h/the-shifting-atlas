# Frontend API Client - RESTful Patterns

## Overview

The frontend API client uses RESTful path-based URL patterns for all player and location endpoints. Player IDs and location IDs are embedded in the URL path, and move commands use POST with JSON request bodies.

## API Patterns

### Player Endpoints

```
GET /api/player/{playerId}
```

Retrieves player information by GUID in the URL path.

### Location Endpoints

```
GET /api/location/{locationId}
GET /api/location  # No ID = current/default location
```

Retrieves location information by GUID in the URL path, or the default location when no ID is provided.

### Move Endpoints

```
POST /api/player/{playerId}/move
Content-Type: application/json

Body: {
  "direction": "north",
  "fromLocationId": "87654321-4321-4321-4321-cba987654321"  // optional
}
```

Executes a player move with direction in the JSON request body.

## Implementation Details

### API Client Utilities

The implementation is in `frontend/src/utils/apiClient.ts`:

- **`isValidGuid(guid)`**: Validates GUID format (required before URL construction)
- **`buildPlayerUrl(playerId)`**: Constructs `/api/player/{playerId}` (throws if invalid GUID)
- **`buildLocationUrl(locationId)`**: Constructs `/api/location/{locationId}` or `/api/location`
- **`buildMoveRequest(playerId, direction, fromLocationId)`**: Constructs move request (throws if invalid player GUID)
- **`buildHeaders(additionalHeaders)`**: Constructs request headers

### Usage Examples

```typescript
import { buildPlayerUrl, buildLocationUrl, buildMoveRequest, buildHeaders } from '../utils/apiClient'

// Player request
const url = buildPlayerUrl(playerGuid)
const response = await fetch(url, { headers: buildHeaders() })

// Location request
const url = buildLocationUrl(locationId)
const response = await fetch(url, { headers: buildHeaders() })

// Move request
const { url, method, body } = buildMoveRequest(playerGuid, 'north', fromLocationId)
const response = await fetch(url, {
    method,
    headers: buildHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body)
})
```

## Error Handling

### GUID Validation

All URL builders validate GUID format before construction. Invalid GUIDs throw errors:

```typescript
try {
    const url = buildPlayerUrl('invalid-guid')
} catch (e) {
    // Error: "Player ID must be a valid GUID"
}
```

### Backend Errors

The backend returns detailed error messages for invalid requests:

- **400 Bad Request**: Invalid GUID format, missing required parameters
- **404 Not Found**: Player or location not found
- **429 Too Many Requests**: Rate limit exceeded

These errors are extracted and displayed by the existing `extractErrorMessage()` utility in `frontend/src/utils/apiResponse.ts`.

## Testing

The implementation includes comprehensive test coverage:

- **Unit tests** (`frontend/test/apiClient.test.ts`): Tests for all API client utilities
- **Integration tests** (`frontend/test/apiClient.integration.test.ts`): Tests verifying RESTful patterns
- **Error handling tests** (`frontend/test/apiResponse.test.ts`): Tests for 400 error responses

Run tests:
```bash
cd frontend
npm test
```

## Components Using API Client

### `usePlayerGuid` Hook

- **Existing player**: `GET /api/player/{playerId}` to confirm GUID
- **New player**: `GET /api/player` to allocate new GUID

### `CommandInterface` Component

- **Look command**: `GET /api/location/{locationId}`
- **Move command**: `POST /api/player/{playerId}/move` with JSON body

## Requirements

- **Player GUID**: Must be a valid UUID v4 format
- **Location GUID**: Must be a valid UUID v4 format when provided
- **Direction**: String value (e.g., "north", "south", "east", "west")

All GUIDs are validated client-side before making API requests.
