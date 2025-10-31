# Frontend API Client Migration to RESTful Patterns

## Overview

The frontend API client has been migrated from query-string-based URLs to RESTful path-based URL patterns. This migration maintains backward compatibility and supports gradual rollout via feature flag.

## API Pattern Changes

### Player Endpoints

**Before (Query String)**:
```
GET /api/player
Header: x-player-guid: {guid}
```

**After (RESTful)**:
```
GET /api/player/{playerId}
Header: x-player-guid: {guid}  # Maintained for backward compatibility
```

### Location Endpoints

**Before (Query String)**:
```
GET /api/location?id={locationId}
Header: x-player-guid: {guid}
```

**After (RESTful)**:
```
GET /api/location/{locationId}
Header: x-player-guid: {guid}  # Maintained for backward compatibility
```

### Move Endpoints

**Before (Query String)**:
```
GET /api/player/move?dir={direction}&from={fromLocationId}
Header: x-player-guid: {guid}
```

**After (RESTful)**:
```
POST /api/player/{playerId}/move
Header: x-player-guid: {guid}  # Maintained for backward compatibility
Header: Content-Type: application/json
Body: {
  "direction": "north",
  "fromLocationId": "87654321-4321-4321-4321-cba987654321"  # optional
}
```

## Feature Flag

The migration is controlled by the `VITE_USE_RESTFUL_URLS` environment variable:

- **Default**: `true` (RESTful patterns enabled)
- **Legacy mode**: Set to `'false'` to use query-string patterns

### Configuration

Add to `.env.development` or `.env.production`:

```bash
# Enable RESTful URL patterns (default)
VITE_USE_RESTFUL_URLS=true

# Disable to use legacy query-string patterns
# VITE_USE_RESTFUL_URLS=false
```

## Implementation Details

### API Client Utilities

The migration is implemented in `frontend/src/utils/apiClient.ts`:

- **`isValidGuid(guid)`**: Validates GUID format
- **`buildPlayerUrl(playerId)`**: Constructs player URL
- **`buildLocationUrl(locationId)`**: Constructs location URL
- **`buildMoveRequest(playerId, direction, fromLocationId)`**: Constructs move request with URL, method, and body
- **`buildHeaders(playerId, additionalHeaders)`**: Adds x-player-guid header for backward compatibility

### Usage Examples

```typescript
import { buildPlayerUrl, buildLocationUrl, buildMoveRequest, buildHeaders } from '../utils/apiClient'

// Player request
const url = buildPlayerUrl(playerGuid)
const headers = buildHeaders(playerGuid)
const response = await fetch(url, { headers })

// Location request
const url = buildLocationUrl(locationId)
const headers = buildHeaders(playerGuid)
const response = await fetch(url, { headers })

// Move request
const { url, method, body } = buildMoveRequest(playerGuid, 'north', fromLocationId)
const headers = buildHeaders(playerGuid, {
  ...(body ? { 'Content-Type': 'application/json' } : {})
})
const response = await fetch(url, {
  method,
  headers,
  ...(body ? { body: JSON.stringify(body) } : {})
})
```

## Error Handling

The API client includes validation for:

- **Invalid GUID format**: Falls back to legacy pattern when playerGuid is malformed
- **Missing playerGuid**: Falls back to legacy pattern (backend will use x-player-guid header)
- **400 Bad Request**: Backend returns detailed error messages for invalid path parameters:
  - `"Player id must be a valid GUID format"`
  - `"Player id required in path or x-player-guid header"`

These errors are extracted and displayed by the existing `extractErrorMessage()` utility.

## Backward Compatibility

The implementation maintains full backward compatibility:

1. **Header fallback**: All requests include `x-player-guid` header
2. **Backend support**: Backend accepts both path parameters and headers
3. **Graceful degradation**: Invalid GUIDs trigger legacy query-string pattern
4. **Feature flag**: Can be disabled to revert to legacy behavior

## Testing

The migration includes comprehensive test coverage:

- **Unit tests** (`frontend/test/apiClient.test.ts`): 14 tests covering all API client utilities
- **Integration tests** (`frontend/test/apiClient.integration.test.ts`): 4 tests verifying RESTful patterns
- **Error handling tests** (`frontend/test/apiResponse.test.ts`): 4 tests for 400 error responses

Total: **22 new tests**, all passing ✅

## Migration Timeline

1. **Phase 1 (Current)**: RESTful patterns enabled by default, legacy fallback available
2. **Phase 2 (Future)**: Monitor adoption, verify no issues
3. **Phase 3 (Future)**: Remove legacy pattern support after full rollout

## Dependencies

This migration depends on:
- **Backend PR #344**: RESTful route implementation (already merged)
- **Backend PR #230**: Backend routes operational (already merged)

## References

- Issue: piquet-h/the-shifting-atlas#231
- Epic: piquet-h/the-shifting-atlas#228
- Backend Routes: piquet-h/the-shifting-atlas#230
