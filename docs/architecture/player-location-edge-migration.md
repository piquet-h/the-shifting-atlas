# Player-Location Edge Migration Design

> **Status**: Design Document  
> **Epic**: #117 Location Edge Management  
> **Issue**: #131 Player-Location Edge Migration Design Doc  
> **Risk Level**: DATA-MODEL  
> **Date**: 2025-10-23

## Executive Summary

This document outlines a phased migration strategy for transitioning from scalar `currentLocationId` property to graph edges `(player)-[:in]->(location)` for player position tracking. The migration uses a dual-write approach with explicit phase gates to minimize risk while enabling advanced spatial queries.

**Key Principles:**

-   Backward compatibility maintained throughout
-   Scalar field remains source of truth until Phase 3
-   Observable metrics at each phase for go/no-go decisions
-   Explicit rollback points with minimal data loss

## Context

### Current State

Player position is stored as a scalar property on the `PlayerState` document in Cosmos SQL API:

```typescript
interface PlayerState {
    id: string // Player GUID
    currentLocationId: string // Location GUID (scalar)
    name: string
    // ... other properties
}
```

**Limitations:**

-   No graph-based proximity queries ("all players near location X")
-   No spatial analytics or player clustering
-   Asymmetry with location-to-location edges (graph) vs player-to-location (scalar)
-   Path analysis between players not possible

**Related Pattern**: Location-to-location exits use graph edges with well-defined invariants (see [Exit Edge Invariants](./exits.md)). This migration applies the same pattern to player position.

### Desired State

Player position represented as a graph edge in Cosmos Gremlin API:

```gremlin
// Graph representation
(player:Player {id: "player-guid"})-[:in]->(location:Location {id: "location-guid"})
```

**Benefits:**

-   Enable proximity queries: `g.V('location-id').in('in').hasLabel('Player')`
-   Support pathfinding between players
-   Unified graph model for spatial relationships
-   Foundation for multiplayer features (collision, visibility)

### Why Migration is Necessary

The domain model (see `shared/src/location.ts`) already anticipates player-location edges. Moving from scalar to edge representation enables:

1. **Analytics**: Player density heatmaps, clustering analysis
2. **Multiplayer**: Proximity detection, player-to-player pathfinding
3. **Performance**: Graph traversal optimizations for spatial queries
4. **Consistency**: Unified edge management patterns (same as location exits)

## Migration Strategy: Phased Dual-Write

### Overview

The migration uses a **shadow edge** pattern with four distinct phases:

```
Phase 0: Baseline (Current)
  ↓
Phase 1: Dual Write (Bootstrap)
  ↓
Phase 2: Dual Read (Validation)
  ↓
Phase 3: Cutover (Graph as Source of Truth)
  ↓
Phase 4: Cleanup (Deprecate Scalar)
```

Each phase has explicit **entry criteria**, **success metrics**, and **exit criteria**.

---

## Phase 0: Baseline (Current State)

**Status**: ✅ Complete

**State:**

-   Players stored in Cosmos SQL API (`players` container)
-   `currentLocationId` is the sole source of truth
-   Movement updates via `PlayerRepository.updateLocation(playerId, locationId)`

**No changes required in this phase.**

---

## Phase 1: Dual Write (Bootstrap)

**Goal**: Begin writing player-location edges to graph without changing read path.

**Duration**: 2-4 weeks (observation period)

### Entry Criteria

-   [ ] Edge creation telemetry events defined (`Player.Location.Updated`)
-   [ ] `LocationRepository` includes player vertex creation methods
-   [ ] Test coverage for dual-write scenarios

### Implementation

#### 1.1 Telemetry Events

Define new event in `shared/src/telemetry.ts`:

```typescript
export const GameEventNames = {
    // Existing events...
    'Player.Location.Updated': 'Player location updated'
} as const

// Event payload shape
interface PlayerLocationUpdatedEvent {
    playerGuid: string
    fromLocationId: string | null // null on first spawn
    toLocationId: string
    edgeCreated: boolean // Shadow edge creation success
    scalarUpdated: boolean // Scalar field update success
    latencyMs: number // Total operation time
}
```

#### 1.2 Repository Changes

Update `PlayerRepository` (SQL API):

