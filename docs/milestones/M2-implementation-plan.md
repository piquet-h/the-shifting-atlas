# M2 Observability – Implementation Plan

> **Status:** 33/58 (57%) | Phase 1 ✅ Phase 2 ✅ | Zero blockers | Updated 2025-11-07

## Active Work

**Phase 2 (AI Cost):** ✅ COMPLETE (all 4 core + epic #50 + extras #306–#309 closed Nov 6)  
**Phase 3 (Dashboards/Alerts):** #377 consolidates 4 panels (draft PR); #283 + 4 alerts remain  
**Phase 4 (Integrity):** #153 hash baseline ready  
**Phase 5 (Polish):** #258 handlers, #284 docs ready | #297, #298 deferred (need Phase 3)

**Optional remaining:** #318 event naming  
**Moved to M3:** #317, #313, #314 | **Moved to M4:** #154–#156

---

## Phase Details

### Phase 1: Telemetry Foundation ✅ COMPLETE

[x] #311 OTel removal | [x] #312 attributes | [x] #315 sampling | [x] #316 correlation | [x] #353 timing

### Phase 2: AI Cost ✅ COMPLETE (4/4 core + epic + extras)

[x] #302 token estimator | [x] #303 calculator | [x] #304 aggregation | [x] #305 guardrails  
[x] #50 epic | [x] #306 simulation | [x] #307 docs | [x] #308 tests | [x] #309 audit

### Phase 3: Dashboards/Alerts (0/6 – Consolidated dashboards, then alerts)

**Dashboards:** #289 Performance Ops (parent: #290, #291, #296 children + own panel) | #283 movement  
**Alerts:** #292 high RU | #293 429s | #294 partition | #295 latency

_Note: #289 consolidates four related panels into single Performance Operations Dashboard workbook (MECE pattern). Implementation PR: #377_

### Phase 4: Integrity (0/1)

[ ] #153 hash baseline

### Phase 5: Polish (0/2 ready)

[ ] #258 handlers | [ ] #284 docs | (#297, #298 need Phase 3)

---

## Decisions Needed

-   Dashboard deployment: simultaneous or stagger (suggest #289 first)
-   Threshold tuning baseline: 7 vs 14 days (#297)

---

## Defer / Out of Scope

**Optional (M2 if capacity):** #318 event naming  
**Moved to M3:** #317 frontend correlation, #313 queue correlation, #314 error normalization  
**Moved to M4:** #154–#156 integrity extras  
**Out of Scope:** #256 relative direction, #328/#329/#337 humor telemetry, #172–#174 Learn More/SEO

---

**Complete:** #10, #79, #71, #41, #257, #33, #299–#300, #229–#233, #281–#282, #152, #302–#309, #311–#312, #315–#316, #353, #50  
**Next:** Phase 3 dashboards (all parallel) | #153, #258, #284 (independent)
