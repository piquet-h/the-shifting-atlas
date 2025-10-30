# M1 Traversal – Implementation Plan & Sequencing (ARCHIVED)

> ARCHIVED: Milestone CLOSED 2025-10-30. For final outcomes and verification, see `M1-closure-summary.md`.

**Milestone:** M1 Traversal  
**Exit Criteria:** Player can move across ≥3 persisted locations; telemetry for move success/failure  
**Status:** CLOSED 2025-10-30 | **Historical Snapshot Last Updated:** 2025-10-22 (retained for traceability)

---

## Executive Summary

M1's **core traversal loop** is COMPLETE: player bootstrap → LOOK (see location + exits) → MOVE (traverse to new location) → repeat.

**MVP Critical Path (COMPLETED):**

1. ✅ Direction Normalizer N1 (#13) – CLOSED 2025-10-19
2. ✅ EXIT Edge Model (#5) – CLOSED 2025-10-22
3. ✅ Exits Summary Cache (#8) – CLOSED 2025-10-22
4. ✅ LOOK Command (#9) – CLOSED 2025-10-22
5. ✅ Movement Command (#6) – CLOSED 2025-10-22

**22 Open Issues Remaining:** Focus on architecture, persistence migration, observability, and advanced features.

---

## Current Open Issues (22 Total)

### Architecture & Design

| Issue | Title                                                 | Scope     | Epic | Priority |
| ----- | ----------------------------------------------------- | --------- | ---- | -------- |
| #89   | Location Versioning & Edge Management Architecture    | systems   | Yes  | High     |
| #117  | Location Edge Management & Reciprocity                | traversal | Yes  | High     |
| #131  | Player-Location Edge Migration Design Doc             | core      |      | High     |
| #33   | Semantic Exits (N2)                                   | traversal |      | Medium   |
| #170  | Exit Management Service Refactor (Out-of-Scope Audit) | traversal |      | Medium   |

### Backend Implementation

| Issue | Title                                            | Scope     | Dependencies | Priority |
| ----- | ------------------------------------------------ | --------- | ------------ | -------- |
| #167  | Mosswell Repository Interfaces & Bootstrap Logic | world     | #64          | High     |
| #128  | HttpRemoveExit Function                          | traversal | #117         | Medium   |
| #129  | Exit Cache Integration & Invalidation            | traversal | #117         | Medium   |
| #130  | Exit State Update Function                       | traversal | #117         | Medium   |
| #42   | Relative Direction Support (N3)                  | traversal | #33          | Low      |
| #168  | Location Repository Edge Rewrite                 | core      | #131         | Medium   |
| #169  | Mosswell Player State Bootstrap                  | core      | #131, #167   | Medium   |
| #14   | Queue Processor World Evolution Trigger          | world     |              | Medium   |

### Frontend & UX

| Issue | Title                   | Scope     | Dependencies | Priority |
| ----- | ----------------------- | --------- | ------------ | -------- |
| #53   | Rooms Discovered Widget | traversal | #52          | Low      |
| #126  | Client Move Command     | traversal |              | Medium   |
| #127  | Client LOOK Command     | traversal |              | Medium   |
| #171  | Auth Flow Integration   | security  | #131         | High     |

### Documentation & Metadata

| Issue | Title                                      | Scope  | Dependencies | Priority |
| ----- | ------------------------------------------ | ------ | ------------ | -------- |
| #52   | Learn More Page (Epic)                     | docs   | Yes          | Low      |
| #64   | Mosswell Bootstrap (Epic)                  | world  | Yes          | High     |
| #72   | Design Doc: Inventory & Object Persistence | core   |              | Medium   |
| #73   | Design Doc: NPC Persistence & Behavior     | world  |              | Medium   |
| #12   | Telemetry Validator                        | observ |              | Medium   |

**Note:** Issues #60 (Player Identifiers) also open but details not retrieved in current search.

---

## Historical Implementation Sequence (COMPLETED)

The following phases document what was actually implemented for MVP.

### Phase 1: Foundation (COMPLETED 2025-10-19)

#### ✅ #13 – Direction Normalizer N1 (Stage 1)

**Delivered:**

-   `shared/src/directionNormalizer.ts` with canonical direction support
-   Cardinal (N/S/E/W + diagonals), vertical (U/D), radial (In/Out)
-   Shortcut handling (`n` → `north`, `ne` → `northeast`)
-   Typo tolerance with edit distance
-   Full test coverage in `shared/test/directionNormalizer.test.ts`

---

### Phase 2: Traversal Data Model (COMPLETED 2025-10-22)

#### ✅ #5 – EXIT Edge Model & Link Rooms

**Delivered:**

-   Gremlin EXIT edge model with direction validation
-   HTTP functions: `HttpLinkRooms`, `HttpGetExits`
-   Idempotent edge creation (prevents duplicates)
-   Bidirectional exit support
-   Exit ordering by compass direction
-   Full test coverage

#### ✅ #6 – Movement Command (HttpMovePlayer)

**Delivered:**

-   `backend/src/functions/playerMove.ts` HTTP endpoint
-   Request handler: `backend/src/functions/playerMove.handler.ts`
-   Core logic: `backend/src/functions/moveHandlerCore.ts` (152 lines)
-   Response builder: `backend/src/functions/moveHandlerResponse.ts`
-   Direction normalization integration
-   Origin validation, exit queries, heading updates
-   Telemetry: `Location.Move` with status/reason/latency
-   Full test coverage

**Note:** Implemented stateless pattern (frontend passes `from` parameter); persistent player location covered by #131.

---

### Phase 3: Performance & Read Path (COMPLETED 2025-10-22)

#### ✅ #8 – Exits Summary Cache Generation Utility

**Delivered:**

-   `shared/src/utils/exitsSummaryGenerator.ts`
-   Deterministic compass ordering (N→S→E→W→diagonals→vertical→radial)
-   Human-readable format with optional exit names/kinds
-   Cache invalidation logic in link/remove functions
-   Full test coverage

#### ✅ #9 – LOOK Command (HttpLook)

**Delivered:**

-   HTTP GET endpoint returning location metadata + exits
-   Exits summary cache integration
-   Dynamic cache generation with fallback
-   Telemetry: `Navigation.Look.Issued`
-   Full test coverage

---

### Phase 4: Validation (COMPLETED)

-   ✅ Seed script with 3+ interconnected locations
-   ✅ End-to-end smoke tests (bootstrap → look → move → look)
-   ✅ All unit tests passing
-   ✅ MVP success criteria met

---

## Dependencies & Blockers

### External (Available from M0)

-   ✅ Location repository (M0: #100)
-   ✅ Player repository (M0: #103)
-   ✅ Cosmos Gremlin client
-   ✅ Telemetry infrastructure (M0: #104)
-   ✅ Direction normalizer (#13)

### Current Blockers

-   #117, #128–#130 blocked by #89 (architecture design)
-   #168, #169 blocked by #131 (player-location edge design)
-   #169 blocked by #167 (repository interfaces)
-   #171 blocked by #131 (player persistence)

---

## Risk & Mitigation

| Risk                                      | Status     | Mitigation                                           |
| ----------------------------------------- | ---------- | ---------------------------------------------------- |
| Gremlin query performance on large graphs | Monitoring | MVP validated; scale testing deferred to M2          |
| Direction normalization accuracy          | Mitigated  | Conservative approach working; telemetry in place    |
| Cache invalidation race conditions        | Mitigated  | Synchronous invalidation; no observed issues         |
| Player movement concurrency               | Design     | Covered by #131 (persistent edges + optimistic lock) |
| Exit reciprocity guarantees               | Design     | Covered by #117 (comprehensive edge management)      |

---

_Plan created: 2025-10-19 | MVP completed: 2025-10-22 | Updated: 2025-10-22_

## Missing Items (Not Issues Yet)

### 1. Telemetry Registry Update

**What:** Add M1 events to `shared/src/telemetryEvents.ts`

```typescript
export const GAME_EVENT_NAMES = {
    // Navigation
    'Navigation.Input.Parsed': {},
    'Navigation.Look.Issued': {},
    'Navigation.Move.Success': {},
    'Navigation.Move.Blocked': {},
    'Navigation.Exit.GenerationRequested': {},

    // World
    'World.Exit.Created': {},
    'World.Exit.Removed': {}
}
```

**Effort:** ~30 min (concurrent with #13)

### 2. Exit Edge Schema / Data Model

**What:** TypeScript interfaces for EXIT edges

```typescript
interface ExitEdge {
    fromId: string
    toId: string
    dir: CanonicalDirection
    kind: 'cardinal' | 'vertical' | 'radial' | 'semantic'
    state: 'open' | 'closed' | 'locked'
    createdUtc: ISO8601
    reciprocal?: boolean
    description?: string
    geomDistance?: number
}
```

**Effort:** ~30 min (within #5)

### 3. Direction Validator (Shared)

**What:** Utility function validating direction is in canonical set

```typescript
export function isCanonicalDirection(dir: string): boolean {
    return CANONICAL_DIRECTIONS.includes(dir)
}
```

**Effort:** ~15 min (within #13)

### 4. Exit Ordering Logic

**What:** Sort function implementing compass order

```typescript
export function sortExits(exits: ExitEdge[]): ExitEdge[] {
    const order = ['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest', 'up', 'down', 'in', 'out']
    return exits.sort((a, b) => order.indexOf(a.dir) - order.indexOf(b.dir))
}
```

**Effort:** ~15 min (within #8)

---

## Dependencies & Blockers

### External (Already Available)

-   ✅ Location repository (M0: #100)
-   ✅ Player repository (M0: #103)
-   ✅ Cosmos Gremlin client
-   ✅ Telemetry infrastructure (M0: #104)
-   ✅ Direction normalizer stub (partially exists from #34; extend with N1 normalization)

### Internal (Sequential)

-   #13 → #5 (direction validation)
-   #5 → #6, #8, #9 (traversal primitives)
-   #8 → #9 (exits cache in LOOK)

### No Blocking Issues

All M1 work can start immediately once phase structure is respected.

---

## Risk & Mitigation

| Risk                                      | Probability | Impact | Mitigation                                                                     |
| ----------------------------------------- | ----------- | ------ | ------------------------------------------------------------------------------ |
| Gremlin query performance on large graphs | Low         | High   | Start with ≤10 locations; benchmark; partition later (ADR-002)                 |
| Direction normalization too aggressive    | Medium      | Medium | Conservative approach (edit distance ≤1); telemetry to tune                    |
| Cache invalidation race conditions        | Low         | Medium | Synchronous invalidation in link/remove; no async eventually-consistent issues |
| Player movement race (concurrent moves)   | Low         | Medium | Optimistic concurrency on Location.revision; test with 5+ parallel moves       |

---

## Success Criteria

### MVP (COMPLETED ✅)

-   [x] Player bootstraps and receives GUID (M0 validated)
-   [x] LOOK returns location + exits summary (cache working)
-   [x] MOVE traverses between locations (player position updates)
-   [x] Movement blocked when exit doesn't exist (404/409 returned)
-   [x] Telemetry events emitted for look/move (success & failure)
-   [x] End-to-end smoke test passes (bootstrap → look → move → look)
-   [x] 3+ locations seeded and interconnected
-   [x] All unit tests passing

### M1 Completion Criteria (In Progress)

-   [ ] Architecture designs complete (#89, #131, #167)
-   [ ] Persistent player-location edges implemented (#168, #169)
-   [ ] Full exit management suite (#117, #128, #129, #130)
-   [ ] Client commands integrated (#126, #127)
-   [ ] Auth flow complete (#171)
-   [ ] All M1 tests passing
-   [ ] Documentation current

---

_Plan created: 2025-10-19 | MVP completed: 2025-10-22 | Updated: 2025-10-22_

With MVP complete, M1 work now focuses on:

### High Priority (Architecture)

1. **#89 – Location Versioning & Edge Management Architecture (Epic)**

    - Overall design for exit management, versioning, and reciprocity
    - Feeds into #117 implementation

2. **#117 – Location Edge Management & Reciprocity (Epic)**

    - Comprehensive exit edge management
    - Reciprocity guarantees
    - Enables #128, #129, #130 (removal, cache, state updates)

3. **#131 – Player-Location Edge Migration Design Doc**

    - Move from stateless pattern to persistent player-location edges
    - `(player)-[:in]->(location)` graph model
    - Feeds into #168, #169 (repository rewrites)

4. **#167 – Mosswell Repository Interfaces & Bootstrap Logic**
    - Part of #64 (Mosswell Bootstrap epic)
    - Repository patterns for Mosswell world
    - Enables #169 (player state bootstrap)

### Medium Priority (Implementation)

5. **#128 – HttpRemoveExit Function** (depends on #117)
6. **#129 – Exit Cache Integration & Invalidation** (depends on #117)
7. **#130 – Exit State Update Function** (depends on #117)
8. **#168 – Location Repository Edge Rewrite** (depends on #131)
9. **#169 – Mosswell Player State Bootstrap** (depends on #131, #167)
10. **#14 – Queue Processor World Evolution Trigger**

### Frontend Integration

11. **#126 – Client Move Command**
12. **#127 – Client LOOK Command**
13. **#171 – Auth Flow Integration** (high priority, depends on #131)

### Lower Priority (Enhancement)

14. **#33 – Semantic Exits (N2)** – Named exits beyond compass directions
15. **#42 – Relative Direction Support (N3)** – Left/right/forward/back (depends on #33)
16. **#170 – Exit Management Service Refactor** – Out-of-scope cleanup audit
17. **#53 – Rooms Discovered Widget** – UX polish
18. **#12 – Telemetry Validator** – Observability tooling

### Documentation

19. **#52 – Learn More Page (Epic)** – Player-facing documentation
20. **#72 – Design Doc: Inventory & Object Persistence**
21. **#73 – Design Doc: NPC Persistence & Behavior**

---

## Recommended Next Steps

**Immediate Focus:** Start with architecture/design issues to establish patterns for remaining work:

1. **Start #89** (Location Versioning Architecture) – Establishes overall design
2. **Start #131** (Player-Location Edge Design) – Critical for persistence migration
3. **Start #167** (Mosswell Repository Interfaces) – Part of bootstrap epic #64

These three design documents will unblock multiple implementation issues and provide clear patterns for the rest of M1.

**Parallel Tracks:** Once designs are complete:

-   Architecture track: #117 → #128, #129, #130
-   Persistence track: #168, #169
-   Frontend track: #126, #127, #171

---

## Post-MVP Roadmap

### Immediate (Week of 2025-10-27)

-   #33 Semantic Exits (N2) – Better UX via named exits + landmarks
-   #35 Generation Fallback (N4) – Emit events when direction valid but no exit

### Medium (Week of 2025-11-02)

-   #48 Exit Proposals – Staging for AI-generated exits
-   Tests for M1 edge cases + stress tests

### Polish

-   #53 Rooms Discovered – UI widget showing discovered location count
-   Extended smoke tests (10+ locations, parallel moves)

---

## Communication Plan

**Kickoff:** Now (2025-10-19)  
**Daily standup:** Async via comments on issues as completed  
**MVP Validation:** 2025-10-23 EOD (smoke test green)  
**Post-MVP Review:** 2025-10-25 (plan enhancements)

---

## Questions to Answer Before Starting

1. **Seed locations:** Should they be hardcoded in script or loaded from JSON config? (Recommend: simple objects in script for now; JSON config deferred to M2)
2. **Compass order:** Confirmed N→S→E→W→NE→NW→SE→SW→U→D→In→Out? (Yes, matches docs)
3. **Exit cache TTL:** Should LOOK always regenerate or use stale cache? (Use cache; manual refresh endpoint optional for testing)
4. **Bidirectional exits:** Default behavior? (Auto-create reverse if requested; default false for MVP)
5. **Blocked exits:** Should blocked exits appear in summary or be hidden? (Appear; marked as blocked; blocking reason visible on LOOK)

---

_Plan created: 2025-10-19 | Ready to execute_
