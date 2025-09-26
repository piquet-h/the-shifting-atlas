# Architecture Pivot Trigger Points

A living checklist of objective (or near‑objective) signals that tell us **“it’s time to evolve”** a part of the system. Each trigger defines: Domain, Signal / Symptom, Suggested Initial Threshold, Recommended Pivot Action, Rationale, and Anti‑Goals (what _not_ to over‑optimize prematurely).

> Philosophy: We bias toward _small, reversible_ changes until quantified pain crosses a pre‑committed line. Avoid architecture fishing expeditions.

---

## Legend

- P95 / P99: 95th / 99th percentile.
- A/B: Before / After comparison window (typically rolling 7 days).
- MTTR: Mean Time To Recovery.
- MAU: Monthly Active Users (unique authenticated principals).

---

## 1. Persistence & Data Layer

| ID  | Signal                                           | Threshold (Initial)                                                      | Pivot Action                                                                       | Rationale                                         | Anti‑Goals                                                                     |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------ |
| P1  | In‑memory repo still used in production flows    | > 1 external user OR > 3 interconnected locations                        | Enforce `PERSISTENCE_MODE=cosmos` & remove accidental fallbacks                    | Ensures real graph semantics & telemetry fidelity | Forcing Cosmos in local dev where iteration speed suffers                      |
| P2  | Single partition (hot key) RU throttling         | > 3 RU throttle events / hour OR hot partition > 40% total RU            | Introduce better partition key (e.g. shard world regions) or graph container split | Avoid write stalls & uneven cost                  | Premature multi‑container sharding with small graph                            |
| P3  | Gremlin query RU / request cost spikes           | Any steady query > 50 RU OR total RU / user / day > target budget        | Add targeted graph indexes or precomputed projection vertex/edge                   | Cost control & latency reduction                  | Blanket indexing all properties                                                |
| P4  | Location vertex count growth                     | > 25k vertices OR edges/vertex ratio > 40 impacting traversal latency    | Evaluate graph compaction, archival, or region partitioning                        | Maintain traversal P95 < 120ms                    | Early sharding at < 2k locations                                               |
| P5  | Need rich player inventory queries (filter/sort) | > 3 separate bespoke Gremlin patterns for inventory screens              | Introduce polyglot store (SQL / Table) for denormalized player inventory view      | Query performance & RU savings                    | Duplicating full player state in multiple stores without projection discipline |
| P6  | Event sourcing consideration                     | > 5 immutable audit requirements unmet OR > 3 concurrency conflicts/week | Introduce append‑only Event container + projection workers                         | Traceability & conflict mitigation                | Rebuilding everything to CQRS on day 1                                         |

## 2. Code Architecture & Modularity

| ID  | Signal                                                           | Threshold                                                                 | Pivot Action                                               | Rationale                             | Anti‑Goals                                            |
| --- | ---------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------- |
| A1  | Constructor / factory parameter sprawl                           | Any function / repo factory > 5 primitive params OR repeating env parsing | Introduce light DI composition module (not full framework) | Centralize wiring; test seams         | Importing heavy DI container (reflective) prematurely |
| A2  | Cross‑cutting concerns duplication (telemetry, auth, validation) | Same pattern copy‑pasted > 3 places                                       | Introduce middleware / wrapper utilities                   | Consistency & lower defects           | Over‑abstracting single‑use logic                     |
| A3  | Growth of shared index exports                                   | > 25 distinct exports OR circular imports appear                          | Split `shared` into domain, infra, and util subpackages    | Maintain cognitive load & build times | Fragmentation into too many micro‑packages            |

## 3. Service / Function Boundary Evolution

| ID  | Signal                           | Threshold                                                       | Pivot Action                                                              | Rationale                       | Anti‑Goals                                        |
| --- | -------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------- |
| S1  | Cold start impact on p95 latency | P95 > 600ms for simple read endpoints w/ rarely used bindings   | Split infrequently used bindings / heavy deps into separate function apps | Reduce cold start for hot paths | Premature multi‑app split with negligible latency |
| S2  | Blast radius of deployments      | > 30% of commits touch unrelated gameplay + auth + economy code | Logical grouping into separate function apps (auth, world, economy)       | Risk isolation                  | Splitting w/out ownership clarity                 |
| S3  | Concurrency contention           | > 3 race bug fixes / month or MTTR for state conflicts > 1h     | Introduce queue mediation (commands) & idempotent handlers                | Reduce conflict probability     | Over‑serializing independent actions              |

