---
status: Accepted
date: 2025-11-23
amends: [ADR-002]
---

# ADR-004: Player Store Cutover Completion (SQL-Only Authoritative Model)

## Context

ADR-002 introduced a dual persistence strategy: immutable world graph (Cosmos DB Gremlin) plus mutable player/inventory/events state projected into Cosmos DB SQL API. During early milestones (M1–M2) player state continued to exist as Gremlin vertices with a write‑through & fallback path while the SQL projection matured. A feature flag (`DISABLE_GREMLIN_PLAYER_VERTEX`) controlled the gradual migration and allowed operational rollback.

The migration (Issues #517–#519) is now complete. Player data is **authoritative exclusively in Cosmos DB SQL API**. Gremlin retains only immutable spatial entities (locations, exits) and future NPC vertices. All telemetry, repository logic, and bootstrap flows have been updated; write‑through, migration scripts, fallback logic, and related telemetry events (`Player.Migrate.*`, `Player.WriteThrough.*`, `Player.Get.Source*`) have been removed.

## Decision

1. Remove Gremlin player vertices from runtime logic (no new player vertex writes; existing vertices allowed to decay or be explicitly cleaned up later).
2. Eliminate write-through code paths and fallback queries; repository `Player.Get` always queries SQL API.
3. Delete migration scripts & feature flag (`DISABLE_GREMLIN_PLAYER_VERTEX`).
4. Prune superseded telemetry events; retain lifecycle events aligned to SQL operations (`Player.GetOrCreate`, `Player.LinkExternalId`, `Player.FindByExternalId`, `PlayerDoc.Upsert`, `PlayerDoc.Read`).
5. Preserve ADR-002 location partition guidance; only player vertex aspects are superseded.

## Rationale

-   Reduces Gremlin RU cost and traversal latency (fewer incidental vertex touches).
-   Simplifies player bootstrap & move handlers (single persistence pathway).
-   Removes feature flag surface & migration complexity (smaller operational risk footprint).
-   Aligns with cost optimization (SQL point reads cheaper than Gremlin traversals for player state).
-   Telemetry surface declutter improves dashboard clarity (no dual source tags).

## Consequences

Positive:

-   Cleaner repository abstractions (single authoritative model).
-   Lower RU consumption & reduced chance of hot partition from mixed workloads.
-   Removal of migration / fallback telemetry noise.

Negative:

-   Loss of potential Gremlin-native queries directly on player vertices (e.g., spatial proximity of players) now requires joining player location IDs with location graph queries.
-   Historical player vertex data in Gremlin becomes orphaned until cleanup script executed (optional). This data is inert but consumes storage.

## Alternatives Considered

| Option                                          | Outcome                         | Reason Rejected                                                      |
| ----------------------------------------------- | ------------------------------- | -------------------------------------------------------------------- |
| Keep dual writes (long-term)                    | Operational complexity persists | Adds latency & risk; little analytical benefit                       |
| Hard delete Gremlin player vertices immediately | Clean state but irreversible    | Prefer brief soak period before data removal                         |
| Retain feature flag permanently                 | Possible rollback               | Additional surface area & test complexity with no value post-cutover |

## Rollback Plan (Low Likelihood)

1. Reintroduce archived player Gremlin vertex module & dual write path (retain code in git history; no current working copy).
2. Restore telemetry events (`Player.WriteThrough.*`, `Player.Migrate.*`, `Player.Get.Source*`).
3. Recreate feature flag constant and conditional DI bindings.
4. Run targeted backfill from SQL API to Gremlin if new vertices required.

Rollback complexity is moderate; decision is considered stable unless unforeseen graph-query feature demands direct player vertex traversal at scale.

## Superseded Elements from ADR-002

-   Migration plan for player vertices (executed).
-   Gremlin player vertex fallback path & feature flag.
-   Dual write-through justification for player state.

Unchanged:

-   Location & exit graph partition strategy and future region sharding thresholds.
-   Immutable world graph rationale.
-   Partition key centralization approach.

## Implementation Summary

| Artifact                                                                  | Action                                                                                       |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Feature flag `DISABLE_GREMLIN_PLAYER_VERTEX`                              | Deleted                                                                                      |
| Migration scripts (`mosswell-migration.mjs`, Gremlin→SQL player backfill) | Deleted                                                                                      |
| Telemetry events (migration & write-through)                              | Removed from registry & tests                                                                |
| Player repository                                                         | Simplified to SQL-only accessors                                                             |
| Bootstrap handler                                                         | Direct SQL creation, no Gremlin path                                                         |
| Documentation                                                             | Updated Copilot instructions, ADR-002 supersession note, architecture flag section annotated |

## Observability Adjustments

-   Dashboards: Remove panels keyed on `source='gremlin-fallback'` dimension.
-   Alerts: Any migration/fallback success rate thresholds retired.
-   Sampling: No change (dependent on environment not data model).

## Risks & Mitigations

| Risk                                                  | Mitigation                                                                                                                       |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Residual code paths querying Gremlin for player state | Grep verification + negative tests asserting absence of fallback events                                                          |
| Orphaned player vertices degrade graph queries        | Optional cleanup script after 30-day soak                                                                                        |
| Future spatial player clustering needs                | Derive from player location IDs + location vertices; consider reintroducing lightweight presence vertices if justified (new ADR) |

## Verification Checklist

-   [x] Player repository no longer references Gremlin fallback.
-   [x] Feature flag constant absent from codebase (non-historical contexts).
-   [x] Removed telemetry events absent (except negative tests & historical docs).
-   [x] Migration scripts removed from `scripts/` directory.
-   [x] Test suites green (unit + integration + shared).
-   [x] Copilot instructions updated to reflect cutover.
-   [x] ADR-002 tagged with supersession note.

## Follow-Up Tasks (Non-Blocking)

-   [ ] Optional: Script to enumerate & delete orphaned player vertices.
-   [ ] Dashboard cleanup PR removing fallback source filters.
-   [ ] Architecture doc pruning of any residual write-through references.
-   [ ] Consider ADR for region partition evolution when thresholds reached.

## References

-   ADR-002: Graph Partition Strategy (superseded sections re: player vertices; see supersession banner at top of ADR-002)
-   Telemetry Registry: `shared/src/telemetryEvents.ts`
-   Player Repository: `backend/src/repos/playerRepository.cosmosSql.ts`
-   Copilot Instructions: `.github/copilot-instructions.md`
-   Architecture: `docs/architecture/mvp-azure-architecture.md` (flag removal section)

---

Accepted 2025-11-23.
