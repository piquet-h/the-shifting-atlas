# M0 Foundation Milestone – Closure Summary

**Closed:** 2025-10-19  
**Status:** ✅ All exit criteria met

## Exit Criteria Verification

| Criterion                         | Status | Evidence                                                                             |
| --------------------------------- | ------ | ------------------------------------------------------------------------------------ |
| **Player gets GUID consistently** | ✅     | `bootstrapPlayer.ts` idempotent bootstrap; `playerBootstrap.flow.test.ts` validation |
| **Receives ping consistently**    | ✅     | `ping.ts` service liveness; returns 200 with latency + metadata                      |
| **Deployment viable**             | ✅     | Azure Static Web App + Functions deployed; Cosmos Gremlin + SQL API provisioned      |
| **Telemetry scaffold**            | ✅     | Event registry enumerated; `trackGameEventStrict` guards unregistered events         |
| **Security baseline**             | ✅     | Managed Identity + Key Vault secrets; `secretsHelper.test.ts` coverage               |

## Core Increments Completed

### Ping (Service Liveness)

-   **Function:** `backend/src/functions/ping.ts`
-   **Features:**
    -   Returns `{ ok: true, status: 200, latencyMs, requestId, echo?, version? }`
    -   Emits `Ping.Invoked` telemetry with correlation ID
    -   Supports optional echo parameter
    -   Cache-Control headers prevent stale responses

### Guest GUID Bootstrap

-   **Function:** `backend/src/functions/bootstrapPlayer.ts`
-   **Issues Closed:** #7, #103, #110, #121
-   **Features:**
    -   Idempotent: repeat calls with `x-player-guid` header return same GUID
    -   Creates new player if header absent
    -   Persists to Cosmos Gremlin
    -   Emits telemetry sequence: `Started` → `Created` (if new) → `Completed`
    -   Returns player record + current location ID
-   **Test File:** `backend/test/playerBootstrap.flow.test.ts`

### Telemetry Scaffold

-   **Issues Closed:** #10, #104, #107
-   **Artifacts:**
    -   `shared/src/telemetryEvents.ts` – Central event registry (prevents inline string literals)
    -   `shared/src/shared/trackGameEventStrict.ts` – Enforces canonical event names
    -   Build telemetry (`build.ordering.*` events) segregated from game telemetry
-   **Test File:** `shared/test/secretsHelper.test.ts` (guards + tests)

### Infrastructure & Persistence

-   **Issues Closed:** #4, #49, #76, #100, #102
-   **Cosmos Gremlin:** Locations graph provisioned (partition key: `/id`)
-   **Cosmos SQL API:** Four containers provisioned
    -   `players` (PK: `/id`)
    -   `inventory` (PK: `/playerId`)
    -   `descriptionLayers` (PK: `/locationId`)
    -   `worldEvents` (PK: `/scopeKey`)
-   **Secrets:** Key Vault integration via Managed Identity; allowlist-based retrieval
-   **Deployment:** Azure Static Web App + Azure Functions via Bicep IaC

### Security & Testing

-   **Issues Closed:** #24 (bug fix), #107, #109
-   **Security Features:**
    -   Managed Identity for Functions + SWA
    -   Secrets never committed; local dev uses `.env.development`
    -   Allowlist enforcement in `secretsHelper.ts`
-   **Test Coverage:**
    -   `playerRepository.test.ts` – Player persistence logic
    -   `playerRepositoryIdentity.test.ts` – externalId conflict detection
    -   `worldEventProcessor.test.ts` – Event envelope validation
    -   Bootstrap idempotency verified

## Issues Closed (19 total)