## 4. Messaging & Backpressure

| ID  | Signal                           | Threshold                                                   | Pivot Action                                                       | Rationale                 | Anti‑Goals                                  |
| --- | -------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------- | ------------------------------------------- |
| M1  | World event queue depth          | > (SLA minutes \* avg events/min) OR time to drain > 5× SLA | Scale Service Bus tier / add parallel consumers (partitioning key) | Maintain event freshness  | Spawning consumers w/out partition strategy |
| M2  | Poison / dead-letter rate        | > 0.5% of messages dead-lettered                            | Add retry / DLQ handler + structured error taxonomy                | Reliability & diagnostics | Auto‑purging DLQ without root cause         |
| M3  | Duplicate world events processed | > 3 duplicates / 1k events                                  | Introduce de‑dupe (idempotency key cache)                          | Prevent state divergence  | Global locking for all events               |

## 5. Telemetry & Observability

| ID  | Signal                  | Threshold                                     | Pivot Action                                          | Rationale          | Anti‑Goals                                           |
| --- | ----------------------- | --------------------------------------------- | ----------------------------------------------------- | ------------------ | ---------------------------------------------------- |
| T1  | Unclassified errors     | > 20% of exceptions missing `errorType`       | Implement error normalization & classification helper | Faster triage      | Exhaustive taxonomy before data                      |
| T2  | Missing correlation IDs | > 5% of requests w/out operationId span chain | Propagate correlation via middleware                  | Trace completeness | Overbuilding custom tracing vs App Insights features |
| T3  | Silent high-RU queries  | > 10% queries > 50 RU w/out telemetry event   | Add RU metric capture in repository wrapper           | Cost visibility    | Logging all queries verbosely                        |
| T4  | Log volume cost / noise | Data ingestion > planned budget by 30%        | Introduce sampling (tail-based for low-sev)           | Cost control       | Blind sampling w/out keeping rare errors             |

## 6. Performance & Caching

| ID  | Signal                     | Threshold                                 | Pivot Action                                                               | Rationale            | Anti‑Goals                                      |
| --- | -------------------------- | ----------------------------------------- | -------------------------------------------------------------------------- | -------------------- | ----------------------------------------------- |
| C1  | Hot read endpoints latency | P95 > 200ms despite low RU / CPU          | Introduce in-memory (per instance) or Redis cache for static location data | Reduce latency & RU  | Caching mutable high-churn entities prematurely |
| C2  | Repeated identical queries | Same Gremlin traversal > 25% of read RU   | Add query result cache layer w/ eviction                                   | RU cost optimization | Over-caching leading to stale gameplay          |
| C3  | Client perceived lag       | > 10% moves exceed UX budget (e.g. 400ms) | Pre-fetch exits & optimistic UI                                            | Player experience    | Aggressive speculative side-effects             |

## 7. Security & Identity

| ID   | Signal                                       | Threshold                              | Pivot Action                                                        | Rationale            | Anti‑Goals                                  |
| ---- | -------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------- | -------------------- | ------------------------------------------- |
| SEC1 | Anonymous interactions requiring attribution | > 2 features need persistent identity  | Implement player auth mapping (Static Web Apps principal -> Player) | Accountability       | Building custom IdP                         |
| SEC2 | Role / faction complexity                    | > 3 distinct permission tiers          | Introduce RBAC edge model in graph                                  | Fine-grained control | Hard-coded role checks scattered            |
| SEC3 | Abuse / rate anomalies                       | > 3 IPs exceed 10× normal command rate | Enforce APIM rate limiting policy tuning                            | Protect stability    | Global throttling harming legitimate bursts |

## 8. Testing & Quality

| ID  | Signal                 | Threshold                       | Pivot Action                                            | Rationale        | Anti‑Goals                            |
| --- | ---------------------- | ------------------------------- | ------------------------------------------------------- | ---------------- | ------------------------------------- |
| Q1  | Mean regression escape | > 1 escaped regression / sprint | Add contract / integration test harness (record+replay) | Confidence       | 100% coverage pursuit                 |
| Q2  | Flaky test ratio       | > 5% retries needed             | Introduce deterministic fakes & isolate async timers    | Reliability      | Disabling tests permanently           |
| Q3  | Manual validation time | > 30 min for release sanity     | Add smoke test script + environment diff check          | Release velocity | Over-engineered pipeline gating early |

