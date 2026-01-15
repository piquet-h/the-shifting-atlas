# Frontend API Contract

## Decision

Frontend uses RESTful path-based URLs for player and location operations. GUIDs embedded in paths; move operations POST JSON bodies.

## Routes

```
GET  /api/player/{playerId}       # Confirm existing player
GET  /api/player                   # Allocate new player
GET  /api/location/{locationId}   # Specific location with compiled description
GET  /api/location                 # Default location with compiled description
POST /api/player/{playerId}/move  # Body: { direction } → returns new location with compiled description
```

## Response Schemas

### LocationResponse (GET /api/location, POST /api/player/{playerId}/move)

Backend always compiles descriptions through `DescriptionComposer`. See ADR-005.

Some responses may also include an optional **scene** field, which is an immersive post-composition narrative derived from the same deterministic inputs.

**Latency contract note:** the backend may treat requests as **snappy** (action-forward) or **cinematic** (narrative-forward) based on user intent/flags. The contract affects whether `description.scene` is returned immediately (cache hit), returned after a bounded wait, or omitted with deterministic fallback.
See `../modules/scene-synthesiser.md`.

```typescript
interface LocationResponse {
    id: string
    name: string
    description: {
        text: string // Compiled markdown (layers merged)
        html: string // Sanitized HTML for rendering
        scene?: {
            text: string // Optional immersive narrative (may be absent when snappy or on fallback)
            provenance: {
                source: 'cache' | 'fresh' | 'fallback'
                fallback?: boolean
            }
        }
        provenance: {
            compiledAt: string // ISO timestamp
            layersApplied: string[] // Layer types applied (e.g., ['dynamic', 'ambient'])
            supersededSentences: number
        }
    }
    exits?: Array<{ direction: string; description?: string }>
    metadata?: {
        exitsSummaryCache?: string
        tags?: string[]
        revision?: number
    }
}
```

**Usage in frontend:**

```typescript
// Access compiled description text
const text = location.description.text

// Access HTML for rich rendering
const html = location.description.html

// Debug/observability: check provenance
console.log(`Compiled at ${location.description.provenance.compiledAt}`)
console.log(`Layers: ${location.description.provenance.layersApplied.join(', ')}`)
```

### PlayerGetResponse (GET /api/player/{playerId})

```typescript
interface PlayerGetResponse {
    id: string
    guest: boolean
    externalId?: string
    currentLocationId?: string
}
```

## Invariants

- GUIDs validated client-side (UUID v4 format required)
- Invalid GUIDs throw errors before request
- Direction values: cardinal strings
- **Description is always compiled** — frontend never receives raw description strings

## Rationale

RESTful paths clarify resource semantics over query parameters. Aligns HTTP verbs with operation intent (GET = retrieval, POST = state change).

Backend owns description composition (Tenet #7: Narrative Consistency). Frontend receives ready-to-render content.

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
