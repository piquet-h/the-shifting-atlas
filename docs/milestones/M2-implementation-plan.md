# M2 Observability – Implementation Plan

> **Status:** 26/33 (79%) | Phase 1 ✅ | Zero blockers | Updated 2025-11-05

## Active Work

**Phase 2 (AI Cost):** #303 cost calculator → #304 aggregation → #305 guardrails  
**Phase 3 (Dashboards/Alerts):** 5 dashboards + 4 alerts (all parallel after dashboards)  
**Phase 4 (Integrity):** #153 hash baseline only  
**Phase 5 (Polish):** #258 handlers, #284 docs (both ready)

**Deferred in M2:** #318, #306–#309, #297–#298 (if capacity allows)  
**Moved to M3:** #317, #313, #314 | **Moved to M4:** #154–#156

---

## Phase Details

### Phase 1: Telemetry Foundation ✅ COMPLETE
[x] #311 OTel removal | [x] #312 attributes | [x] #315 sampling | [x] #316 correlation | [x] #353 timing

### Phase 2: AI Cost (1/4 – Sequential)
[x] #302 token estimator | [ ] #303 calculator | [ ] #304 aggregation | [ ] #305 guardrails

### Phase 3: Dashboards/Alerts (0/9 – Parallel dashboards, then alerts)
**Dashboards:** #289 RU/latency | #290 correlation | #291 partition | #296 success/RU | #283 movement  
**Alerts:** #292 high RU | #293 429s | #294 partition | #295 latency

### Phase 4: Integrity (0/1)
[ ] #153 hash baseline

### Phase 5: Polish (0/4)
[ ] #258 handlers (ready) | [ ] #284 docs (ready) | #297 tuning (needs Phase 3) | #298 export (needs Phase 3)

---

## Decisions Needed

- Dashboard deployment: simultaneous or stagger (suggest #289 first)
- Threshold tuning baseline: 7 vs 14 days (#297)

---

## Defer / Out of Scope

**Optional (M2 if capacity):** #318 event naming, #306–#309 cost extras, #297 tuning, #298 export  
**Moved to M3:** #317 frontend correlation, #313 queue correlation, #314 error normalization  
**Moved to M4:** #154–#156 integrity extras  
**Out of Scope:** #256 relative direction, #328/#329/#337 humor telemetry, #172–#174 Learn More/SEO

---

**Complete:** #10, #79, #71, #41, #257, #33, #299, #300, #229–#233, #281–#282, #152, #311–#312, #315–#316, #353, #302  
**Next:** #303 → #304 → #305 (sequential) | Phase 3 dashboards (parallel) | #153, #258, #284 (independent)
