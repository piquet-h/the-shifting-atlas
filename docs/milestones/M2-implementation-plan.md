# M2 Data Foundations – Implementation Plan

> **Status:** 39/50 (78%) | Telemetry ✅ Dual Persistence 🔨 | Critical Path: #408→#404-407→#409→#410 | Updated 2025-11-10

## Active Work

**CRITICAL PATH: Dual Persistence Implementation** (0/7 core, blocks M3)

**Dependency Chain:** #408 → (#404, #405, #406, #407) → #410 → #409

-   📋 **FOUNDATION (start here):** #408 SQL API Repository Abstraction
-   📋 **PERSISTENCE (parallel after #408):** #404 Player State, #405 Inventory, #406 Description Layers, #407 World Events Timeline **[BLOCKS M3]**
-   📋 **MIGRATION (after persistence):** #410 Data Migration Script (Gremlin → SQL backfill)
-   📋 **VALIDATION (after migration):** #409 Integration Tests
-   📋 **INFRASTRUCTURE:** #411 Partition Monitoring, #412 Documentation

**Telemetry & Observability:** ✅ COMPLETE (39/39)

-   Phase 1 (Foundation): #10, #11, #41, #79, #311, #312, #315, #316 ✅
-   Phase 2 (AI Cost): #50, #299-309 ✅
-   Phase 3 (Dashboards/Alerts): #283, #289-298 ✅
-   Infrastructure: #403 Architecture docs ✅
-   Duplicates closed: #395-397 (duplicates of #154-156 in M5) ✅

**Integrity Foundation:** ✅ COMPLETE (3/3)

-   #69 Epic (umbrella) ✅
-   #152 Description telemetry events ✅
-   #153 Integrity hash computation ✅

**Remaining M2 Scope:** 11 issues (9 dual persistence + 2 epic trackers)

-   **Core Path:** #408, #404-407, #410, #409 (7 issues)
-   **Infrastructure:** #411, #412 (2 issues)
-   **Epic Trackers:** #69, #310 (2 issues - umbrella only)

**Moved to M3:** #258 (handlers), #313 (queue correlation), #314 (error normalization), #317 (frontend correlation)  
**Moved to M5:** #154-156 (integrity cache/simulation/alerting), #284-286 (telemetry docs/deprecation), #256 (relative direction), #318 (event naming), #347 (account security), #393 (humor telemetry)
**Telemetry & Observability:** ✅ COMPLETE (38/38)

-   Phase 1 (Foundation): #10, #11, #41, #79, #311, #312, #315, #316 ✅
-   Phase 2 (AI Cost): #50, #299-309 ✅
-   Phase 3 (Dashboards/Alerts): #283, #289-298 ✅
-   Duplicates closed: #395-397 (duplicates of #154-156 in M5) ✅

**Remaining M2 Scope:** (4 issues)

-   #256 Relative Direction Support, #318 Event Naming, #347 Account Security, #393 Humor Telemetry

**Moved to M3:** #258 (handlers), #313 (queue correlation), #314 (error normalization), #317 (frontend correlation)
**Moved to M5:** #154-156 (integrity cache/simulation/alerting), #284-285 (telemetry docs/deprecation)

---

## Phase Details

### Phase 1: Telemetry Foundation ✅ COMPLETE (5/5 + Epic #310 + 1 deprecation)

[x] #311 OTel removal | [x] #312 attributes | [x] #315 sampling | [x] #316 correlation | [x] #353 timing  
[x] #310 Epic: Telemetry Consolidation & Event Enrichment (parent tracking issue)  
[ ] #285 Deprecate Location.Move event (formal deprecation process)

**Note:** Epic #310 child issues #313, #314, #317 moved to M3; #318 optional if capacity

### Phase 2: AI Cost ✅ COMPLETE (9/9 core + epic + extras)

[x] #302 token estimator | [x] #303 calculator | [x] #304 aggregation | [x] #305 guardrails  
[x] #50 epic | [x] #306 simulation | [x] #307 docs | [x] #308 tests | [x] #309 audit

### Phase 3: Dashboards/Alerts (9/10 – 1 alert remaining)

**Dashboards (5/5):** ✅ #289 Performance Ops (parent: #290, #291, #296 children + own panel) | ✅ #283 movement latency  
**Alerts (4/5):** ✅ #292 high RU | 🔨 #293 429s (in progress) | ✅ #294 composite pressure | ✅ #295 non-movement latency  
**Tooling (0/1):** 📋 #298 workbook export automation (ready, needs PR)

_Note: #289 consolidated four related panels into single Performance Operations Dashboard workbook (MECE pattern). Delivered via #377._

### Phase 4: Integrity ✅ COMPLETE (1/1)

[x] #153 hash baseline (closed Nov 7)

### Phase 5: Polish (0/5 ready)

[ ] #258 dead-letter handlers | [ ] #284 observability docs consolidation | [ ] #285 Location.Move deprecation | (#297 threshold tuning, #298 workbook automation need Phase 3)

### Phase 10: Description Integrity Monitoring (0/3 - moved to M4)

**Note:** These Epic #69 child issues have been moved to M4 for proper sequencing:

-   #154 Integrity Cache Layer
-   #155 Corruption Simulation Harness
-   #156 Integrity Anomaly Alerting Logic

**Rationale:** These optimization and testing enhancements should follow after M4's layering infrastructure is stable.

---

### Phase 6: Miscellaneous M2 Scope (0/4)

[ ] #256 Relative Direction Support (N3 semantic navigation)  
[ ] #318 Domain Telemetry Event Naming Consistency  
[ ] #347 Account Switching Security (localStorage persistence fix)  
[ ] #393 Humor Telemetry Enumeration & Emission

**Note:** These items remain in M2 milestone but are not blocking M3. Can be deferred to M5 if needed to accelerate dual persistence work.

---

## Issues Moved to Other Milestones

### Moved to M3 (Core Loop)

-   #258 World Event Type-Specific Payload Handlers
-   #313 Backend: Queue Message CorrelationId Injection
-   #314 Backend: Error Telemetry Normalization
-   #317 Frontend: Telemetry Correlation Headers

### Moved to M5 (Quality & Depth)

-   #154 Integrity Cache Layer
-   #155 Corruption Simulation Harness
-   #156 Integrity Anomaly Alerting Logic
-   #284 Docs: Update Telemetry Catalog & Navigation Events
-   #285 Deprecate Telemetry Event Location.Move (Phase 1)
-   #286 Remove Telemetry Event Location.Move (Phase 2 - Post Retention)
-   #256 Relative Direction Support (N3 semantic navigation)
-   #318 Domain Telemetry Event Naming Consistency
-   #347 Account Switching Security (localStorage persistence)
-   #393 Humor Telemetry Enumeration & Emission

---

## Frontend, World Event Processing, Partition Monitoring (Moved to M3)

These clusters were originally listed in M2 implementation plan but belong to M3 Core Loop milestone:

**Frontend Player Experience** (Epic #389) - Issues #413-424 → M3  
**World Event Processing** (Epic #385) - Issues #398-402 → M3  
**Partition Monitoring** - Issue #411 → M3

---

## Implementation Sequence (Dependency-Driven)

**Phase 1 - Foundation (1 issue):**

1. #408 SQL API Repository Abstraction Layer ← **START HERE**

**Phase 2 - Container Implementations (4 issues, parallel after #408):** 2. #404 Player State Migration (PK: `/id`) 3. #405 Inventory Persistence (PK: `/playerId`) 4. #406 Description Layers Storage (PK: `/locationId`) 5. #407 World Events Timeline (PK: `/scopeKey`) ← **BLOCKS M3**

**Phase 3 - Data Migration (1 issue, after Phase 2):** 6. #410 Data Migration Script (backfill Gremlin → SQL)

**Phase 4 - Validation (1 issue, after Phase 3):** 7. #409 Dual Persistence Integration Tests (Gremlin + SQL consistency)

**Phase 5 - Infrastructure (2 issues, can parallel with Phase 2-4):**

-   #411 Partition Key Strategy Validation & Monitoring
-   #412 Dual Persistence Documentation Update

---

## Risk Flags

-   **M3 Blocker**: M3 Core Loop cannot start until #407 (World Events Timeline) complete
-   **Zero Progress**: Dual persistence cluster (7 core issues) has no completed items
-   **Focused Scope**: All non-blocking work deferred to M5; M2 is 100% dual persistence
-   **Sequential Dependencies**: #408 must complete before #404-407 can start
-   **Migration Risk**: #410 script may reveal schema issues requiring container rework
-   **Estimate**: Remaining 7 core issues ≈ 3-4 weeks (1 foundation + 4 containers + 1 migration + 1 tests)

---

## Out of Scope / Deferred

**Deferred to M5:** #256 relative direction, #318 event naming, #347 account security, #393 humor telemetry, #154–156 integrity cache/simulation/alerting, #284-286 telemetry docs/deprecation  
**Moved to M3:** #258 handlers, #313 queue correlation, #314 error normalization, #317 frontend correlation

---

**Complete (39/50):** #10, #11, #33, #41, #50, #69, #71, #79, #108, #111, #152, #153, #228-233, #257, #290, #296-309, #311-312, #315-316, #395-397 (duplicates), #403 (docs)  
**Critical Path:** #408 → (#404-407 parallel) → #410 → #409 | Infrastructure: #411, #412  
**Remaining:** 11 issues (7 core path + 2 infrastructure + 2 epic trackers)

---

## Total M2 Scope

**GitHub Milestone:** 50 issues total (4 deferred to M5 for focus)  
**Status:** 39 closed ✅, 11 open 🔨  
**Completion:** 78% (39/50)

**Phase Breakdown:**

-   Telemetry Foundation: 11/11 ✅
-   AI Cost: 10/10 ✅
-   Dashboards/Alerts: 14/14 ✅
-   Integrity Foundation: 3/3 ✅
-   Infrastructure: 1/3 (closed: #403; remaining: #411, #412)
-   **Dual Persistence: 0/7 🔨 CRITICAL PATH**
-   Miscellaneous: 0/4 → **ALL DEFERRED TO M5**

**Issues Reassigned:**

-   To M3: #258, #313, #314, #317 (event processing & frontend telemetry)
-   To M5: #154-156, #284-286 (integrity optimizations & telemetry docs), #256, #318, #347, #393 (non-blocking enhancements)

**Duplicates Closed:** #395-397 (duplicates of #154-156 in M5) ✅
