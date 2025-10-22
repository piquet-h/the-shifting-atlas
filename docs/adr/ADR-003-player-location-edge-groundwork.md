---
status: Draft
date: 2025-01-15
relates: [ADR-002, Issue #103 (closed), Issue #100 (closed)]
---

# Player-Location Edge Migration Groundwork

## Context

Currently, player position is stored as a scalar property `currentLocationId` on the `PlayerState` document (Cosmos SQL API). This approach is simple and sufficient for MVP but has limitations:

- No graph-based proximity queries (e.g., "all players in or near location X")
- No path analysis between players
- No multi-player spatial analytics
- Asymmetry between location-to-location relationships (graph edges) and player-to-location relationships (scalar property)

The domain model already anticipates a future `(player)-[:in]->(location)` edge relationship (see `domainModels.ts` line 6).

## Decision

Maintain the current scalar `currentLocationId` for MVP while establishing groundwork for future migration to graph edges:

1. **Dual Representation (Transition State)**: During migration, both the scalar property and graph edge will coexist temporarily
2. **Write-Through Pattern**: When player moves, update both scalar field (SQL) and edge (Gremlin) atomically where possible
3. **Read Preference**: Queries will read from scalar (SQL) for speed; graph edges used only for analytics
4. **Migration Script**: Separate follow-up issue will implement one-time sync of existing scalar positions to graph edges

## Rationale

- **Performance**: SQL document queries remain fast for individual player lookups
- **Analytics Ready**: Graph edges enable future proximity/path queries without blocking current work
- **Gradual Migration**: Allows testing edge creation patterns before full cutover
- **Rollback Safety**: If graph edge creation fails, scalar property ensures system continuity

## Non-Goals (Now)

- Removing scalar `currentLocationId` field
- Making graph edge the source of truth
- Real-time player-to-player pathfinding algorithms
- Cross-player collision detection

## Future Migration Path (Issue #103 - Closed)

Player persistence enhancement (issue #103) has been completed. This section documents the migration path that was planned.

### Phase 1: Dual Write (Groundwork - This Issue)

- Repository method signatures unchanged
- Internally write both scalar and edge on player move
- Telemetry tracks dual-write success/failure rates
- Graph edge considered "shadow" data for analytics only

### Phase 2: Validation & Analytics (Follow-up Issue)

- Scheduled job compares scalar vs edge for consistency
- Alert on divergence rate > 1%
- Implement read-only analytics queries using edges (e.g., `getPlayersNearLocation`)
- Performance benchmarking

### Phase 3: Migration Script (Follow-up Issue)

- Export all player `currentLocationId` values
- Bulk create `(player)-[:in]->(location)` edges
- Verify counts match
- Enable consistency checks

### Phase 4: Flip Source of Truth (Future Issue)

- Update repository to read from graph edge first
- Keep scalar as denormalized cache for hot path
- Update on edge changes
- Eventual deprecation of scalar (breaking change)

## Implementation Notes for Current Issue (#112 - Closed)

Exit edge management (issue #112) has been completed. This issue focused on **exit edge management** and did NOT implement player-location edges yet. Relevant groundwork includes:

- Telemetry events (`World.Exit.Created`, `World.Exit.Removed`) serve as templates for future `Player.Location.Updated` events
- Bidirectional exit helpers (`ensureExitBidirectional`) demonstrate patterns applicable to player edge creation
- Consistency scan script (`scan-graph-consistency.mjs`) can be extended to validate player edge integrity in future

## Code Placeholders (Low-Risk)

The following placeholders may be added during this issue if convenient, but are **not required**:

```typescript
// In PlayerRepository (future enhancement)
// async updatePlayerLocation(playerId: string, locationId: string): Promise<void> {
//     // Update scalar field (SQL)
//     // await this.updatePlayerDocument(playerId, { currentLocationId: locationId })
//
//     // Create graph edge (Gremlin) - optional shadow write
//     // await this.ensurePlayerLocationEdge(playerId, locationId)
// }
```

## Telemetry (Future)

When player-location edges are implemented, emit:

```typescript
trackGameEventStrict('Player.Location.Updated', {
    playerGuid: playerId,
    fromLocationId: oldLocationId,
    toLocationId: newLocationId,
    edgeCreated: boolean,
    scalarUpdated: boolean,
    latencyMs: number
})
```

## Acceptance Criteria for This Document

- [x] Context explains current scalar-only approach
- [x] Rationale for delaying full migration documented
- [x] Four-phase migration path outlined
- [x] Clarifies this issue (#112) focuses on exits, not player edges
- [x] Code placeholders optional and low-risk
- [x] References ADR-002 (dual persistence) and related issues (#100, #103)

## Related Issues

- **#100** (closed): Location Persistence (locations as graph vertices)
- **#103** (closed): Player Persistence Enhancement (implemented Phase 1 dual-write)
- **#112** (closed): Location Edge Management (exit edges implementation)

## Risks

- **Consistency Divergence**: If edge creation fails silently, analytics become stale. Mitigation: telemetry + scheduled validation.
- **Performance Overhead**: Dual writes add latency. Mitigation: Make edge creation async/non-blocking initially.
- **Complexity**: Maintaining two sources of truth increases code paths. Mitigation: Centralize logic in repository layer.

## Rollback Plan

If graph edges prove problematic:

1. Disable edge creation in repository (feature flag or config)
2. Continue using scalar field only
3. Drop existing player-location edges
4. Reassess need for proximity queries

## Related Documentation

-   [ADR-001: Mosswell Persistence & Layering](./ADR-001-mosswell-persistence-layering.md) – Base persistence model
-   [ADR-002: Graph Partition Strategy](./ADR-002-graph-partition-strategy.md) – Partition key design and dual persistence
-   [Architecture Overview](../architecture/overview.md) – High-level architecture context
-   [Location Version Policy](../architecture/location-version-policy.md) – Exit changes and version tracking
-   [Edge Management](../developer-workflow/edge-management.md) – Player-location edge implementation workflow
-   [M0 Closure Summary](../milestones/M0-closure-summary.md) – Player persistence implementation status

---

Accepted as groundwork design: 2025-01-15
