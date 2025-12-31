# Description Layer Overlap Policy

**Status**: Implemented (M3c Temporal PI-0)  
**Risk**: DATA-MODEL  
**Related**: `docs/architecture/cosmos-sql-containers.md`, `docs/architecture/realm-hierarchy.md`

---

## Overview

When multiple description layers are temporally active at the same tick for a given `scopeId` and `layerType`, a deterministic resolution policy is required to select which layer to display.

---

## Policy: Last-Authored-Wins

**Decision**: When multiple layers overlap temporally (i.e., multiple layers have `effectiveFromTick <= currentTick <= effectiveToTick`), the layer with the most recent `authoredAt` timestamp wins.

**Rationale**:
1. **Temporal Consistency**: Later authoring represents more recent intent
2. **Simplicity**: Single SQL `ORDER BY authoredAt DESC LIMIT 1` clause
3. **Predictability**: No complex priority scoring or manual ranking
4. **Idempotency**: Re-running queries at the same tick always returns the same layer

---

## Implementation

### Query Pattern (Cosmos SQL)

```sql
SELECT * FROM c 
WHERE c.scopeId = @scopeId 
AND c.layerType = @layerType
AND c.effectiveFromTick <= @tick
AND (c.effectiveToTick IS NULL OR c.effectiveToTick >= @tick)
ORDER BY c.authoredAt DESC
LIMIT 1
```

**Key Points**:
- `ORDER BY c.authoredAt DESC` ensures most recently authored layer wins
- `LIMIT 1` returns only the active layer
- Single-partition query (p95 latency <50ms)

### Repository Methods

**Direct Scope Query**:
```typescript
getActiveLayer(scopeId: string, layerType: LayerType, tick: number): Promise<DescriptionLayer | null>
```

**Location with Realm Inheritance**:
```typescript
getActiveLayerForLocation(locationId: string, layerType: LayerType, tick: number): Promise<DescriptionLayer | null>
```
- Searches location scope first (`loc:<locationId>`)
- Falls back to realm hierarchy (weather zone → broader realms)
- Each scope independently applies last-authored-wins

---

## Edge Cases

### 1. Overlapping Intervals (Same Scope)

**Scenario**: Two layers with overlapping time ranges

```typescript
// Layer A: tick 1000-3000, authored 2025-01-01T10:00:00Z
// Layer B: tick 2000-4000, authored 2025-01-01T11:00:00Z

// At tick 2500 (both active):
// Returns: Layer B (most recently authored)
```

**Test Coverage**: `backend/test/unit/layerRepository.temporal.test.ts` - "Overlapping Intervals Edge Cases"

### 2. Indefinite Layers (toTick: null)

**Scenario**: One indefinite layer overlapping with bounded layer

```typescript
// Layer A: tick 1000-null, authored 2025-01-01T10:00:00Z
// Layer B: tick 2000-3000, authored 2025-01-01T11:00:00Z

// At tick 2500 (both active):
// Returns: Layer B (most recently authored)

// At tick 4000 (only Layer A active):
// Returns: Layer A
```

### 3. Identical Temporal Ranges

**Scenario**: Multiple layers with same fromTick and toTick

```typescript
// Layer A: tick 1000-5000, authored 2025-01-01T10:00:00Z
// Layer B: tick 1000-5000, authored 2025-01-01T10:00:01Z
// Layer C: tick 1000-5000, authored 2025-01-01T10:00:02Z

// At any tick between 1000-5000:
// Returns: Layer C (most recently authored)
```

**Guarantee**: `authoredAt` timestamp has millisecond precision (ISO 8601), ensuring deterministic ordering even for rapid successive writes.

---

## Validation Rules

### Preventing Data Corruption

**NO validation** is performed to prevent overlapping intervals at write time. This design choice supports:
- **Flexibility**: Weather systems can transition smoothly without coordinated timing
- **Eventual Consistency**: AI-generated layers may not know about each other
- **Simplicity**: No distributed locking or transaction coordination required

### Recommended Patterns

For controlled transitions, applications should:
1. Query existing layers via `queryLayerHistory()`
2. Set `toTick` of old layer to match `fromTick` of new layer
3. Create new layer with adjacent temporal range

**Example**:
```typescript
// Replace weather layer at tick 2000
const existing = await layerRepo.getActiveLayer('realm:zone1', 'weather', 1999)
if (existing && existing.effectiveToTick === null) {
    // End existing layer at tick 2000
    // Note: Direct update not supported in temporal model
    // Instead, create replacement layer with non-overlapping range
}

// Create new layer starting at tick 2000
await layerRepo.setLayerInterval('realm:zone1', 'weather', 2000, null, 'New weather')
```

---

## Alternative Policies (Rejected)

### Priority-Based Ordering

**Rejected Reason**: Requires manual priority management, complex UI, and doesn't align with temporal progression model.

### Strict Non-Overlap Validation

**Rejected Reason**: Too restrictive for AI-generated content and distributed authoring. Overlap is a feature, not a bug.

### Blend Multiple Layers

**Rejected Reason**: Out of scope for MVP. Deferred to M6+ for narrative richness ("partly cloudy with occasional rain").

---

## Telemetry

Overlap detection is **not tracked** in telemetry for performance reasons. To audit overlaps:

```typescript
const history = await layerRepo.queryLayerHistory('realm:zone1', 'weather', startTick, endTick)

// Detect overlaps by comparing temporal ranges
for (let i = 0; i < history.length - 1; i++) {
    const current = history[i]
    const next = history[i + 1]
    
    if (current.effectiveToTick === null || current.effectiveToTick >= next.effectiveFromTick) {
        console.log('Overlap detected:', current.id, next.id)
    }
}
```

---

## Future Considerations (M6+)

### AI-Generated Layer Transitions

When AI generates weather/ambient transitions:
- Set `toTick` of previous layer to match transition tick
- Create new layer with adjacent `fromTick`
- Ensures clean, non-overlapping progression

### Multi-Layer Blending

For richer descriptions ("rainy" + "foggy" → "rainy fog"):
- Extend query to return multiple active layers
- Implement composition logic in description composer
- Maintain last-authored-wins as tiebreaker within same priority tier

---

## Related Documentation

- `docs/architecture/cosmos-sql-containers.md` - Container schema
- `docs/architecture/realm-hierarchy.md` - Scope inheritance model
- `docs/modules/world-time-temporal-reconciliation.md` - Temporal framework
- `backend/src/repos/layerRepository.ts` - Implementation
- `backend/test/unit/layerRepository.temporal.test.ts` - Test coverage

---

**Last Updated**: 2025-12-31  
**Author**: Copilot Agent  
**Review Status**: Approved (M3c)
