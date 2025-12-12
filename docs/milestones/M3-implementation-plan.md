# M3 Core Loop – Implementation Plan

> **Status:** Split into mini-milestones — **M3a** 20 (all issues closed) ✅ closed 2025-11-30, **M3b** 14 (all issues closed) ✅ closed 2025-12-11, **M3c** 10 (in progress). Critical Path: M3a ✅ → M3b ✅ → M3c (temporal). | Updated 2025-12-11
> **Goal:** Enable players to interact through the web UI with event-driven backend processing and temporal reconciliation.
> **Dependencies:** M2 Data Foundations (World Events container #407, Player state #404), Telemetry enrichment (#312), SQL API repositories
> **Blocks:** M4 AI Read (MCP server integration), M5 dashboards (client telemetry), temporal narrative layers
> **Milestone ID:** 3 ("Core Loop" as per `docs/roadmap.md`; GitHub milestone title may differ—verify before assignment)

---

## Slices

| Slice                         | Milestone ID | Scope                                                                  | Anchor Epics | Key Issues                                          |
| ----------------------------- | ------------ | ---------------------------------------------------------------------- | ------------ | --------------------------------------------------- |
| **M3a Event Backbone**        | 11           | Queue, contracts, reliability                                          | #385         | #101, #102, #258, #313, #314, #398-#402, #400, #240 |
| **M3b Player UI & Telemetry** | 12           | Auth, game view, navigation, telemetry                                 | #389         | #413-#424, #418, #422, #314                         |
| **M3c Temporal PI-0**         | 13           | World/Player/Location clocks, durations, reconciliation, ledger, tests | #497         | #498-#506, #501-#502                                |

**Umbrella:** `M3 Core Loop` milestone kept as a shell; new issues should target the appropriate slice.

## Scope (MECE)

| Cluster                                     | Focus                                             | Key Issues                                                           |
| ------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------- |
| **C. World Event Processing**               | Queue-triggered processing, schema, reliability   | #101, #102, #258, #398-#402                                          |
| **D. Frontend Player Experience**           | SWA auth, game view, command input, telemetry     | #418, #413-#419, #422 (#420-#421 optional, #423-#424 deferred to M5) |
| **E. World Time & Temporal Reconciliation** | Clocks, action durations, reconciliation policies | #498-#506                                                            |
| **F. Epic Coordination**                    | Umbrella tracking for events/UI/temporal          | #385-#389, #322-#324                                                 |

**Out of scope:** AI tooling (M4), description layering (M5), dungeons/humor/entity promotion (M6), multiplayer (M7)

---

## Critical Path & Dependencies

```
M2:#407 (Events Timeline) ──> #101 (WorldEvent schema) ──> #102 (Processor) ──> #258 (Handlers)
                                                  │
                                                  └──> #398-#402 (Reliability: correlation, idempotency, DLQ, replay)

M2:#404 (Player State) ──> #418 (Auth) ──> #413 (Game View) ──> #414-#417, #419 (UI components)
                                           │
                                           └──> #422 (Frontend telemetry)

#498 (WorldClock) ──┬──> #499 (PlayerClock) ──┬──> #502 (ReconcileEngine) ──> #503 (Narrative)
                    │                          │
                    └──> #500 (LocationClock) ─┘

#501 (ActionRegistry) ──> #499 (PlayerClock)
#504 (TemporalLedger) ── parallel
#505 (Temporal Telemetry) ── parallel
#506 (Temporal Integration Tests) ── after all temporal components
```

---

## Workstreams & Deliverables

### C. World Event Processing (Backend)

- 🧱 **Schema & Contracts**: #101 WorldEvent envelope (id, type, payload, metadata, correlationId).
- ⚙️ **Processor Function**: #102 Azure Functions queue trigger reading `worldEvents` (PK: `/scopeKey`).
- 🧩 **Handlers Registry**: #258 Type-specific handlers with factory/registry; ensure idempotency (#400) and telemetry (#399).
- 🛡️ **Reliability**: #398 Correlation propagation; #401 Dead-letter storage; #402 Replay tooling; #400 Dedup store.

### D. Frontend Player Experience (SWA + React)

- 🔐 **Auth**: #418 SWA GitHub identity wired to backend.
- 🖥️ **Game View**: #413 Location + exits + status; #414 Description rendering (layers); #415 Command input (validation/autocomplete).
- 🧭 **Navigation UI**: #416 Exit buttons/shortcuts; #417 Status panel.
- 🛣️ **Routing**: #419 Client-side routing (React Router).
- 📡 **Telemetry**: #422 App Insights with correlation headers; moves #313/#314/#317 from M2 epics.
- ♿ **Optional (shiftable to M5)**: #420 Accessibility, #421 Responsive layout, #423 E2E tests, #424 Frontend architecture doc.

### E. World Time & Temporal Reconciliation

- ⏱️ **Clock Services**: #498 WorldClock; #499 PlayerClock; #500 LocationClock.
- 📚 **Action Duration Registry**: #501 Duration tables.
- 🔄 **Reconcile Engine**: #502 Wait/slow/compress policies; #503 Narrative layer (“time passes”).
- 🧾 **Temporal Ledger**: #504 Immutable log; #505 Telemetry.
- ✅ **Integration Tests**: #506 Multi-player reconciliation scenarios.

### F. Epic Coordination & Cross-Cutting

- #385 World Event Processing Infrastructure; #389 Frontend Player Experience; #498-#506 grouped under #497 Temporal Framework; #322 Playable MVP Loop; #323 Humor; #324 Entity Promotion (tracking only).

---

## Exit Criteria

- ✅ World events process via queue with idempotency and DLQ/replay.
- ✅ Player authenticates via SWA GitHub and sees game view (location + exits + status).
- ✅ Command input accepts and validates commands; navigation updates backend.
- ✅ Frontend ↔ backend telemetry correlated end-to-end.
- 🔨 Temporal mechanics: world clock advances; player clocks track durations; reconciliation policies applied; temporal narrative emitted; ledger persisted.

---

## Risks & Mitigations

| Risk                              | Impact                                    | Mitigation                                                           |
| --------------------------------- | ----------------------------------------- | -------------------------------------------------------------------- |
| **#407 delay** (Events container) | Blocks backend processing                 | Prioritize completion; add contract tests for schema stability       |
| **Auth coupling (SWA)**           | UI blocked if identity misconfigured      | Provide local dev bypass; document setup; smoke tests for SWA auth   |
| **Temporal complexity**           | Reconciliation bugs, narrative mismatches | Start with PI-0 deterministic policies; add integration tests (#506) |
| **Telemetry correlation gaps**    | Debugging blind spots                     | Enforce correlationId propagation in middleware; add contract tests  |

---

## Sequencing (5-week target)

1. **Week 1:** #407, #101 schema finalized; scaffold processor (#102).
2. **Week 2:** Handlers (#258), reliability (#398-#402); backend tests.
3. **Week 3:** Auth + core UI (#418, #413-#417, #419); telemetry (#422).
4. **Week 4:** Temporal services (#498-#501); reconcile engine stub (#502).
5. **Week 5:** Temporal narrative (#503), ledger/telemetry (#504-#505), integration tests (#506); polish.

Parallelizable:

- UI polish (#420-#421) after core view.
- Documentation (#424) and E2E (#423) can follow core loop.

---

## Acceptance Criteria (Given/When/Then)

- Given a player with valid auth, when they load the game view, then location, exits, and status render from SQL API.
- Given a move command, when the queue processor handles the corresponding event, then the player’s location updates and telemetry emits correlated events.
- Given two players issuing commands with different durations, when reconciliation runs, then timelines align per policy and narrative text reflects elapsed time.
- Given a handler failure, when the message is retried beyond threshold, then it lands in DLQ with replay metadata preserved.

---

## Tracking & Labels

- **Milestone:** `M3 Core Loop` (GitHub milestone number TBD; verify before assignment)
- **Scope label:** `scope:core`
- **Type labels:** `feature` (cluster C/D), `enhancement` (telemetry), `test` (integration), `docs` (architecture/UI docs)
- **Risk tag:** `RUNTIME-BEHAVIOR` (backend queue processing), `LOW` for UI polish items

---

## Notes

- This plan mirrors `docs/roadmap.md` M3 section; keep `roadmap.md` as the single high-level narrative. This file is Layer 5 (milestones) and should remain tactical.
- **Naming note:** Legacy references to "M3 AI Read" map to current **M4 AI Read**. M3 is **Core Loop** per `docs/roadmap.md`.
- Avoid mixing M4/M5 scope; create atomic issues per Section 17 policy when splitting.
  Status refresh 2025-12-11: M3a 20 (20 closed/0 open) ✅. M3b 14 (14 closed/0 open) ✅. M3c 10 (in progress). Critical path complete through UI/telemetry; temporal reconciliation underway.
