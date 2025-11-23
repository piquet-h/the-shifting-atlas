status: Accepted
date: 2025-10-03
amends: [ADR-001]

---

> Supersession Note (2025-11-23): Portions of this ADR referring to player vertices and dual write strategies are superseded by ADR-004 (Player Store Cutover Completion). Player state is now authoritative in Cosmos SQL API; Gremlin retains only immutable world structure (locations, exits, future NPC vertices). Partition strategy guidance for location vertices remains valid.

# ADR-002: Graph Partition Strategy (MVP Single Partition Concession)

## Context

The world graph (Cosmos DB Gremlin) is provisioned with partition key path `/partitionKey`. Early repositories hard‑coded the value `'world'` for all vertices (locations, players). This simplifies seeding & traversal but concentrates all RU and storage into a single logical partition, limiting horizontal scale and risking hot-partition throttling.

## Decision

1. Retain a single partition value for MVP (speed > scale), centralized via `shared/src/persistence/graphPartition.ts`.
2. Add evolution hook (`resolveGraphPartitionKey`) for future region-based partitioning without touching call sites.
3. (Historical) Plan migration of mutable, player-centric state to Cosmos SQL API (separate document model) before scale-up; EXECUTED via ADR-004; player vertex removed.

## Rationale

-   Operational simplicity early.
-   Central constant lowers migration diff surface.
-   Player/inventory write amplification better isolated per-player partition in SQL API.

## Non-Goals (Now)

-   Spatial hash/quadkey sharding.
-   Type-based partitioning (adds no locality benefit for traversal).

## Future Strategy (Region Sharding)

Partition key value becomes region ID (e.g., `mosswell`, `northern_ridge`). Location creation assigns region deterministically. Cross-region travel remains rare; occasional cross-partition traversals acceptable. Player documents in SQL API; edges optional.

## Thresholds to Revisit

-   > 50k world vertices OR sustained RU consumption >70% for 3 consecutive days.
-   Repeated 429 (throttled) responses on movement/look at <50 RPS.

## Migration Outline

1. Export vertices & edges.
2. Derive region for each location (mapping table).
3. Create new graph container.
4. Reingest vertices with region partition value.
5. Recreate edges (batch per region).
6. Spot verify traversals & counts.
7. Flip config to new graph.
8. Decommission old after soak.

## Consequences

Positive: Fast iteration now; explicit migration path (executed).\
Negative (Historical): Scalability ceiling prior to ADR-004; potential cross-partition edges if player vertices had been retained.

## Related Changes

-   New constants file `graphPartition.ts` and repository refactor.

## Follow-Up Issues (completed/in-progress)

-   ✅ Provision SQL API (players, inventory, layers, events) - #517
-   ✅ Player SQL projection (write-through & migration complete; flag removed) - #518
-   ✅ Feature flag for Gremlin player vertex fallback (removed post-cutover) - #519
-   ⏳ Region partition migration script scaffold
-   ⏳ Telemetry capture for Gremlin RU/latency
-   ✅ Adopt partition constants (done in this ADR)

## Rollback

Revert constant usage to prior literal `'world'`; no data shape changes required.

## Related Documentation

-   [ADR-001: Mosswell Persistence & Layering](./ADR-001-mosswell-persistence-layering.md) – Base persistence model (includes partition strategy appendix)
-   [ADR-003: Player-Location Edge Groundwork](./ADR-003-player-location-edge-groundwork.md) – Player edge migration design
-   [Architecture Overview](../architecture/overview.md) – High-level architecture context
-   [Location Version Policy](../architecture/location-version-policy.md) – Location content versioning rules
-   [MVP Azure Architecture](../architecture/mvp-azure-architecture.md) – Resource layout and partition strategy references
-   [Mosswell Repository Interfaces](../developer-workflow/mosswell-repository-interfaces.md) – Repository contracts & persistence patterns
-   [Mosswell Bootstrap Script](../developer-workflow/mosswell-bootstrap-script.md) – World seeding with current partition strategy
-   [Mosswell Migration Workflow](../developer-workflow/mosswell-migration-workflow.md) – Migration scaffold for partition evolution

---

Accepted 2025-10-03. Superseded for player storage concerns by ADR-004 on 2025-11-23.
