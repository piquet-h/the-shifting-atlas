# M2 Observability – Implementation Plan & Progress

> **Milestone:** M2 Observability  
> **Exit Criteria:** Dashboards show move success rate & RU/latency for key ops; visibility page live  
> **Status:** IN PROGRESS (Foundational telemetry complete; AI cost epic decomposed, health check live) | **Created:** 2025-10-30 | **Last Updated:** 2025-10-31

---

## Executive Summary

M2's **observability scope** ensures visibility into core loop performance, cost controls, and operational health before introducing AI variability in M3. Two foundational issues (#10 Telemetry Registry, #79 Gremlin RU/Latency) are now closed, unlocking subsequent health, trace, and cost tracks.

**MVP Critical Path (status):**

1. Core telemetry expansion (registry, RU/latency wrappers) – **DONE** (#10, #79)
2. Health checks and operational visibility – **DONE** (#71)
3. Cost monitoring and guardrails – **PENDING** (#50)
4. API modernization (RESTful patterns) – **PENDING** (#228–#233 sequence)

**52 Total Issues (4 closed, 48 open):** Mix of telemetry infrastructure, health checks (now implemented), API refactoring, cost telemetry (epic #50 + children), and description integrity monitoring.

---

## Current Issues Overview (52 Total / 4 Closed)

### Foundation: Telemetry & Observability Core

| Issue | Title                                            | Scope         | Type        | Priority | Dependencies |
| ----- | ------------------------------------------------ | ------------- | ----------- | -------- | ------------ |
| #10   | Telemetry Event Registry Expansion (CLOSED)      | observability | feature     | High     | None         |
| #79   | Capture Gremlin RU + latency telemetry (CLOSED)  | observability | enhancement | High     | #10          |
| #41   | Application Insights Correlation & OpenTelemetry | observability | infra       | Medium   | #10          |
| #50   | Epic: AI Cost Telemetry & Budget Guardrails      | observability | epic        | Medium   | #10          |

### Health & Monitoring

| Issue | Title                                  | Scope         | Type    | Priority | Dependencies |
| ----- | -------------------------------------- | ------------- | ------- | -------- | ------------ |
| #71   | Gremlin Health Check Function (CLOSED) | observability | feature | High     | #79          |

### Description Integrity (Epic #69)

| Issue | Title                                   | Scope         | Type        | Priority | Dependencies |
| ----- | --------------------------------------- | ------------- | ----------- | -------- | ------------ |
| #69   | Epic: Description Telemetry & Integrity | observability | epic        | Medium   | #10          |
| #152  | Description Telemetry Events Emission   | observability | feature     | Medium   | #69, #10     |
| #153  | Integrity Hash Computation Job          | observability | feature     | Medium   | #69, #152    |
| #154  | Integrity Cache Layer                   | observability | enhancement | Low      | #69, #153    |
| #155  | Corruption Simulation Harness           | observability | test        | Low      | #69, #153    |
| #156  | Integrity Anomaly Alerting Logic        | observability | feature     | Low      | #69, #153    |

### API Modernization (Epic #228)

| Issue | Title                                   | Scope | Type        | Priority | Dependencies |
| ----- | --------------------------------------- | ----- | ----------- | -------- | ------------ |
| #228  | Epic: RESTful API URL Pattern Migration | core  | epic        | Medium   | None         |
| #229  | API Versioning Strategy & Route Prefix  | core  | docs        | High     | #228         |
| #230  | Backend Route Pattern Migration         | core  | enhancement | High     | #228, #229   |
| #231  | Frontend API Client Updates             | core  | enhancement | High     | #228, #230   |
| #232  | Integration Tests for RESTful Endpoints | core  | test        | Medium   | #228, #230   |
| #233  | API Documentation Updates               | core  | docs        | Medium   | #228, #229   |

### DevX & Quality

| Issue | Title                                       | Scope | Type        | Priority | Dependencies |
| ----- | ------------------------------------------- | ----- | ----------- | -------- | ------------ |
| #108  | DI Suitability Gating Workflow              | devx  | enhancement | Low      | None         |
| #111  | Managed API Deployment Packaging Regression | devx  | test        | Low      | None         |

### Learn More Page (Epic #52 - Partial M2)

| Issue | Title                                  | Scope | Type        | Priority | Dependencies |
| ----- | -------------------------------------- | ----- | ----------- | -------- | ------------ |
| #172  | Weekly Learn More Content Regeneration | devx  | enhancement | Low      | None         |
| #173  | Roadmap Embedding Component            | devx  | feature     | Low      | None         |
| #174  | Learn More SEO & Analytics             | devx  | enhancement | Low      | None         |

### World Event Processing

| Issue | Title                                       | Scope         | Type        | Priority | Dependencies |
| ----- | ------------------------------------------- | ------------- | ----------- | -------- | ------------ |
| #257  | World Event Dead-Letter Storage & Redaction | observability | enhancement | Medium   | #10          |
| #258  | World Event Type-Specific Payload Handlers  | world         | enhancement | Medium   | #257         |

### Traversal Enhancements (Lower Priority M2 Scope)

| Issue | Title                           | Scope     | Type    | Priority | Dependencies |
| ----- | ------------------------------- | --------- | ------- | -------- | ------------ |
| #33   | Semantic Exit Names (N2)        | traversal | feature | Low      | None         |
| #256  | Relative Direction Support (N3) | traversal | feature | Low      | #33          |

---

## Implementation Sequence

### Phase 1: Telemetry Foundation (High Priority)

**Goal:** Establish core telemetry infrastructure for observability.

**Issues:**

1. **#10** – Telemetry Event Registry Expansion

    - Expand event registry with M2 canonical events
    - Enforce allow-list validation
    - **Blocking:** #79, #41, #50, #152, #257

2. **#79** – Capture Gremlin RU + Latency Telemetry

    - Abstract Gremlin client to emit timing + RU metrics
    - **Enables:** #71 (health checks)

3. **#41** – Application Insights Correlation & OpenTelemetry
    - Integrate OpenTelemetry for trace correlation
    - **Enables:** Cross-function observability

### Phase 2: Health & Monitoring (High Priority)

**Goal:** Operational health visibility.

**Issues:** 4. **#71** – Gremlin Health Check Function

-   HTTP health endpoint for Gremlin connectivity
-   **Depends on:** #79

### Phase 3: Cost Controls (Medium Priority)

**Goal:** AI cost visibility and soft guardrails.

**Epic #50 Sequence:** 5. **#50** – Epic: AI Cost Telemetry & Budget Guardrails

Child Issues (#299–#309):

| Issue | Title                                           | Type        | Priority | Dependencies |
| ----- | ----------------------------------------------- | ----------- | -------- | ------------ |
| #299  | AI Cost Event Registry Alignment                | enhancement | Medium   | #50, #10     |
| #300  | Token Estimation Heuristic (charDiv4)           | feature     | Medium   | #50          |
| #301  | Pricing Table & Override Loader (ENV JSON)      | feature     | Medium   | #50          |
| #302  | Cost Calculator Module (Micros Bucketing)       | feature     | Medium   | #50, #300    |
| #303  | Hourly Aggregation & Window Summary Emission    | feature     | Medium   | #302         |
| #304  | Soft Budget Threshold Guardrail (Micros)        | feature     | Medium   | #302         |
| #305  | Simulation Harness (Synthetic Events)           | test        | Low      | #302, #303   |
| #306  | PII Audit Script (Payload Schema Enforcement)   | test        | Low      | #299         |
| #307  | Developer Docs: AI Cost Telemetry               | docs        | Medium   | #299-#304    |
| #308  | Dashboard Query Snippets & Interpretation Guide | docs        | Low      | #303, #304   |
| #309  | Aggregation Validation & Reconciliation Tests   | test        | Medium   | #303, #304   |

**Summary:** Pre‑AI cost visibility (estimation + bucketing) & safeguards (threshold events) established ahead of real model integration.

### Phase 4: API Modernization (Medium Priority)

**Goal:** RESTful API patterns with backward compatibility.

**Epic #228 Sequence:** 6. **#229** – API Versioning Strategy & Route Prefix

-   Define `/v1/` prefix and deprecation policy
-   **Blocking:** #230, #233

7. **#230** – Backend Route Pattern Migration

    - Migrate endpoints to path-based patterns
    - **Depends on:** #229
    - **Blocking:** #231, #232

8. **#231** – Frontend API Client Updates

    - Update client to use RESTful patterns
    - **Depends on:** #230

9. **#232** – Integration Tests for RESTful Endpoints

    - Test coverage for dual operation
    - **Depends on:** #230

10. **#233** – API Documentation Updates
    - Document new patterns and migration guide
    - **Depends on:** #229

### Phase 5: Description Integrity (Medium Priority)

**Goal:** Monitor description generation quality.

**Epic #69 Sequence:** 11. **#152** – Description Telemetry Events Emission - Emit events for description operations - **Depends on:** #10 - **Blocking:** #153

12. **#153** – Integrity Hash Computation Job

    -   Compute and store description hashes
    -   **Depends on:** #152
    -   **Blocking:** #154, #155, #156

13. **#154** – Integrity Cache Layer

    -   Optional cache for recent hashes
    -   **Depends on:** #153

14. **#155** – Corruption Simulation Harness

    -   Test harness for integrity validation
    -   **Depends on:** #153

15. **#156** – Integrity Anomaly Alerting Logic
    -   Alert on detected anomalies
    -   **Depends on:** #153

### Phase 6: World Event Processing (Medium Priority)

**Goal:** Robust event processing with failure handling.

**Issues:** 16. **#257** – World Event Dead-Letter Storage & Redaction - Persist failed events for debugging - **Depends on:** #10 - **Blocking:** #258

17. **#258** – World Event Type-Specific Payload Handlers
    -   Handler registry for event types
    -   **Depends on:** #257

### Phase 7: DevX & Quality (Low Priority)

**Goal:** Developer experience and quality tooling.

**Issues:** 18. **#108** – DI Suitability Gating Workflow - Automated DI assessment reporting

19. **#111** – Managed API Deployment Packaging Regression

    -   Validation script for deployment structure

20. **#172** – Weekly Learn More Content Regeneration

    -   Automated content updates

21. **#173** – Roadmap Embedding Component

    -   Remove deprecated ordering references

22. **#174** – Learn More SEO & Analytics
    -   SEO metadata and analytics

### Phase 8: Traversal Enhancements (Lower Priority)

**Goal:** Enhanced traversal UX (deferred if time-constrained).

**Issues:** 23. **#33** – Semantic Exit Names (N2) - Support semantic/landmark-based navigation - **Blocking:** #256

24. **#256** – Relative Direction Support (N3)
    -   Player-relative directions (left/right/forward/back)
    -   **Depends on:** #33

---

## Dependency Graph

### Critical Path (Must Complete for M2 Exit Criteria)

```
#10 (Registry)
 ├─→ #79 (RU/Latency)
 │    └─→ #71 (Health Check) ✓ EXIT CRITERIA
 ├─→ #41 (OpenTelemetry) ✓ EXIT CRITERIA
 └─→ #50 (AI Cost) ✓ EXIT CRITERIA

#229 (API Versioning)
 └─→ #230 (Backend Routes)
      ├─→ #231 (Frontend Client)
      ├─→ #232 (Integration Tests)
      └─→ #233 (Documentation)
```

### Secondary Tracks (Valuable but not blocking M2 closure)

```
#10 (Registry)
 ├─→ #152 (Description Events)
 │    └─→ #153 (Integrity Hash)
 │         ├─→ #154 (Cache)
 │         ├─→ #155 (Simulation)
 │         └─→ #156 (Alerting)
 │
 ├─→ #257 (Dead-Letter)
 │    └─→ #258 (Event Handlers)
 │
 └─→ DevX: #108, #111, #172-#174

#33 (Semantic Exits)
 └─→ #256 (Relative Directions)
```

---

## Blocking/Blocked By Relationships Summary

### Blockers (Issues blocking others)

-   **#10** → blocks #79, #41, #50, #152, #257 (telemetry foundation)
-   **#79** → blocks #71 (health needs RU metrics)
-   **#229** → blocks #230, #233 (versioning strategy)
-   **#230** → blocks #231, #232 (backend implementation)
-   **#152** → blocks #153 (description events)
-   **#153** → blocks #154, #155, #156 (hash baseline)
-   **#257** → blocks #258 (dead-letter storage)
-   **#33** → blocks #256 (semantic exits)

### Most Blocked (High-value issues waiting on dependencies)

-   **#71** – Gremlin Health Check (blocked by #79)
-   **#231** – Frontend API Client (blocked by #230)
-   **#232** – Integration Tests (blocked by #230)
-   **#258** – Event Handlers (blocked by #257)
-   **#256** – Relative Directions (blocked by #33)

---

## Risk & Mitigation

| Risk                                  | Probability | Impact | Mitigation                                         |
| ------------------------------------- | ----------- | ------ | -------------------------------------------------- |
| Telemetry volume impacts performance  | Low         | Medium | Use sampling for high-frequency events; monitor RU |
| API migration breaks existing clients | Medium      | High   | Dual operation during transition; feature flag     |
| Description integrity false positives | Medium      | Low    | Simulation harness validates detection logic       |
| OpenTelemetry overhead                | Low         | Medium | Measure baseline; adjust sampling rates            |
| Cost telemetry accuracy drift         | Medium      | Medium | Periodic reconciliation with actual billing        |

---

## Success Criteria

### MVP (Required for M2 Closure)

-   [x] Telemetry registry expanded with M2 events (#10)
-   [x] RU & latency metrics captured for Gremlin ops (#79)
-   [x] Health check endpoint operational (#71)
-   [ ] OpenTelemetry correlation wired (#41)
-   [ ] AI cost telemetry epic foundation implemented (events + aggregation: #299–#304)
-   [ ] RESTful API patterns operational with backward compat (#228-#233)

### M2 Completion Criteria (Comprehensive)

-   [ ] All high-priority issues closed (#10, #79, #71, #41, #229, #230)
-   [ ] At least one dashboard query documented showing move success rate
-   [ ] API documentation updated with RESTful patterns
-   [ ] Health check endpoint returns <200ms latency
-   [ ] Cost telemetry capturing token usage for at least one AI operation
-   [ ] All M2 tests passing
-   [ ] Documentation current

### Nice-to-Have (Defer if time-constrained)

-   [ ] Description integrity monitoring complete (#69 epic)
-   [ ] World event handlers refactored (#257, #258)
-   [ ] Semantic/relative directions implemented (#33, #256)
-   [ ] Learn More page automation (#172-#174)
-   [ ] Full AI cost simulation & reconciliation tests (#305, #309) after foundational emission validated

---

## Recommended Next Steps

**Immediate Focus:** Start with critical path foundations:

1. **Start #10** (Telemetry Event Registry Expansion) – Unblocks 5 other issues
2. **Start #229** (API Versioning Strategy) – Lightweight doc work, unblocks API track
3. **Start #79** (Gremlin RU/Latency) – Parallel with #10, enables health checks

**Parallel Tracks:** Once foundations complete:

-   **Observability track:** #10 → #79 → #71 → #41 → #50
-   **API track:** #229 → #230 → #231, #232, #233
-   **Integrity track:** #10 → #152 → #153 → #154, #155, #156
-   **Event processing track:** #10 → #257 → #258

---

## Post-M2 Roadmap

### Deferred to M3 (AI Read)

-   Advanced cost optimization and budget enforcement
-   AI-specific telemetry correlation
-   Prompt template registry observability

### Deferred to M4 (Layering & Enrichment)

-   Layer-specific integrity monitoring
-   Description generation performance profiling
-   Advanced description corruption detection

---

## Communication Plan

**Kickoff:** 2025-10-30  
**Daily Progress:** Track via issue comments and project board  
**Mid-Milestone Review:** After Phase 2 completion (health checks operational)  
**M2 Validation:** All high-priority issues closed; at least one operational dashboard query

---

## Questions to Answer Before Starting

1. **OpenTelemetry exporter:** Use Azure Monitor exporter or generic OTLP? (Recommend: Azure Monitor for native integration)
2. **API versioning:** Hard cutover date or indefinite dual operation? (Recommend: 2 milestone deprecation period)
3. **Cost telemetry:** Real-time aggregation or batch? (Recommend: Batch for MVP, real-time later)
4. **Health check frequency:** How often should monitoring ping health endpoint? (Recommend: 60s interval)
5. **Description integrity:** Hash algorithm choice? (Recommend: SHA-256, standard and sufficient)

---

_Plan created: 2025-10-30 | Updated after AI Cost epic (#50) decomposition (issues #299–#309) and health check completion (#71) | Ready to execute_
