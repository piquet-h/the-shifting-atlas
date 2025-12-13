# Location Clock Storage Decision

**Date**: 2025-12-13  
**Status**: Implemented  
**Related**: M3c Temporal PI-0, Epic #497, Issue #501

## Context

LocationClockManager needs to maintain temporal anchor points for each location to enable player timeline reconciliation. The system must support:
1. Fast read access for `getLocationAnchor(locationId)`
2. Efficient batch updates when world clock advances
3. Historical queries for `getOccupantsAtTick(locationId, tick)`
4. Scalability to thousands of locations

Two storage options were considered:
- **Option A**: Add `clockAnchor` property to location vertices in Gremlin graph
- **Option B**: Create separate `locationClocks` SQL API container

## Decision

**Chosen: Option B - Separate SQL API Container**

Location clock data is stored in a dedicated Cosmos SQL API container named `locationClocks` with partition key `/id` (location GUID).

### Container Schema

```typescript
interface LocationClock {
    id: string              // Location GUID (partition key)
    clockAnchor: number     // World clock tick in milliseconds
    lastSynced: string      // ISO 8601 timestamp of last sync
    _etag?: string          // Optimistic concurrency control
}
```

## Rationale

### Why SQL API Container

1. **Better Batch Update Performance**
   - SQL bulk operations are cheaper than N Gremlin vertex property updates
   - Parallel batch processing: 50 locations per batch with Promise.all()
   - Measured performance: 100 locations sync <1s (memory), <5s (cosmos expected)

2. **Cost-Effective Writes at Scale**
   - Graph property updates incur higher RU costs than SQL document updates
   - Frequent world clock advancements would make graph updates expensive
   - SQL API provides better RU/$ ratio for simple key-value lookups

3. **Consistency with Other Temporal Data**
   - WorldClock already in SQL API (`worldClock` container)
   - PlayerDoc already in SQL API (`players` container)
   - Temporal framework benefits from unified storage model

4. **Simpler Cross-Container Queries**
   - `getOccupantsAtTick` needs to join location clocks + player docs
   - SQL-to-SQL queries are more straightforward than SQL-to-Graph joins
   - Future temporal ledger queries benefit from SQL consistency

### Why Not Graph Properties

1. **Write Amplification**
   - Every world clock tick update would require N Gremlin traversals
   - Graph writes are more expensive (both RU cost and latency)
   - No built-in batch update primitives in Gremlin API

2. **Partitioning Mismatch**
   - Gremlin graph uses world partition key (all locations in one partition)
   - Location clocks benefit from per-location partition isolation (future sharding)
   - SQL API partition strategy aligns with access patterns

3. **Data Coupling**
   - Clock anchors are mutable operational state, not structural world data
   - Graph should remain focused on immutable spatial relationships
   - Separation of concerns: graph for "what connects where", SQL for "what time is it"

## Risk Assessment

**Risk Level**: LOW

- No schema changes to existing Gremlin graph
- New container can be added without downtime
- Repository interface allows future migration if needed
- Rollback is straightforward (delete container, revert code)

## Implementation Notes

### Environment Configuration

```bash
# Default container name (can be overridden)
COSMOS_SQL_CONTAINER_LOCATION_CLOCKS=locationClocks
```

### Auto-Initialization

Locations are lazy-initialized on first `getLocationAnchor()` call:
- Reduces upfront bulk seeding cost
- Aligns with on-demand world generation pattern
- Telemetry event: `Location.Clock.Initialized`

### Batch Sync Strategy

On world clock advancement:
1. Fetch all existing location clocks from SQL API
2. Group into batches of 50
3. Parallel update each batch with Promise.all()
4. Telemetry event: `Location.Clock.BatchSynced` with count

### Future Enhancements

1. **Partition Sharding** (M7+)
   - SQL partition key already supports regional sharding
   - Can split locationClocks by region prefix: `loc:region1`, `loc:region2`

2. **Historical Query Optimization** (M6+)
   - Add composite index: `(currentLocationId, clockTick)` on players container
   - Enable efficient `getOccupantsAtTick` queries

3. **Change Feed Integration** (M7+)
   - Location clock changes can trigger async world events
   - Time-based world evolution (e.g., "location is now night")

## References

- Epic: #497 World Time & Temporal Reconciliation Framework
- Issue: #501 LocationClockManager Implementation
- Architecture: `docs/modules/world-time-temporal-reconciliation.md` Section 3
- ADR-002: Dual Persistence (SQL API for mutable state)
- ADR-004: Player Storage Cutover (SQL API pattern established)
