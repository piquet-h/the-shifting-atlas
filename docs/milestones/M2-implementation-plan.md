# M2 Observability – Decision & Action Snapshot

> Milestone: M2 Observability  
> Last Updated: 2025-11-04  
> Status: In Progress – foundations closed; focus on enrichment, cost, versioning.

## 1. Current Snapshot

Closed: 13 / 64 (20%). Newly closed since prior update: #230 (backend routes), #231 (frontend client), #232 (integration tests), #233 (API docs), #300 (pricing & override infra). Foundations done: #10, #79, #71, #41, #257, #33, #299, #300. API modernization (Epic #228) complete.

## 2. Exit Criteria (Minimum to declare M2 complete)

1. Dashboard query for move success rate & RU/latency visible.
2. Telemetry consolidation baseline: OTel removal (#311), attributes (#312), App Insights sampling configuration (#315), event correlation (operationId + correlationId) (#316).
3. AI cost telemetry: estimation (#302) → calculator (#303) → hourly aggregation (#304) → guardrail (#305).
4. API modernization (already done: #228 epic, #230–#233 closed; #229 not needed).
5. Health + foundational telemetry (already done).

## 3. Remaining Critical Items

-   Cost telemetry pipeline (#302–#305) – currently only registry + pricing infra done.
-   OTel removal & consolidation (#311) – prerequisite before sampling adjustment (#315) & correlation enrichment (#316).
-   App Insights sampling configuration (#315) – set % and verify volume.
-   Event correlation enrichment (operationId + correlationId in game events) (#316).
-   World event handlers (#258) – moves from validation-only to functional processing.
-   Description telemetry start (#152) – prerequisite for integrity chain (#153–#156).
-   (New) Timing helper enhancement (#353) – optional latency granularity without spans.

## 4. Immediate Next Actions (ordered)

1. Decide & document versioning (#229).
2. Remove partial OTel tracing (#311) then configure sampling (#315).
3. Inject operationId + correlationId into domain events (#316).
4. Cost estimation interface (#302) then calculator (#303).
5. Description telemetry emission (#152) → hash baseline (#153).
6. World event handlers registry (#258).
7. Implement timing helper (#353) if extra latency granularity still needed.

## 5. Decision Queue (unresolved)

-   Sampling default ratio for production (proposed 0.15 – confirm after initial data).
-   Versioning prefix final form (`/api/v1/` vs `/v1/`) + deprecation window for legacy routes.
-   Whether timing helper is required pre‑M2 exit or can defer.

## 6. Defer / Non-Blocking (post‑M2 or if time remains)

Relative directions (#256); humor/promotion telemetry (#328, #329, #337); span naming taxonomy refactor (#318) (superseded by OTel removal); integrity cache/simulation/alerting (#154–#156); cost simulation & audit extras (#306–#309) beyond minimal guardrail; advanced distributed tracing (future reintroduction).

## 7. Completion Checklist (quick view)

-   [x] Registry & base telemetry (#10, #79, #71, #41)
-   [x] Dead-letter foundation (#257)
-   [x] Pricing & override infra (#300)
-   [ ] Versioning decision (#229)
-   [ ] OTel removal & consolidation (#311)
-   [ ] App Insights sampling configured (#315)
-   [ ] Event correlation (operationId + correlationId) (#316)
-   [ ] Cost estimation → aggregation → guardrail (#302–#305)
-   [ ] Move success rate + RU/latency dashboard query
-   [ ] Description telemetry start (#152)
-   [ ] World event handlers (#258)
-   [ ] (Optional) Timing helper (#353) – mark complete if implemented

## 8. One-Line Status

Foundations locked; milestone success now hinges on versioning decision, consolidation (OTel removal + sampling), cost aggregation path, correlation enrichment, and initial description + world event processing layers.

---

Historical detail removed intentionally for focus. Refer to issue bodies for full acceptance criteria when implementing.