## 9. Documentation & Knowledge

| ID  | Signal                       | Threshold                          | Pivot Action                                        | Rationale                  | Anti‑Goals                               |
| --- | ---------------------------- | ---------------------------------- | --------------------------------------------------- | -------------------------- | ---------------------------------------- |
| D1  | Onboarding time for new dev  | > 2 days to first trivial PR       | Add "Golden Path" doc & architecture decision index | Reduce onboarding friction | Encyclopedic docs without usage examples |
| D2  | Architecture rationale drift | > 3 decisions questioned / quarter | Formalize lightweight ADRs (1-pager)                | Preserve intent            | Heavy RFC process for small changes      |

## 10. Cost & Capacity Management

| ID  | Signal                         | Threshold                                   | Pivot Action                                              | Rationale           | Anti‑Goals                              |
| --- | ------------------------------ | ------------------------------------------- | --------------------------------------------------------- | ------------------- | --------------------------------------- |
| K1  | Cosmos RU overage risk         | Utilization > 70% sustained daytime         | Increase RU / autoscale tier OR optimize top 3 queries    | Cost predictability | Reflexively scaling before optimization |
| K2  | Function execution cost spikes | Monthly cost > 125% forecast                | Profile cold starts, optimize bundling, reduce over-fetch | Budget adherence    | Premature language/runtime rewrites     |
| K3  | Service Bus tier saturation    | Features (topics, etc.) needed beyond Basic | Upgrade tier + enable sessions if ordering needed         | Feature unlock      | Upgrading without verifying need        |

## 11. AI / Prompt Integration

| ID  | Signal                                   | Threshold                            | Pivot Action                                                | Rationale                    | Anti‑Goals                                                               |
| --- | ---------------------------------------- | ------------------------------------ | ----------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------ |
| AI1 | Dynamic narrative need (procedural text) | > 2 features blocked on richer prose | Introduce prompt templates + context assembly layer         | Player immersion             | Binding full LLM loop into core request path before caching / guardrails |
| AI2 | Prompt context size growth               | > 8KB assembled context / request    | Implement summarization & hierarchical context partitioning | Control latency & token cost | Blind truncation losing critical state                                   |

---

## Operationalizing Triggers

1. Instrument: Ensure metrics (RU, latency percentiles, error taxonomy) are emitted to Application Insights.
2. Dashboards: Curate Kusto workbooks mapping each trigger ID to a chart / query.
3. Weekly Review: 10‑minute architecture health review — scan triggers; if threshold crossed, open a lightweight ADR issue referencing ID.
4. Decision Log: Each executed pivot adds an ADR entry referencing trigger ID(s) and observed data snapshot.

---

## Evaluation Checklist Before Pivot

- Is the pain reproducible & measured over ≥ 3 consecutive days (or sufficient events)?
- Have we attempted low-effort mitigations (query tweak, minor refactor)?
- Does the pivot reduce _current_ bottleneck vs. only theoretical future risk?
- Can we define a success metric and a rollback plan?

---

## Adding / Updating Triggers

Open a PR editing this file. Include:

- New ID (maintain grouping prefix)
- Metric formula or Kusto snippet
- Justification + projected risk if ignored

---

## Sample Kusto Snippets (Placeholders)

```kusto
// High RU Gremlin queries (>50 RU)
customEvents
| where name == "GremlinQuery"
| extend ru = toint(customDimensions["ru"])
| where ru > 50
| summarize count(), avg(ru), p95(ru) by name, tostring(customDimensions["queryHash"])

// Missing correlation IDs
requests
| where isempty(operation_Id) or isempty(operation_ParentId)
| summarize pct = 100.0 * count() / toscalar(requests | count())
```

---

## Anti-Entropy Maintenance

Quarterly: prune triggers no longer relevant; recalibrate thresholds as usage scales (e.g., MAU doubling may require new latency / cost targets).

---

## Quick Start Priorities (Next 1–2 Milestones)

Immediate candidates likely to cross earliest:

- T2 (correlation IDs) once telemetry baseline work begins.
- P3 (query RU) after initial seeding & exploratory traversal work.
- A2 (cross-cutting duplication) as soon as auth & validation middleware appear.

---

_Last updated: 2025-09-26_
