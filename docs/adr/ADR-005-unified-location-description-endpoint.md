---
status: Accepted
date: 2025-12-06
---

# ADR-005: Unified Location Description Endpoint

## Context

The frontend needed location descriptions that could include dynamic layers (weather, time-of-day, structural changes). Initially, two separate endpoints existed:

- `GET /api/location/{locationId}` — returned raw location with `description: string`
- `GET /api/locations/{locationId}/compiled` — returned compiled description with layers, HTML, and provenance metadata

This separation created:

1. **Extra round trips** — frontend had to decide which endpoint to call
2. **Complexity** — two response schemas to maintain
3. **Inconsistency** — move responses returned raw description while look could return either

Per Tenet #7 (Narrative Consistency): "AI owns composition" — the backend should always own description composition logic, not expose two paths.

## Decision

1. **Unify endpoints**: `GET /api/location/{locationId}` now always returns compiled descriptions
2. **Remove `/compiled`**: Delete the separate endpoint entirely
3. **Update response schema**: `LocationResponse.description` changes from `string` to `CompiledDescription`
4. **Update move response**: Move handler also compiles descriptions for new location

### New Response Structure

```typescript
interface LocationResponse {
    id: string
    name: string
    description: {
        text: string // Compiled markdown
        html: string // Sanitized HTML
        provenance: {
            compiledAt: string
            layersApplied: string[]
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

## Rationale

- **Single source of truth**: Backend always compiles; frontend never decides
- **Future AI-ready**: When AI enrichment arrives (M4), it's just another layer — no API change needed
- **Reduced complexity**: Frontend uses one hook, one URL builder, one response type
- **Performance acceptable**: Compilation adds ~50-100ms median, well within 500ms p95 target
- **Consistent UX**: Move and look responses now have identical description structure

## Consequences

### Positive

- Simpler frontend code (removed `CompiledLocationResponse` type, `buildCompiledLocationUrl`)
- Unified `usePlayerLocation` hook works for all location fetches
- Provenance metadata always available for debugging/observability
- Ready for description caching optimization if needed

### Negative

- Breaking change for any consumer expecting `description: string`
- Slight latency increase for locations without layers (composition still runs)
- Frontend must access `location.description.text` instead of `location.description`

### Migration

Hard cutover — no deprecation period. Frontend and backend updated together in single deployment.

## Files Changed

### Backend

- `src/handlers/locationLook.ts` — uses `DescriptionComposer`, returns unified response
- `src/handlers/moveCore.ts` — compiles description for new location after move
- Deleted `src/handlers/locationCompiled.ts`, `src/functions/locationCompiled.ts`
- Updated inversify configs to remove handler binding

### Shared

- `src/apiContracts.ts` — added `CompiledDescription`, `DescriptionProvenance` interfaces

### Frontend

- `src/hooks/usePlayerLocation.ts` — uses `buildLocationUrl`, returns `LocationResponse`
- `src/components/GameView.tsx` — accesses `location.description.text`
- `src/utils/apiClient.ts` — removed `buildCompiledLocationUrl`
- Test mocks updated to new response structure

## Related

- Tenet #7: Narrative Consistency
- `docs/architecture/frontend-api-contract.md` — updated with new schema
- `shared/src/apiContracts.ts` — type definitions