| Issue | Title                                                                    | Scope       |
| ----- | ------------------------------------------------------------------------ | ----------- |
| #4    | Implement Cosmos Gremlin Location Persistence                            | world       |
| #7    | Player Bootstrap & Persistence                                           | world       |
| #24   | "Create your explorer" fails                                             | world (bug) |
| #49   | Managed Identity & Key Vault Secret Management Baseline                  | security    |
| #76   | Infra: Provision Cosmos SQL API containers                               | core        |
| #96   | Set up Copilot instructions                                              | devx        |
| #100  | World: Implement Cosmos Gremlin Location Persistence (Upsert + Revision) | world       |
| #101  | Systems: World Event Queue Processor Implementation                      | systems     |
| #102  | Core Infra: Add Remaining Cosmos SQL Containers                          | core        |
| #103  | World: Player Persistence Enhancement                                    | world       |
| #104  | DevX Automation: Stage 1 Ordering Telemetry                              | devx        |
| #105  | DevX Automation: Implementation Order Assignment Hardening               | devx        |
| #107  | Security: Secret Helper Test Suite & Telemetry Constants                 | security    |
| #109  | Traversal: Ambiguous Relative Direction Telemetry                        | traversal   |
| #110  | World: Explorer Bootstrap Regression Tests                               | world       |
| #121  | Player Persistence Hardening: externalId Conflict                        | world       |

**Plus supporting infrastructure & documentation issues (partial).**

## Deployment Validation

### Service Health

```bash
# Ping endpoint
curl https://<app>.azurewebsites.net/api/ping
→ 200 OK, ~5ms latency

# Bootstrap endpoint
curl -X GET https://<app>.azurewebsites.net/api/player/bootstrap \
  -H "x-player-guid: <existing-guid>"
→ 200 OK, idempotent GUID return
```

### Infrastructure Status

-   ✅ Azure Static Web App deployed + running
-   ✅ Azure Functions backend responding
-   ✅ Cosmos Gremlin connectivity verified
-   ✅ Cosmos SQL API containers accessible
-   ✅ Key Vault secrets resolvable via Managed Identity
-   ✅ Application Insights receiving telemetry

## Outstanding Items (Not M0 Blockers)

These are **M1 Traversal** features, intentionally deferred:

| Issue | Title                                     | Rationale                                       |
| ----- | ----------------------------------------- | ----------------------------------------------- |
| #5    | Introduce EXIT Edge Model & Link Rooms    | Needed for traversal, not bootstrap             |
| #6    | Movement Command (HttpMovePlayer)         | Move logic exists; needs EXIT edges             |
| #8    | Exits Summary Cache Generation Utility    | Supports LOOK command optimization              |
| #9    | LOOK Command (HttpLook)                   | Depends on EXIT model                           |
| #13   | Direction Normalization Utility (Stage 1) | Foundation, but not required for ping/bootstrap |

## Transition to M1 Traversal

### Immediate Next Steps

1. Implement EXIT edge model (#5) – Enable directional traversal
2. Wire movement HTTP function (#6) – Make playerMove.ts routable
3. Implement LOOK command (#9) – Display location + exits
4. Enhance direction normalizer (#13) – Support shortcuts (n/s/e/w) + typos

### M1 Exit Criteria

> Player can move across ≥3 persisted locations; telemetry for move success/failure

### Dependencies

-   EXIT edges required before move/look
-   Location seed script (#12) provides test data
-   Direction normalization enables natural input

## Key Learnings & Decisions

1. **Dual Persistence (Gremlin + SQL)** – Separates immutable world structure (graph) from mutable player state (documents). Reduces cross-partition traversal.
2. **Telemetry Segregation** – Build automation events (`build.ordering.*`) kept separate from game telemetry to prevent noise and enable distinct audit trails.
3. **Idempotency First** – Bootstrap, location upsert, and player linking all guarantee no duplicates on retry—critical for distributed system resilience.
4. **Event-Driven Architecture** – World event queue processor (#101) established; future AI proposals flow through same queue. See [World Event Contract](../architecture/world-event-contract.md) for envelope specification and implementation details.

## Documentation Updated

-   ✅ `docs/roadmap.md` (M0 marked closed)
-   ✅ `docs/adr/ADR-001-mosswell-persistence-layering.md` (dual persistence rationale)
-   ✅ `docs/adr/ADR-002-graph-partition-strategy.md` (partition key design)
-   ✅ `infrastructure/README.md` (container schema, secrets baseline)
-   ✅ `.github/copilot-instructions.md` (full framework, Sections 0–19)

---

**Next Milestone:** [M2 Observability](../roadmap.md#m2-observability)
