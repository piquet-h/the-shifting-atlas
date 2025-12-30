# Description Layer Scope Inheritance Migration Guide

## Summary

This migration updates the `descriptionLayers` container to support realm-based scope inheritance, enabling zone-wide weather effects with location-specific overrides.

**Status**: ⚠️ **BREAKING CHANGE** - Requires container recreation and data migration

---

## Schema Changes

### Partition Key Change

**Before (M2)**:
```
Partition Key: /locationId  
Pattern: UUID (e.g., "a1b2c3d4-e5f6-...")
```

**After (M3c)**:
```
Partition Key: /scopeId
Patterns:
  - Location: "loc:<locationId>"
  - Realm: "realm:<realmId>"
```

### Field Changes

| Field (Old) | Field (New) | Type | Notes |
|------------|-------------|------|-------|
| `locationId` | `scopeId` | string | **Partition key change** |
| `content` | `value` | string | Renamed for consistency |
| `priority` | _(removed)_ | number | Replaced by temporal ordering |
| _(none)_ | `effectiveFromTick` | number | **New**: Temporal validity start |
| _(none)_ | `effectiveToTick` | number \| null | **New**: Temporal validity end (null = indefinite) |
| `attributes` | `metadata` | object | Renamed for clarity |

---

## New API Usage

### Setting Layers

**Realm-scoped layer (zone-wide weather)**:
```typescript
await layerRepository.setLayerForRealm(
  weatherZoneId,
  'weather',
  fromTick: 1000,
  toTick: 2000,
  'Heavy rain falls across the zone.',
  metadata: { intensity: 'severe' }
)
```

**Location-specific override**:
```typescript
await layerRepository.setLayerForLocation(
  locationId,
  'weather',
  fromTick: 1000,
  toTick: 2000,
  'A magical barrier keeps the rain out.'
)
```

### Querying Active Layer

**Resolution with realm inheritance**:
```typescript
const activeLayer = await layerRepository.getActiveLayerForLocation(
  locationId,
  'weather',
  currentTick
)

if (activeLayer) {
  console.log(activeLayer.value)        // Layer text
  console.log(activeLayer.scopeId)      // "loc:<id>" or "realm:<id>"
  console.log(activeLayer.metadata)     // Optional metadata
}
```

**Priority order**:
1. Location-specific layer (`loc:<locationId>`)
2. Containing weather zone realm (`realm:<weatherZoneId>`)
3. Broader containing realms (ordered by scope: LOCAL → REGIONAL → MACRO → CONTINENTAL → GLOBAL)

---

## Related Issues

- #676 Realm Vertex Schema (dependency)
- #674 Description Layer Time Intervals (related)
- #678 Weather Zone Realms (use case)

---

**Last Updated**: 2025-12-28  
**Milestone**: M3c Temporal PI-0
