# Frontend API Contract

## Decision

Frontend uses RESTful path-based URLs for player and location operations. GUIDs embedded in paths; move operations POST JSON bodies.

## Routes

```
GET  /api/player/{playerId}       # Confirm existing player
GET  /api/player                   # Allocate new player
GET  /api/location/{locationId}   # Specific location
GET  /api/location                 # Default location
POST /api/player/{playerId}/move  # Body: { direction, fromLocationId? }
```

## Invariants

- GUIDs validated client-side (UUID v4 format required)
- Invalid GUIDs throw errors before request
- Direction values: cardinal strings

## Rationale

RESTful paths clarify resource semantics over query parameters. Aligns HTTP verbs with operation intent (GET = retrieval, POST = state change).

Implementation: `frontend/src/utils/apiClient.ts`


