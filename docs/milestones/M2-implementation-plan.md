# M2 Observability – Implementation Plan

> **Status:** 45/58 (78%) | Phase 1 ✅ Phase 2 ✅ Phase 3 🔨 | Zero blockers | Updated 2025-11-08

## Active Work

**Phase 3 (Dashboards/Alerts):** ✅ 8/10 complete (dashboards done, alerts in progress)

-   ✅ COMPLETE: #289 Performance Ops (consolidated), #283 movement, #290 RU correlation, #291 partition pressure, #296 success/failure, #292 high RU, #294 composite alert, #295 latency
-   🔨 IN PROGRESS: #293 Gremlin 429 spike detection (1 remaining)
-   📋 QUEUED: #298 workbook export automation (2 comments, ~80% ready)

**Phase 4 (Integrity):** ✅ COMPLETE (#153 hash baseline closed Nov 7)  
**Phase 5 (Polish):** #258 handlers, #284 docs ready | #297, #298 workbook automation ready

**Optional remaining:** #318 event naming  
**Moved to M3:** #317, #313, #314 | **Moved to M4:** #154–#156

---

## Phase Details

### Phase 1: Telemetry Foundation ✅ COMPLETE (5/5)

[x] #311 OTel removal | [x] #312 attributes | [x] #315 sampling | [x] #316 correlation | [x] #353 timing

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

### Phase 5: Polish (0/4 ready)

[ ] #258 dead-letter handlers | [ ] #284 observability docs consolidation | (#297 threshold tuning, #298 workbook automation need Phase 3)

---

## Decisions Needed

-   Alert #293 (429 spike): finalize threshold logic (needs 1 implementation cycle)
-   Dashboard threshold tuning baseline: 7 vs 14 days (#297) – defer until Phase 3 complete
-   Workbook export automation (#298): schedule after Phase 3 alerts done

---

## Defer / Out of Scope

**Optional (M2 if capacity):** #318 event naming  
**Moved to M3:** #317 frontend correlation, #313 queue correlation, #314 error normalization  
**Moved to M4:** #154–#156 integrity extras (cache, simulation, alerting)  
**Out of Scope:** #256 relative direction, #328/#329/#337 humor telemetry, #172–#174 Learn More/SEO

---

**Complete:** #10, #79, #71, #41, #257, #33, #299–#300, #229–#233, #281–#282, #152, #302–#309, #311–#312, #315–#316, #353, #50, #289–#290, #291–#292, #294–#296, #283, #153  
**Next:** #293 (alert), #298 (workbook export), then #258, #284, #297 (polish phase)
