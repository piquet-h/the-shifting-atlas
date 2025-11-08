# M2 Observability – Implementation Plan

> **Status:** 46/59 (78%) | Phase 1 🔨 Phase 2 ✅ Phase 3 🔨 | Zero blockers | Updated 2025-11-08

## Active Work

**Phase 3 (Dashboards/Alerts):** ✅ 8/10 complete (dashboards done, alerts in progress)

-   ✅ COMPLETE: #289 Performance Ops (consolidated), #283 movement, #290 RU correlation, #291 partition pressure, #296 success/failure, #292 high RU, #294 composite alert, #295 latency
-   🔨 IN PROGRESS: #293 Gremlin 429 spike detection (1 remaining)
-   📋 QUEUED: #298 workbook export automation (2 comments, ~80% ready)

**Phase 4 (Integrity):** ✅ COMPLETE (#153 hash baseline closed Nov 7)  
**Phase 5 (Polish):** #258 handlers, #284 docs, #285 deprecation ready | #297, #298 workbook automation ready  
**Phase 6-8 (Frontend, Events, Persistence):** 0/26 remaining - ready to start after Phase 3/5

**Optional remaining:** #318 event naming  
**Moved to M3:** #317, #313, #314 | **Moved to M4:** #154–#156

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

### Phase 6: Frontend Experience (0/13)

[ ] #413 game view | [ ] #414 description rendering | [ ] #415 command input  
[ ] #416 directional nav UI | [ ] #417 status panel | [ ] #418 auth flow  
[ ] #419 routing | [ ] #420 accessibility | [ ] #421 responsive layout  
[ ] #422 frontend telemetry | [ ] #423 E2E tests | [ ] #424 docs  
[ ] #347 account switching security (localStorage persistence fix)

**Epic:** #389 Frontend Player Experience

### Phase 7: World Event Processing (0/4)

[ ] #398 emission helper & correlation | [ ] #400 idempotency & deduplication  
[ ] #401 DLQ handling & retry | [ ] #402 integration tests

**Epic:** #385 World Event Processing Infrastructure  
**Note:** #403 (documentation) and #258 (type-specific handlers) in Phase 5

### Phase 8: Dual Persistence (0/9)

[ ] #404 player state migration | [ ] #405 inventory persistence  
[ ] #406 description layers storage | [ ] #407 world events timeline  
[ ] #408 repository abstraction | [ ] #409 integration tests  
[ ] #410 data migration script | [ ] #411 partition validation  
[ ] #412 documentation

**Epic:** #386 Cosmos Dual Persistence Implementation

---

## Decisions Needed

-   Alert #293 (429 spike): finalize threshold logic (needs 1 implementation cycle)
-   Dashboard threshold tuning baseline: 7 vs 14 days (#297) – defer until Phase 3 complete
-   Workbook export automation (#298): schedule after Phase 3 alerts done

---

## Defer / Out of Scope

**Optional (M2 if capacity):** #318 event naming  
**Moved to M3:** #317 frontend correlation, #313 queue correlation, #314 error normalization  
**Moved to M4:** #154–#156 integrity extras (cache, simulation, alerting) – Phase 10 in roadmap but properly sequenced after M4 layering  
**Out of Scope:** #256 relative direction, #328/#329/#337/#393 humor telemetry, #172–#174 Learn More/SEO  
**Duplicate Issues (close as duplicates):** #395–#397 (duplicates of #154–#156, which are correctly in M4)

---

**Complete:** #10, #79, #71, #41, #257, #33, #299–#300, #229–#233, #281–#282, #152, #302–#309, #311–#312, #315–#316, #353, #310, #50, #289–#290, #291–#292, #294–#296, #283, #153  
**Next:** #293 (alert), #298 (workbook export), then #285, #258, #284, #297 (polish phase), then #347, #398, #400–#424 (frontend + events + persistence)

---

## Total M2 Scope

**Original plan:** 56 implementation items (includes Epic #310 parent + 55 child/atomic issues)  
**Revised scope:** 59 implementation items (56 + 3 newly identified: #285, #347, #398)  
**Current status:** 46 complete, 13 remaining (3 moved to M4 for proper sequencing)  
**Effective M2:** 56 items (59 - 3 moved to M4)

**Missing issues now added:**

-   #285 (Deprecate Location.Move telemetry event) - Phase 1/5
-   #347 (Account switching security) - Phase 6
-   #398 (World event emission helper) - Phase 7

**Duplicate issues identified:**

-   #395-#397 are duplicates of #154-#156 (created Nov 7, should be closed)
