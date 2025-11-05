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

## 3. Implementation Plan (Dependency-Ordered Phases)

### Phase 1: Telemetry Foundation Completion (Critical Path)

**Goal:** Remove obsolete tracing code, enrich events with domain attributes, enable sampling, finalize correlation identifiers, add timing helpers.

**Dependencies:** Must complete #311 before #312/#316 to avoid pattern conflicts.

**Issues (Sequence):**

1. **#311 OTel Removal** (BLOCKING) – Remove `backend/src/instrumentation/opentelemetry.ts`, purge dependencies, switch fully to Application Insights single mode; establishes clean telemetry foundation.
2. **#312 Attribute Enrichment** (parallel after #311) – Add domain attributes (game.player.id, game.location.id, game.event.type) to events for queryability.
3. **#315 Sampling Configuration** (parallel after #311) – Configure Application Insights sampling (env-driven APPINSIGHTS_SAMPLING_PERCENTAGE, default 15% prod / 100% dev).
4. **#316 Correlation Finalization** (after #311) – Enrich events with operationId (from AI context when available) + correlationId for cross-request joins.
5. **#353 Timing Helper** (parallel after #311) – Implement operation duration event emission helper.

**Parallel Work:** #315 and #353 can proceed alongside #312 after #311 completes.

**Rationale:** Removing OTel (#311) first prevents duplicate pattern injection and simplifies correlation wiring. Enrichment, sampling, and correlation additive once OTel eliminated.

---

### Phase 2: AI Cost Telemetry Pipeline (Sequential Chain)

**Goal:** Enable projected AI spend visibility before real AI integration via simulation + guardrails.

**Dependencies:** Sequential chain: #302 → #303 → #304 → #305 (each depends on previous).

**Issues (Sequence):**

1. **#302 Token Estimation Strategy** – Define interface and heuristic-based estimator (char count, prompt templates) for projected token usage.
2. **#303 Cost Calculator & Emission** (after #302) – Use estimator output + pricing table (#300 done) to compute micros; emit AI.Inference.Cost events.
3. **#304 Hourly Aggregation** (after #303) – Roll up cost events into hourly window summaries with correlationId grouping.
4. **#305 Soft Guardrails** (after #304) – Enforce threshold alerts (hourly & daily) based on aggregated cost; log warnings when limits approached.

**Rationale:** Estimator provides input interface for calculator; calculator produces events for aggregation; aggregation feeds guardrail enforcement. Cannot parallelize without breaking dependency chain.

---

### Phase 3: Observability Dashboards & Alerts (Parallel + Sequential)

**Goal:** Visualize RU/latency performance, partition pressure, and movement metrics; configure alerting.

**Dependencies:** Dashboards require #10 (registry) + #79 (RU/latency telemetry) both CLOSED; alerts depend on dashboards being deployed for threshold baseline.

**Issues (Parallel within subgroups):**

**3a. Dashboards (All Parallel):**

-   **#289 Gremlin Operation RU & Latency Overview** – Table: operation, Calls, AvgRU, MaxRU, P50/P95/P99 latencyMs.
-   **#290 RU vs Latency Correlation Panel** – Scatter plot + Pearson correlation coefficient to detect pressure-induced slowdowns.
-   **#291 Partition Pressure Trend** – Time-series RU% (derived from ruCharge / MAX_RU_PER_INTERVAL) + 429 overlay + threshold bands (70%/80%).
-   **#296 Operation Success/Failure Rate & RU Cost Table** – Success/failure rate + RU cost efficiency per operation.
-   **#283 Movement Latency Distribution** – P50/P95/P99 latency percentiles for Navigation.Move.Success + Navigation.Move.Blocked events (completed after #281/#282).

**3b. Alerts (Sequential after dashboards):**

-   **#292 Sustained High RU** – Fire when RU% >70% for 3 consecutive 5-min intervals.
-   **#293 429 Spike Detection** – Fire on >=5 429s in 5-min window below baseline RPS.
-   **#294 Composite Partition Pressure** – Multi-signal alert: RU% >70% AND 429s >=3 AND P95 latency increase >25% vs 24h baseline.
-   **#295 Latency Degradation** – Fire when P95 latency >600ms for 3 consecutive 10-min windows across core operations.

**Rationale:** Dashboards provide visibility and baseline data; alerts require dashboards deployed to compute thresholds and historical baselines. All dashboards can be built in parallel since they query same telemetry sources (#10, #79). Alerts sequential because composite alert (#294) references individual alerts (#292, #293) for correlation logic.

---

### Phase 4: Description Integrity Chain (Sequential)

**Goal:** Detect description corruption via hashing, caching, simulation, and alerting.

**Dependencies:** Sequential chain: #153 → #154 → #155 → #156 (each builds on previous).

**Issues (Sequence):**

1. **#153 Hash Baseline Job** – Compute and store integrity hashes for existing descriptions; provides baseline for validation.
2. **#154 Cache Layer** (after #153) – LRU cache for recent hashes to reduce recomputation overhead.
3. **#155 Simulation Harness** (after #153) – Inject controlled corruption scenarios (truncate, mutate) to validate detection pathways.
4. **#156 Anomaly Alerting** (after #153) – Detection rules (hash mismatch, repeated failures) with throttled alert emission.

**Rationale:** Hash computation (#153) must complete before cache (#154) has data to store, before simulation (#155) has baseline to corrupt, and before alerting (#156) has mismatches to detect. Logical dependency chain prevents premature implementation.

---

### Phase 5: World Events & Final Polish (Parallel + Meta)

**Goal:** Enable type-specific world event processing; finalize documentation, threshold tuning, workbook automation.

**Dependencies:** #258 independent; #297 requires 7-day data collection after dashboards deployed; #298 requires dashboards created first; #284 can proceed anytime.

**Issues (Mostly Parallel):**

-   **#258 World Event Handlers** – Type-specific payload processing beyond envelope validation (e.g., PlayerMoveHandler, ExitCreateHandler).
-   **#284 Telemetry Catalog Docs** – Update docs/observability/telemetry-catalog.md with Navigation.Move.Success/Blocked, dashboard recommendations, event dimensions.
-   **#297 Threshold Tuning** – Post-baseline (7-day data collection) review and adjust RU/latency alert thresholds; execute AFTER Phase 3 dashboards gather baseline.
-   **#298 Workbook Export Automation** – Automate workbook JSON export for dashboard provisioning; execute AFTER Phase 3 dashboards created.

**Rationale:** #258 unblocked by earlier work (dead-letter #257 done). #297 and #298 explicitly wait for Phase 3 dashboard deployment to gather data or reference workbook artifacts. #284 documentation can proceed independently.

## 4. Decision Queue (Unresolved)

-   **Sampling percentage policy** (#315) – env-driven vs static; recommend APPINSIGHTS_SAMPLING_PERCENTAGE with defaults (15% prod, 100% dev).
-   **Correlation attribute naming** (#316) – operationId vs opId; recommend operationId for consistency with Application Insights native tags.
-   **Timing helper event classification** (#353) – keep internal helper-only vs promote `Timing.Op.*` event names; recommend internal initially (avoid telemetry noise).
-   **Dashboard deployment sequence** (Phase 3) – determine whether to deploy all 5 dashboards (#289, #290, #291, #296, #283) simultaneously or stagger by priority (RU/latency overview #289 first).
-   **Threshold tuning baseline duration** (#297) – confirm 7-day data collection sufficient before threshold adjustment; may extend to 14 days if traffic low.

## 5. Defer / Non-Blocking (post‑M2 or if time remains)

**Phase 1 Optional Enhancements:**

-   Event naming consistency refactor (#318) – superseded by OTel removal; defer unless drift becomes severe.
-   Frontend correlation headers (#317) – enables client-side correlation; defer until backend consolidation stable.
-   Queue message correlationId injection (#313) – additive correlation improvement; defer if capacity limited.
-   Error telemetry normalization (#314) – standardizes error classification; defer if error volume manageable.

**Phase 2 Optional Enhancements:**

-   Cost simulation harness (#306) – stress-test cost calculator; defer to post-M2 unless guardrail tuning requires.
-   Cost documentation section (#307) – expand observability docs with AI cost methodology; defer until pipeline proven.
-   Cost test consolidation (#308) – refactor test suite for coverage; defer to tech debt cleanup.
-   Cost PII/payload audit (#309) – security validation; defer unless data leak risk identified.

**Phase 3 Optional Enhancements:**

-   Alert tuning (#297) requires 7–14 day baseline; execute post-dashboard deployment only if capacity allows.
-   Workbook export automation (#298) – streamlines dashboard provisioning; defer if manual export acceptable.

**Phase 4 Optional Enhancements:**

-   Integrity cache layer (#154) – performance optimization; defer unless hash computation latency problematic.
-   Corruption simulation harness (#155) – validation tooling; defer unless anomaly detection unreliable.
-   Anomaly alerting logic (#156) – automated mismatch detection; defer unless manual monitoring sufficient.

**Out of Scope (M3+):**

-   Relative direction support (#256) – traversal UX enhancement; blocked by #33 semantic exits.
-   Humor/promotion telemetry (#328, #329, #337) – feature-specific observability; deferred to M6+ milestones.
-   Roadmap embedding component (#173) – Learn More page feature; low priority vs core telemetry.
-   Learn More content regeneration (#172) – automation for public-facing page; defer indefinitely.
-   SEO & analytics instrumentation (#174) – frontend discoverability; defer to marketing phase.

**Rationale:** Prioritize critical path (Phases 1–3 core items) + essential integrity chain (#153 baseline only) + world handlers (#258). Optional enhancements deferred unless blocking production observability or creating operational risk.

## 6. Completion Checklist (Organized by Phase)

**Foundations (Closed):**

-   [x] Registry & base telemetry (#10, #79, #71, #41)
-   [x] Dead-letter foundation (#257)
-   [x] Pricing & override infra (#300)
-   [x] Versioning decision (#229)
-   [x] Movement dashboards (#281, #282)
-   [x] Description telemetry emission (#152)

**Phase 1: Telemetry Foundation Completion**

-   [ ] OTel removal (#311) – BLOCKING
-   [ ] Attribute enrichment (#312)
-   [ ] App Insights sampling configured (#315)
-   [ ] Final correlation enrichment (operationId + correlationId) (#316)
-   [ ] Timing helper implementation (#353)

**Phase 2: AI Cost Telemetry Pipeline**

-   [ ] Token estimation strategy (#302)
-   [ ] Cost calculator & emission (#303)
-   [ ] Hourly aggregation (#304)
-   [ ] Guardrail enforcement (#305)

**Phase 3: Dashboards & Alerts**

-   [ ] Gremlin Operation RU & Latency Overview (#289)
-   [ ] RU vs Latency Correlation Panel (#290)
-   [ ] Partition Pressure Trend (#291)
-   [ ] Operation Success/Failure Rate & RU Cost Table (#296)
-   [ ] Movement Latency Distribution (#283)
-   [ ] Sustained High RU Alert (#292)
-   [ ] 429 Spike Detection Alert (#293)
-   [ ] Composite Partition Pressure Alert (#294)
-   [ ] Latency Degradation Alert (#295)

**Phase 4: Integrity Chain (Essential: #153 only; rest deferred)**

-   [ ] Integrity hash baseline job (#153)
-   [ ] Cache layer (#154) – DEFERRED
-   [ ] Simulation harness (#155) – DEFERRED
-   [ ] Anomaly alerting (#156) – DEFERRED

**Phase 5: World Events & Polish**

-   [ ] World event type-specific handlers (#258)
-   [ ] Telemetry catalog docs (#284)
-   [ ] Threshold tuning post-baseline (#297) – DEFERRED
-   [ ] Workbook export automation (#298) – DEFERRED

## 7. One-Line Status

**Foundations complete (20/64 closed, 31%); execution now phased: (1) Telemetry consolidation (OTel removal BLOCKING #311 → enrichment/sampling/correlation/timing), (2) AI cost pipeline (sequential #302→#303→#304→#305), (3) RU/latency dashboards + alerts (parallel dashboards → sequential alerts), (4) Integrity hash baseline (#153 only, rest deferred), (5) World handlers + docs polish (#258, #284).** Critical path: Phase 1 (#311) unblocks rest of consolidation; Phase 2 and Phase 3 can parallel Phase 1 completion; Phase 4 minimal (hash only); Phase 5 cleanup. Defer optional enhancements (#154–#156 integrity extras, #306–#309 cost extras, #297/#298 tuning/automation) to post-M2 unless capacity remains.

---

Historical detail removed intentionally for focus. Refer to issue bodies for full acceptance criteria when implementing.
