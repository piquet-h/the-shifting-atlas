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

## API Versioning Policy

**Decision:** All RESTful routes use `/api/` prefix without explicit version segments. The latest API version is always served at this path.

**Rationale:**
- We control both frontend and backend (single deployment unit via Azure Static Web Apps + Functions)
- No third-party API consumers exist
- Breaking changes can be coordinated through synchronized frontend/backend releases
- Complexity of versioned endpoints (e.g., `/api/v1/`, `/api/v2/`) deferred until external client adoption requires it

**Deprecation Timeline:** Immediate. When API contracts change, frontend and backend update together. No backward-compatibility period needed.

**Future Considerations:**
- If external clients emerge, introduce `/api/v2/` namespace while maintaining `/api/` → latest alias
- Observability: Application Insights tracks HTTP status codes (400/404/500) by route; spike in 4xx errors post-deployment indicates contract drift
- High watermark dashboard: Use Application Insights workbook to monitor failed request rates per endpoint (threshold: >5% 4xx responses → rollback trigger)

**Configuration:** Azure Functions default `routePrefix` is `"api"` (see `host.json`). Routes defined in function definitions (e.g., `route: 'player/{playerId}'`) automatically inherit this prefix.