```typescript
// In backend/src/repos/playerRepository.ts

async updatePlayerLocation(
    playerId: string,
    newLocationId: string
): Promise<void> {
    const startTime = Date.now()
    const oldLocation = await this.getPlayer(playerId)

    // Primary write: Update scalar field (source of truth)
    const scalarUpdated = await this.updatePlayerDocument(playerId, {
        currentLocationId: newLocationId
    })

    // Shadow write: Create graph edge (best effort)
    let edgeCreated = false
    try {
        edgeCreated = await this.createPlayerLocationEdge(
            playerId,
            newLocationId
        )
    } catch (err) {
        // Log but don't fail - edge is shadow data
        console.warn(`Shadow edge creation failed: ${err.message}`)
    }

    // Emit telemetry
    trackGameEventStrict('Player.Location.Updated', {
        playerGuid: playerId,
        fromLocationId: oldLocation?.currentLocationId ?? null,
        toLocationId: newLocationId,
        edgeCreated,
        scalarUpdated,
        latencyMs: Date.now() - startTime
    })
}

private async createPlayerLocationEdge(
    playerId: string,
    locationId: string
): Promise<boolean> {
    const g = this.getGremlinClient()

    // 1. Remove old edge (if exists)
    await g.V(playerId)
        .outE('in')
        .drop()
        .next()

    // 2. Create new edge
    const result = await g.V(playerId)
        .addE('in')
        .to(g.V(locationId))
        .next()

    return result.value !== null
}
```

#### 1.3 Player Vertex Creation

Ensure player vertices exist in graph when player is created:

```typescript
// In PlayerRepository.create()
async createPlayer(playerData: PlayerState): Promise<PlayerState> {
    // Create document (SQL API)
    const player = await this.sqlContainer.items.create(playerData)

    // Create vertex (Gremlin) - shadow write
    try {
        await this.createPlayerVertex(playerData.id, playerData.name)
    } catch (err) {
        console.warn(`Player vertex creation failed: ${err.message}`)
    }

    return player.resource
}

private async createPlayerVertex(playerId: string, playerName: string): Promise<void> {
    const g = this.getGremlinClient()
    await g.addV('Player')
        .property('id', playerId)
        .property('name', playerName)
        .property('pk', playerId) // Partition key
        .next()
}
```

### Success Metrics

Monitor in Application Insights for 2-4 weeks:

-   **Edge Creation Success Rate**: `edgeCreated=true` in ≥99% of movements
-   **Latency Impact**: P99 movement latency increase <50ms
-   **Error Rate**: Edge creation failures <1% and non-blocking

### Exit Criteria

-   [ ] Edge creation success rate ≥99% for 7 consecutive days
-   [ ] No player-blocking failures caused by edge writes
-   [ ] Dashboard shows consistent edge creation metrics

### Rollback Plan (Phase 1)

**If edge creation causes issues:**

1. Set feature flag `ENABLE_PLAYER_EDGE_SHADOW_WRITE=false`
2. Remove edge creation code from `updatePlayerLocation`
3. Continue using scalar field only
4. Drop existing player-location edges (non-blocking cleanup script)

---

## Phase 2: Dual Read (Validation)

**Goal**: Validate graph edges match scalar field; begin analytics queries.

**Duration**: 4-6 weeks (confidence building)

### Entry Criteria

-   [ ] Phase 1 success metrics met
-   [ ] Consistency validation script implemented
-   [ ] Read-only analytics queries tested

### Implementation

#### 2.1 Consistency Validation Script

Create `scripts/validate-player-edge-consistency.mjs`:

```javascript
#!/usr/bin/env node
import { getPlayerRepository, getLocationRepository } from '@atlas/shared'

async function validateConsistency() {
    const playerRepo = await getPlayerRepository()
    const locationRepo = await getLocationRepository()

    // Fetch all players (SQL)
    const players = await playerRepo.getAllPlayers()

    const mismatches = []
    for (const player of players) {
        // Get scalar location
        const scalarLocationId = player.currentLocationId

        // Get graph edge location
        const edgeLocationId = await getPlayerLocationFromGraph(player.id)

        if (scalarLocationId !== edgeLocationId) {
            mismatches.push({
                playerId: player.id,
                scalarLocation: scalarLocationId,
                graphLocation: edgeLocationId
            })
        }
    }

    // Report
    console.log(
        JSON.stringify(
            {
                totalPlayers: players.length,
                mismatches: mismatches.length,
                mismatchRate: ((mismatches.length / players.length) * 100).toFixed(2) + '%',
                details: mismatches
            },
            null,
            2
        )
    )

    // Exit code non-zero if mismatches exceed threshold
    process.exit(mismatches.length > players.length * 0.01 ? 1 : 0)
}

async function getPlayerLocationFromGraph(playerId) {
    const g = getGremlinClient()
    const result = await g.V(playerId).out('in').id().next()
    return result.value || null
}

validateConsistency().catch((err) => {
    console.error(err)
    process.exit(1)
})
```

Run daily via CI/CD or scheduled task.

#### 2.2 Read-Only Analytics Queries

Implement proximity queries (DO NOT replace movement logic yet):

```typescript
// In PlayerRepository - analytics only
async getPlayersNearLocation(
    locationId: string,
    maxHops: number = 1
): Promise<Player[]> {
    const g = this.getGremlinClient()

    // Find players within maxHops of location
    const result = await g.V(locationId)
        .repeat(__.inE('exit').outV())
        .times(maxHops)
        .in_('in')
        .hasLabel('Player')
        .toList()

    return result
}
```

**Important**: This is read-only for analytics. Movement logic still reads `currentLocationId`.

### Success Metrics

-   **Consistency Rate**: ≥99.9% match between scalar and edge (validated daily)
-   **Edge Backfill Complete**: All active players have graph edges
-   **Analytics Performance**: Proximity queries complete in <500ms

### Exit Criteria

-   [ ] Consistency validation passes for 14 consecutive days
-   [ ] Analytics queries stable and performant
-   [ ] No unexplained edge-scalar divergence incidents

### Rollback Plan (Phase 2)

Same as Phase 1 - disable edge writes, continue with scalar only.

---

## Phase 3: Cutover (Graph as Source of Truth)

**Goal**: Flip read path to use graph edges; scalar becomes denormalized cache.

**Duration**: 2-4 weeks (staged rollout)

### Entry Criteria

-   [ ] Phase 2 success metrics met
-   [ ] Staged rollout plan approved
-   [ ] Rollback automation tested

### Implementation

#### 3.1 Flip Read Path

Update movement handler to read from graph:

```typescript
// In backend/src/functions/move.handler.ts
async function getCurrentLocation(playerId: string): Promise<string | null> {
    if (FEATURE_FLAG_PLAYER_EDGE_READ_ENABLED) {
        // New path: Read from graph
        try {
            const locationId = await getPlayerLocationFromGraph(playerId)
            if (locationId) return locationId

            // Fallback to scalar if edge missing
            console.warn(`Player ${playerId} missing graph edge, using scalar fallback`)
        } catch (err) {
            console.error(`Graph read failed: ${err.message}`)
        }
    }

    // Fallback: Read scalar field
    const player = await playerRepo.getPlayer(playerId)
    return player?.currentLocationId ?? null
}
```

#### 3.2 Staged Rollout

Use percentage-based feature flag:

```typescript
// In config or environment
const PLAYER_EDGE_READ_PERCENTAGE = parseInt(process.env.PLAYER_EDGE_READ_PERCENTAGE || '0')

function shouldUseGraphEdgeRead(playerId: string): boolean {
    if (PLAYER_EDGE_READ_PERCENTAGE === 0) return false
    if (PLAYER_EDGE_READ_PERCENTAGE === 100) return true

    // Hash-based deterministic selection
    const hash = simpleHash(playerId)
    return hash % 100 < PLAYER_EDGE_READ_PERCENTAGE
}
```

**Rollout schedule:**

-   Week 1: 10% of players
-   Week 2: 25%
-   Week 3: 50%
-   Week 4: 100%

Monitor error rates and latency at each step.

#### 3.3 Update Scalar as Cache

Once graph is primary, keep scalar field updated for fast reads:

```typescript
// Dual write continues, but graph is now primary
async updatePlayerLocation(playerId: string, newLocationId: string): Promise<void> {
    // Primary write: Update graph edge
    const edgeCreated = await this.createPlayerLocationEdge(playerId, newLocationId)

    // Secondary write: Update scalar cache
    await this.updatePlayerDocument(playerId, {
        currentLocationId: newLocationId
    })

    // Telemetry reflects new priority
    trackGameEventStrict('Player.Location.Updated', {
        playerGuid: playerId,
        toLocationId: newLocationId,
        graphPrimary: true,
        edgeCreated,
        scalarUpdated: true
    })
}
```

### Success Metrics

-   **Graph Read Success Rate**: ≥99.9%
-   **Latency**: P99 movement latency within Phase 1 baseline +10%
-   **Error Rate**: Graph read failures <0.1%

### Exit Criteria

-   [ ] 100% of players using graph read path
-   [ ] Zero scalar-graph divergence incidents in 7 days
-   [ ] Performance within acceptable bounds

### Rollback Plan (Phase 3)

**Critical**: If graph reads cause failures:

1. Set `PLAYER_EDGE_READ_PERCENTAGE=0` immediately
2. Revert to scalar reads
3. Continue dual writes for future retry
4. Investigate root cause before re-attempting

**Rollback SLA**: <5 minutes to revert via feature flag.

---

## Phase 4: Cleanup (Deprecate Scalar Field)

**Goal**: Remove `currentLocationId` scalar field from schema (breaking change).

**Duration**: 1-2 weeks (documentation + deprecation period)

⚠️ **Not Recommended Until**: Multiplayer features actively require graph-only operations.

### Entry Criteria

-   [ ] Phase 3 stable for 90+ days
-   [ ] Business case for removing scalar (performance, cost, complexity)
-   [ ] All clients/services updated to not reference `currentLocationId`

### Implementation

#### 4.1 Deprecation Notice

Add to schema:

```typescript
interface PlayerState {
    id: string
    /** @deprecated Use graph edge (player)-[:in]->(location) instead */
    currentLocationId?: string // Made optional
    // ...
}
```

#### 4.2 Remove Scalar Writes

Stop updating `currentLocationId` in `updatePlayerLocation`:

```typescript
async updatePlayerLocation(playerId: string, newLocationId: string): Promise<void> {
    // Only write to graph
    await this.createPlayerLocationEdge(playerId, newLocationId)

    // No longer update scalar field
}
```

#### 4.3 Schema Migration

Remove field from database (separate migration script):

```typescript
// scripts/remove-player-location-scalar.mjs
const players = await playerRepo.getAllPlayers()
for (const player of players) {
    delete player.currentLocationId
    await playerRepo.updatePlayer(player)
}
```

### Success Metrics

-   Field removal completes without errors
-   No code references to `currentLocationId` in active codepaths

### Exit Criteria

-   [ ] Scalar field removed from all player documents
-   [ ] Schema validation updated
-   [ ] Documentation reflects graph-only model

### No Rollback (Breaking Change)

Phase 4 is a **one-way migration**. Do not proceed unless Phases 1-3 are rock-solid.

---

## Risk Analysis

### High Risks

| Risk                         | Likelihood | Impact   | Mitigation                                                               |
| ---------------------------- | ---------- | -------- | ------------------------------------------------------------------------ |
| **Consistency Divergence**   | Medium     | High     | Daily validation script; alerting on mismatch rate >1%                   |
| **Performance Regression**   | Low        | High     | Staged rollout with latency monitoring; rollback at P99 >2x baseline     |
| **Graph API Outage**         | Low        | Critical | Automatic fallback to scalar reads; dual-write ensures data preserved    |
| **Edge Backfill Incomplete** | Medium     | Medium   | Validation script surfaces missing edges; manual backfill before Phase 3 |

### Medium Risks

| Risk                        | Likelihood | Impact | Mitigation                                                           |
| --------------------------- | ---------- | ------ | -------------------------------------------------------------------- |
| **Telemetry Noise**         | High       | Low    | Use structured events; dashboard filters for actionable metrics only |
| **Feature Flag Complexity** | Medium     | Low    | Centralized config; documentation for flag lifecycle                 |

---

## Rollback Strategy (Summary)

Each phase has a **progressive rollback depth**:

-   **Phase 1-2**: Disable edge writes; continue scalar only (minimal impact)
-   **Phase 3**: Revert feature flag to scalar reads; maintain dual writes (5-minute recovery)
-   **Phase 4**: No rollback possible (breaking change)

**Rollback Automation**: Deploy script `scripts/rollback-player-edges.sh`:

```bash
#!/bin/bash
# Emergency rollback for Phases 1-3
az functionapp config appsettings set \
    --name $FUNCTION_APP_NAME \
    --resource-group $RESOURCE_GROUP \
    --settings ENABLE_PLAYER_EDGE_SHADOW_WRITE=false \
                PLAYER_EDGE_READ_PERCENTAGE=0

echo "Rollback complete - players now using scalar field only"
```

---

## Open Questions

### Q1: Historical Event Enrichment

**Question**: Should we backfill `(player)-[:in]->(location)` edges for historical player positions from telemetry events?

**Options**:

-   **A**: Only create edges going forward (simpler, loses historical data)
-   **B**: Backfill from `Player.Location.Updated` events (complex, provides history)

**Recommendation**: Option A for Phase 1-2; consider Option B if temporal queries become a requirement.

### Q2: Edge Metadata

**Question**: Should player-location edges include metadata (e.g., `enteredAt` timestamp)?

**Options**:

-   **A**: Simple edges with no properties (minimal)
-   **B**: Add `enteredAt`, `sessionId` for analytics

**Recommendation**: Start with Option A; add metadata in Phase 2 if analytics require it.

### Q3: Player Vertex Lifecycle

**Question**: When should player vertices be removed from graph?

**Options**:

-   **A**: Never delete (infinite retention)
-   **B**: Delete on player account deletion
-   **C**: Archive inactive players after N days

**Recommendation**: Option B (delete on account deletion) with Option C considered for scale optimization.

### Q4: Multi-Location Players

**Question**: Can a player be in multiple locations simultaneously (future portal/projection mechanic)?

**Options**:

-   **A**: Single edge only (current model)
-   **B**: Multiple edges with edge properties distinguishing primary/projection

**Recommendation**: Option A initially; revisit if multiplayer projection features are designed.

---

## Success Criteria (Overall Migration)

The migration is considered successful when:

-   [ ] ✅ **Phase 1** complete: Dual writes stable with ≥99% edge creation success
-   [ ] ✅ **Phase 2** complete: Consistency validated daily with ≥99.9% match rate
-   [ ] ✅ **Phase 3** complete: Graph edges as source of truth with <0.1% error rate
-   [ ] ✅ **Phase 4** deferred: Scalar field deprecated only if business case strong

**Minimum Viable Success**: Phases 1-2 completed. Phase 3 is optional until multiplayer features require graph-native queries.

---

## Timeline (Estimated)

| Phase               | Duration  | Cumulative |
| ------------------- | --------- | ---------- |
| Phase 1: Dual Write | 2-4 weeks | 2-4 weeks  |
| Phase 2: Validation | 4-6 weeks | 6-10 weeks |
| Phase 3: Cutover    | 2-4 weeks | 8-14 weeks |
| Phase 4: Cleanup    | 1-2 weeks | 9-16 weeks |

**Total**: 2-4 months (Phases 1-3 only)

---

## References

-   [Exit Edge Invariants](./exits.md) – Pattern template for edge management
-   [Edge Management Guide](../developer-workflow/edge-management.md) – Operational guide for exit edges
-   [ADR-001: Mosswell Persistence & Layering](../adr/ADR-001-mosswell-persistence-layering.md) – Base persistence model
-   [ADR-002: Graph Partition Strategy](../adr/ADR-002-graph-partition-strategy.md) – Partition key design and dual persistence
-   [ADR-003: Player-Location Edge Groundwork](../adr/ADR-003-player-location-edge-groundwork.md) – Historical groundwork (superseded by this doc)
-   [Location Version Policy](./location-version-policy.md) – Exit changes do not increment version (same principle applies)
-   Issue #117: Epic - Location Edge Management
-   Issue #131: Player-Location Edge Migration Design Doc (this document)

---

**Document Status**: ✅ Ready for Review  
**Next Steps**: Review with stakeholders; approve Phase 1 entry criteria  
**Maintenance**: Update this document when phases complete or risks materialize
