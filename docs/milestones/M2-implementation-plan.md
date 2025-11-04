# M2 Observability – Decision & Action Snapshot

> Milestone: M2 Observability  
> Last Updated: 2025-11-04  
> Status: In Progress – foundations closed; focus on enrichment, cost, versioning.

## 1. Current Snapshot

Closed: 17 / 64 (27%). Newly closed since prior update: #230 (backend routes), #231 (frontend client), #232 (integration tests), #233 (API docs), #300 (pricing & override infra), #311 (OTel removal & consolidation), #315 (App Insights sampling configuration), #316 (event correlation enrichment), #353 (timing helper). Foundations done: #10, #79, #71, #41, #257, #33, #299, #300. API modernization (Epic #228) complete.

## 2. Exit Criteria (Minimum to declare M2 complete)

1. Dashboard query for move success rate & RU/latency visible.
2. Telemetry consolidation baseline: COMPLETE – OTel removed (#311), attributes alignment (#312), App Insights sampling configured (#315), event correlation (operationId + correlationId) (#316).
3. AI cost telemetry: estimation (#302) → calculator (#303) → hourly aggregation (#304) → guardrail (#305).
4. API modernization (already done: #228 epic, #230–#233 closed; #229 not needed).
5. Health + foundational telemetry (already done).

## 3. Remaining Critical Items

-   Versioning decision (#229) – still pending (blocks announcing stability of telemetry endpoint names).
-   Cost telemetry pipeline (#302–#305) – currently only registry + pricing infra done.
-   World event handlers (#258) – moves from validation-only to functional processing.
-   Description telemetry start (#152) – prerequisite for integrity chain (#153–#156).
-   Move success rate + RU/latency dashboard query (metrics surfacing).
-   Aggregate + guardrail cost telemetry (#304–#305).

## 4. Immediate Next Actions (ordered)

1. Decide & document versioning (#229).
2. Cost estimation interface (#302) then calculator (#303).
3. Description telemetry emission (#152) → hash baseline (#153).
4. World event handlers registry (#258).
5. Move success rate + RU/latency dashboard query implementation.
6. Aggregate + guardrail cost telemetry (#304–#305).

## 5. Decision Queue (unresolved)

-   Versioning prefix final form (`/api/v1/` vs `/v1/`) + deprecation window for legacy routes.
-   Whether timing helper granularity warrants additional event taxonomy or remains internal-only (currently internal only, likely stable).

## 6. Defer / Non-Blocking (post‑M2 or if time remains)

Relative directions (#256); humor/promotion telemetry (#328, #329, #337); span naming taxonomy refactor (#318) (superseded by OTel removal); integrity cache/simulation/alerting (#154–#156); cost simulation & audit extras (#306–#309) beyond minimal guardrail; advanced distributed tracing (future reintroduction).

## 7. Completion Checklist (quick view)

-   [x] Registry & base telemetry (#10, #79, #71, #41)
-   [x] Dead-letter foundation (#257)
-   [x] Pricing & override infra (#300)
-   [ ] Versioning decision (#229)
-   [x] OTel removal & consolidation (#311)
-   [x] App Insights sampling configured (#315)
-   [x] Event correlation (operationId + correlationId) (#316)
-   [ ] Cost estimation → aggregation → guardrail (#302–#305)
-   [ ] Move success rate + RU/latency dashboard query
-   [ ] Description telemetry start (#152)
-   [ ] World event handlers (#258)
-   [x] Timing helper (#353)

## 8. One-Line Status

Foundations locked; telemetry consolidation (OTel removal, sampling, correlation, timing helper) complete. Milestone success now hinges on versioning decision, cost aggregation path, description + world event processing layers, and surfacing move success & RU/latency metrics.

---

Historical detail removed intentionally for focus. Refer to issue bodies for full acceptance criteria when implementing.
