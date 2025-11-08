# M2 Data Foundations – Implementation Plan

> **Status:** 38/50 (76%) | Telemetry ✅ Dual Persistence 🔨 | Critical Path: #408→#404-407→#409 | Updated 2025-11-09

## Active Work

**CRITICAL PATH: Dual Persistence Implementation** (0/9 complete, blocks M3)

-   📋 FOUNDATION: #408 SQL API Repository Abstraction (prerequisite for all below)
-   📋 PERSISTENCE: #404 Player State, #405 Inventory, #406 Description Layers, #407 World Events Timeline
-   📋 MIGRATION: #410 Data Migration Script (Gremlin → SQL)
-   📋 VALIDATION: #409 Integration Tests
-   📋 DOCS: #403 Architecture docs, #412 ADR updates

**Telemetry & Observability:** ✅ COMPLETE (38/38)

-   Phase 1 (Foundation): #10, #11, #41, #79, #311, #312, #315, #316 ✅
-   Phase 2 (AI Cost): #50, #299-309 ✅
-   Phase 3 (Dashboards/Alerts): #283, #289-298 ✅
-   Duplicates closed: #395-397 (duplicates of #154-156 in M5) ✅

**Integrity Foundation:** (3/3 complete)

-   #69 Epic (umbrella) ✅
-   #152 Description telemetry events ✅
-   #153 Integrity hash computation ✅

**Remaining M2 Scope:** (0 non-blocking issues — all deferred to M5)

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

## Decisions Needed

-   **Dual Persistence Sequencing**: Start with #408 (abstraction layer) before container-specific implementations
-   **Migration Strategy**: Determine if #410 (data migration) runs before or after container implementations (#404-407)
-   **Testing Approach**: Integration tests (#409) should cover both Gremlin + SQL consistency

---

## Risk Flags

-   **Critical Path Blocked**: M3 Core Loop cannot start until #407 (World Events Timeline) complete
-   **Zero Progress**: Dual persistence cluster (9 issues) has no completed items
-   **Focused Scope**: All non-blocking issues (#256, #318, #347, #393) deferred to M5 to accelerate dual persistence
-   **Estimate Drift**: Original 4-6 week M2 estimate may be optimistic given 0/9 progress on core work
-   **Dependency Uncertainty**: #410 migration script may reveal schema issues requiring rework

---

## Out of Scope / Deferred

**Deferred to M5:** #256 relative direction, #318 event naming, #347 account security, #393 humor telemetry, #154–156 integrity cache/simulation/alerting, #284-286 telemetry docs/deprecation  
**Moved to M3:** #258 handlers, #313 queue correlation, #314 error normalization, #317 frontend correlation

---

**Complete (38/50):** #10, #11, #33, #41, #50, #69, #71, #79, #108, #111, #152, #153, #228-233, #257, #290, #296-309, #311-312, #315-316, #395-397 (duplicates)  
**Next Critical Path:** #408 (SQL abstraction) → #404-407 (container implementations) → #409 (tests) → #410 (migration)  
**Remaining:** 12 issues total, 9 dual persistence + 3 infrastructure/docs (#403, #411, #412)

---

## Total M2 Scope

**GitHub Milestone:** 50 issues total (4 deferred to M5 for focus)  
**Status:** 38 closed ✅, 12 open 🔨  
**Completion:** 76% (38/50)

**Phase Breakdown:**

-   Phase 1 (Telemetry Foundation): 11/11 ✅
-   Phase 2 (AI Cost): 10/10 ✅
-   Phase 3 (Dashboards/Alerts): 14/14 ✅
-   Phase 4 (Dual Persistence): 0/9 🔨 **CRITICAL PATH**
-   Phase 5 (Integrity Foundation): 3/3 ✅
-   Phase 6 (Miscellaneous): 0/4 → **ALL DEFERRED TO M5**

**Issues Reassigned:**

-   To M3: #258, #313, #314, #317 (event processing & frontend telemetry)
-   To M5: #154-156, #284-286 (integrity optimizations & telemetry docs), #256, #318, #347, #393 (non-blocking enhancements)

**Duplicates Closed:** #395-397 (duplicates of #154-156 in M5) ✅
