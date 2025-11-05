# M2 Observability – Decision & Action Snapshot

> Milestone: M2 Observability  
> Last Updated: 2025-11-05  
> Status: In Progress – foundations closed; versioning + description telemetry done; focus now on consolidation, cost pipeline, integrity, world events.

## 1. Current Snapshot

Closed: 20 / 64 (31%). Newly closed since prior update: #229 (versioning decision), #152 (description telemetry emission). Foundations done: #10 (registry), #79 (Gremlin RU/latency instrumentation), #71 (Gremlin health), #41 (initial correlation wiring), #257 (dead-letter storage), #33 (semantic exits), #299 (AI cost events registry), #300 (pricing & override infra), #230–#233 (API modernization batch), #281 (movement success rate dashboard), #282 (blocked reasons dashboard). Still OPEN (telemetry consolidation set): #311 (OTel removal), #312 (attribute enrichment), #315 (sampling configuration), #316 (final correlation enrichment), #353 (timing helper).

## 2. Exit Criteria (Minimum to declare M2 complete)

1. Movement success & blocked reason dashboards visible (done: #281, #282); RU/latency dashboard query surfaced (pending if separate panel not yet added).
2. Telemetry consolidation baseline INCOMPLETE – remaining: remove OTel (#311), implement attribute enrichment (#312), configure sampling (#315), finalize correlation (operationId + correlationId) (#316), implement timing helper (#353).
3. AI cost telemetry pipeline: estimation (#302) → calculator (#303) → hourly aggregation (#304) → guardrail (#305).
4. Integrity chain after description telemetry: hash baseline (#153) → cache layer (#154) → simulation harness (#155) → anomaly alerting (#156).
5. World event handlers registry functional (#258) beyond dead-letter routing.
6. API modernization complete (versioning decision #229, routes #230, client #231, tests #232, docs #233); no further blocking.
7. Health + foundational telemetry (done: #10, #79, #71, #41, #257, #33).

## 3. Remaining Critical Items

-   Telemetry consolidation tasks (#311 removal, #312 enrichment, #315 sampling, #316 correlation, #353 timing helper).
-   Cost telemetry pipeline continuation (#302–#305) – only registry (#299) + pricing infra (#300) complete.
-   World event handlers functional expansion (#258).
-   RU/latency dashboard query (if not yet deployed) & confirm dashboards completeness.
-   Integrity chain build-out (#153–#156) now that description telemetry (#152) is live.

## 4. Immediate Next Actions (ordered)

1. Complete telemetry consolidation set (#311, #312, #315, #316) + implement timing helper (#353).
2. Implement cost estimation interface (#302) then calculator (#303).
3. World event handlers registry (#258).
4. RU/latency dashboard query (panel) if missing; verify movement dashboards operational (#281, #282).
5. Integrity chain steps: hash baseline (#153) then cache (#154), simulation harness (#155), alerting (#156).
6. Cost hourly aggregation (#304) → guardrail enforcement (#305).

## 5. Decision Queue (unresolved)

-   Sampling percentage policy (env-driven vs static) (#315).
-   Correlation attribute naming standardization (operationId vs opId – finalize in #316).
-   Timing helper event classification (keep internal vs promote `Timing.Op.*`).

## 6. Defer / Non-Blocking (post‑M2 or if time remains)

Relative directions (#256); humor/promotion telemetry (#328, #329, #337); span naming taxonomy refactor (#318) (superseded by OTel removal); integrity cache/simulation/alerting (#154–#156); cost simulation & audit extras (#306–#309) beyond minimal guardrail; advanced distributed tracing (future reintroduction).

## 7. Completion Checklist (quick view)

-   [x] Registry & base telemetry (#10, #79, #71, #41)
-   [x] Dead-letter foundation (#257)
-   [x] Pricing & override infra (#300)
-   [x] Versioning decision (#229)
-   [ ] OTel removal (#311)
-   [ ] Attribute enrichment (#312)
-   [ ] App Insights sampling configured (#315)
-   [ ] Final correlation enrichment (operationId + correlationId) (#316)
-   [ ] Timing helper implementation (#353)
-   [ ] Cost estimation (#302) & calculator (#303)
-   [ ] Hourly aggregation (#304) & guardrail enforcement (#305)
-   [x] Movement dashboards (#281, #282)
-   [ ] RU/latency dashboard query (panel)
-   [x] Description telemetry start (#152)
-   [ ] Integrity chain (#153–#156)
-   [ ] World event handlers (#258)

## 8. One-Line Status

Foundations + versioning + description telemetry shipped; focus shifts to completing telemetry consolidation (OTel removal, enrichment, sampling, correlation, timing), cost pipeline, integrity chain, world event handlers, and RU/latency dashboard visibility.

---

Historical detail removed intentionally for focus. Refer to issue bodies for full acceptance criteria when implementing.
