# M2 Observability – Decision & Action Snapshot

> Milestone: M2 Observability  
> Last Updated: 2025-11-04  
> Status: In Progress – foundations closed; focus on enrichment, cost, versioning.

## 1. Current Snapshot

Closed: 13 / 64 (20%). Newly closed since prior update: #230 (backend routes), #231 (frontend client), #232 (integration tests), #233 (API docs), #300 (pricing & override infra). Foundations done: #10, #79, #71, #41, #257, #33, #299, #300. API modernization (Epic #228) complete.

## 2. Exit Criteria (Minimum to declare M2 complete)

1. Dashboard query for move success rate & RU/latency visible.
2. Tracing enrichment baseline: exporter (#311), attributes (#312), sampling (#315), event correlation (#316).
3. AI cost telemetry: estimation (#302) → calculator (#303) → hourly aggregation (#304) → guardrail (#305).
4. API modernization (already done: #228 epic, #230–#233 closed; #229 not needed).
5. Health + foundational telemetry (already done).

## 3. Remaining Critical Items

-   Cost telemetry pipeline (#302–#305) – currently only registry + pricing infra done.
-   Tracing exporter & sampling (#311, #315) – required before correlation (#316) is meaningful.
-   World event handlers (#258) – moves from validation-only to functional processing.
-   Description telemetry start (#152) – prerequisite for integrity chain (#153–#156).

## 4. Immediate Next Actions (ordered)

1. Implement exporter + sampling together (#311 + #315) for span volume insight.
2. Cost estimation interface (#302) then calculator (#303).
3. Event correlation enhancement (#316) once exporter live.
4. Description telemetry emission (#152) → hash baseline (#153).
5. World event handlers registry (#258).

## 5. Decision Queue (unresolved)

-   Exporter choice: Azure Monitor vs OTLP endpoint (default to Azure Monitor if credentials available).
-   Sampling default ratio for production (proposed 0.15 – confirm after initial data).

## 6. Defer / Non-Blocking (post‑M2 or if time remains)

Relative directions (#256); humor/promotion telemetry (#328, #329, #337); span naming taxonomy refactor (#318); integrity cache/simulation/alerting (#154–#156); cost simulation & audit extras (#306–#309) beyond minimal guardrail.

## 7. Completion Checklist (quick view)

-   [x] Registry & base telemetry (#10, #79, #71, #41)
-   [x] Dead-letter foundation (#257)
-   [x] Pricing & override infra (#300)
-   [x] API modernization (Epic #228: #230–#233 complete; #229 not needed)
-   [ ] Exporter + sampling (#311, #315)
-   [ ] Cost estimation → aggregation → guardrail (#302–#305)
-   [ ] Event correlation span IDs (#316)
-   [ ] Move success rate + RU/latency dashboard query
-   [ ] Description telemetry start (#152)
-   [ ] World event handlers (#258)

## 8. One-Line Status

Foundations locked; milestone success now hinges on tracing exporter/sampling, cost aggregation path, and initial description + world event processing layers.

---

Historical detail removed intentionally for focus. Refer to issue bodies for full acceptance criteria when implementing.
