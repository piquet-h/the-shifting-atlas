# M1 Traversal – Implementation Plan & Sequencing

**Milestone:** M1 Traversal  
**Exit Criteria:** Player can move across ≥3 persisted locations; telemetry for move success/failure  
**Status:** Ready to start | **Date:** 2025-10-19

---

## Executive Summary

M1 requires implementing a **core traversal loop**: player bootstrap → LOOK (see location + exits) → MOVE (traverse to new location) → repeat.

**MVP Critical Path (11–15 hours):**

1. Direction Normalizer N1 (#13) – Foundation
2. EXIT Edge Model (#5) – Data structure
3. Exits Summary Cache (#8) – Performance
4. LOOK Command (#9) – Read path
5. Movement Command (#6) – Write path
6. Test & seed data

**Optional post-MVP:** Semantic exits (N2), generation fallback (N4), exit proposals (#48), UI polish (#53).

---

## Issue Inventory & Dependencies

### M1 Issues (9 total)

| Issue | Title                    | Scope     | Dependencies | Est. Hrs | MVP?    |
| ----- | ------------------------ | --------- | ------------ | -------- | ------- |
| #13   | Direction Normalizer N1  | traversal | None         | 2–3      | **YES** |
| #5    | EXIT Edge Model          | traversal | #13          | 3–4      | **YES** |
| #8    | Exits Summary Cache      | traversal | #5           | 2        | **YES** |
| #9    | LOOK Command             | traversal | #5, #8       | 1–2      | **YES** |
| #6    | Movement Command         | traversal | #5, #13      | 2–3      | **YES** |
| #33   | Semantic Exits (N2)      | traversal | #13          | 2–3      | No      |
| #35   | Generation Fallback (N4) | traversal | #6, #13      | 2–3      | No      |
| #48   | Exit Proposals           | traversal | #9           | 2–3      | No      |
| #53   | Rooms Widget             | traversal | #9           | 1–2      | No      |

---

## Optimal Implementation Sequence

### Phase 1: Foundation (Hours 1–3)

**Goal:** Establish direction parsing & validation

#### #13 – Direction Normalizer N1 (Stage 1)

**What:** Utility normalizing player input (`n`, `north`, typos) → canonical direction (`north`)

**Key Requirements:**

-   Support: cardinal (n/s/e/w + diagonals), vertical (u/d), radial (in/out)
-   Handle shortcuts: `n` → `north`, `ne` → `northeast`
-   Typo tolerance: edit distance ≤1
-   Return: `{ status: 'ok'|'ambiguous'|'unknown', canonical?: string, clarity?: string }`

**Deliverables:**

-   `shared/src/directionNormalizer.ts` (pure function)
-   `shared/test/directionNormalizer.test.ts` (unit tests: shortcuts, typos, ambiguity)
-   Telemetry constants: `Navigation.Input.Parsed`

**Why First?** Zero dependencies; used by EXIT creation, movement, and all future direction logic.

**Notes:**

-   Canonical set: `north`, `south`, `east`, `west`, `northeast`, `northwest`, `southeast`, `southwest`, `up`, `down`, `in`, `out`
-   Keep it simple: don't support relative directions (left/right/forward) yet (deferred to #33)

---

### Phase 2: Traversal Data Model (Hours 4–7)

**Goal:** Establish EXIT edge model and core retrieval

#### #5 – EXIT Edge Model & Link Rooms

**What:** Create EXIT edges in Cosmos Gremlin; implement HTTP functions for edge creation and retrieval

**Key Requirements:**

-   Gremlin queries:
    -   Create directed edge: `(location) --EXIT--> (target location)`
    -   Retrieve all exits from location (ordered: N, S, E, W, NE, NW, SE, SW, U, D, In, Out)
    -   Prevent duplicate (same fromId + direction) – return `created: false` if exists
    -   Support bidirectional creation (optional reciprocal)
-   HTTP Functions:
    -   `HttpLinkRooms(originId: string, targetId: string, dir: string, reciprocal?: bool)`
    -   `HttpGetExits(locationId: string)` → ordered array of exits
-   EXIT Edge Properties:
    ```
    {
      fromId: string,
      toId: string,
      dir: string,           // canonical direction
      kind: string,          // 'cardinal'|'vertical'|'radial'|'semantic'
      state: 'open'|'closed',
      createdUtc: string,
      reciprocal?: boolean,  // informational (stored as separate edge)
      description?: string   // optional flavor text
    }
    ```

**Deliverables:**

-   `shared/src/repos/exitRepository.ts` (Gremlin operations)
-   `backend/src/functions/linkRooms.ts` (HTTP POST)
-   `backend/src/functions/getExits.ts` (HTTP GET)
-   `backend/test/exitRepository.test.ts` (idempotency, ordering)
-   Telemetry constants: `World.Exit.Created`, `World.Exit.Removed`

**Why Second?** Foundation for LOOK, Move, and exit caching. Needs direction normalizer to validate canonical dir.

**Key Invariant:** Directional uniqueness – at most one outgoing exit per (fromId, direction). Re-create with same direction returns `created: false`, no telemetry.

**Testing Strategy:**

-   Create seed locations (3+)
-   Link them bidirectionally
-   Verify retrieval order (compass + vertical + radial)
-   Test idempotency (duplicate create)

---

### Phase 3: Performance & Read Path (Hours 8–10)

**Goal:** Enable efficient location viewing with exits

#### #8 – Exits Summary Cache Generation Utility

**What:** Compute & cache human-readable exits summary; regenerate on exit changes

**Key Requirements:**

-   Function `generateExitsSummary(exits: EXIT[]): string`
    -   Deterministic compass ordering: N→S→E→W→NE→NW→SE→SW→U→D→In→Out
    -   Format: `"Exits: north (north gate), east, in (arena floor)"`
    -   Cache on Location doc: `exitsSummaryCache: string`
-   Invalidation:
    -   On `HttpLinkRooms` → call `regenerateCache(originId)`
    -   On `HttpRemoveExit` → call `regenerateCache(originId)` (after #128 added)
-   Fallback:
    -   If cache missing/null → dynamically build + persist
    -   TTL optional (can refresh weekly)

**Deliverables:**

-   `shared/src/utils/exitSummaryGenerator.ts` (pure functions)
-   `shared/test/exitSummaryGenerator.test.ts` (ordering, formatting)
-   Updated `Location` repository to persist cache
-   Cache invalidation logic in link/remove functions

**Why Third?** Needed for LOOK performance; simple, can be done in parallel with #9.

**Key Invariant:** Ordering is deterministic; same exit set always produces identical summary.

---

#### #9 – LOOK Command (HttpLook)

**What:** HTTP endpoint returning location metadata + exits summary

**Key Requirements:**

-   Route: `GET /api/player/look?playerId=<guid>&locationId=<guid>`
-   Response:
    ```json
    {
      locationId: string,
      name: string,
      baseDescription: string,
      exits: { north?: string, south?: string, ... },
      exitsSummaryCache: string,
      metadata: { biome?, tags? },
      revision: number
    }
    ```
-   Regenerate cache if:
    -   Cache missing/null
    -   Stale (> TTL, optional for MVP)
-   Telemetry: `Navigation.Look.Issued` (locationId, fromLocationId?, latencyMs)

**Deliverables:**

-   `backend/src/functions/look.ts` (HTTP GET)
-   `backend/test/look.test.ts` (cache hit/miss/regenerate paths)
-   Update telemetry registry

**Why Together?** Both depend on #5. LOOK is pure read; can be implemented in parallel with Movement (#6).

**Testing Strategy:**

-   LOOK at location with exits → exits summary displayed
-   LOOK at location without cache → cache generated
-   Repeat LOOK → returns cached version

---

### Phase 4: Write Path (Hours 11–13)

**Goal:** Enable player movement

#### #6 – Movement Command (HttpMovePlayer)

**What:** HTTP endpoint to move player to adjacent location via exit

**Key Requirements:**

-   Route: `POST /api/player/move`
-   Input: `{ playerId: string, fromId: string, dir: string }`
-   Logic:
    1. Normalize direction using #13
    2. Query EXIT edges from fromId matching canonical dir
    3. If not found → `{ status: 'no_exit', reason: 'north exit not found' }`
    4. If found but `state !== 'open'` → `{ status: 'blocked', reason: '...' }`
    5. Update player `currentLocationId` in Cosmos
    6. Emit telemetry `Navigation.Move.Success` or `Navigation.Move.Blocked`
-   Response:
    ```json
    {
      success: boolean,
      newLocationId?: string,
      reason?: string,
      latencyMs: number
    }
    ```

**Deliverables:**

-   `backend/src/functions/move.ts` (HTTP POST)
-   `backend/test/move.test.ts` (success, no exit, blocked paths)
-   Update telemetry registry: `Navigation.Move.Success`, `Navigation.Move.Blocked`

**Why Fourth?** Core traversal; depends on both #13 and #5.

**Testing Strategy:**

-   Move player from location A to B (success)
-   Move player in direction with no exit (fail)
-   Move player in direction with blocked exit (fail)
-   Verify player location updated in persistence

---

### Phase 5: Validation & Test Data (Hours 14–15)

**Goal:** Prove MVP criteria with end-to-end test

#### Extend Seed Script

**What:** Create 3+ test locations with interconnected exits

**Setup:**

-   Location A: "Starting Arena" (center)
-   Location B: "North Gate" (north from A)
-   Location C: "East Stands" (east from A)
-   Links: A ↔ B (north/south), A ↔ C (east/west)

**Deliverables:**

-   Update `backend/scripts/seed-locations.mjs` (or create new)
-   Creates 3 locations + 4 exits (bidirectional)
-   Runnable locally and via CI

#### Extended Smoke Test

**What:** End-to-end loop: Bootstrap → LOOK → MOVE → LOOK

**Path:**

1. Bootstrap player → get GUID
2. LOOK at starting location → see exits
3. MOVE north → success
4. LOOK at new location → see reverse exit
5. MOVE south → back to start

**Deliverables:**

-   Update or extend `backend/test/smokeTest.ts`
-   Run locally: `npm run smoke:traversal`
-   Validate: player moves across 3 locations successfully

---

## Deferred Post-MVP Issues

These are valuable but not blockers for MVP:

### #33 – Semantic Exits (N2)

**Why Defer?** MVP works with cardinal directions. Semantic names (archway, fountain) improve UX but aren't required for basic traversal.  
**When to Start?** After MVP validated; pairs with landmark aliases.

### #35 – Generation Fallback (N4)

**Why Defer?** Emits events when direction is valid but no exit exists. Enables AI-driven world growth but not critical for MVP.  
**When to Start?** After M1 baseline + before M3 AI Read.

### #48 – Exit Proposals

**Why Defer?** Staging area for AI exit candidates. Infrastructure for future AI, not needed for manual traversal.  
**When to Start?** M3 AI phase.

### #53 – Rooms Discovered Widget

**Why Defer?** UX cosmetic. Shows discovered location count.  
**When to Start?** After MVP validated; quick frontend addition.

---

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

## Success Criteria (MVP)

-   [ ] Player bootstraps and receives GUID (M0 validated)
-   [ ] LOOK returns location + exits summary (cache working)
-   [ ] MOVE traverses between locations (player position updates)
-   [ ] Movement blocked when exit doesn't exist (404/409 returned)
-   [ ] Telemetry events emitted for look/move (success & failure)
-   [ ] End-to-end smoke test passes (bootstrap → look → move → look)
-   [ ] 3+ locations seeded and interconnected
-   [ ] All unit tests passing

---

## Recommended Start Order (Rationale)

| Step | Issue       | Why First                         | Start Date | End Date   | Hours |
| ---- | ----------- | --------------------------------- | ---------- | ---------- | ----- |
| 1    | #13         | Zero dependency; feeds all others | 2025-10-19 | 2025-10-20 | 2–3   |
| 2    | #5          | Core data structure               | 2025-10-20 | 2025-10-21 | 3–4   |
| 3a   | #8          | Can parallel with #9              | 2025-10-21 | 2025-10-21 | 2     |
| 3b   | #9          | Can parallel with #8              | 2025-10-21 | 2025-10-22 | 1–2   |
| 4    | #6          | Needs #5 + #13                    | 2025-10-22 | 2025-10-23 | 2–3   |
| 5    | Seed + Test | Validation                        | 2025-10-23 | 2025-10-23 | 1–2   |

**Estimated Completion:** 2025-10-23 (end of day)

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
