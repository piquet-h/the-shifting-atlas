---
status: Superseded
date: 2025-01-15
superseded-by: ../architecture/player-location-edge-migration.md
relates: [ADR-002, Issue #117, Issue #131]
---

# Player-Location Edge Migration Groundwork

**⚠️ SUPERSEDED**: This ADR has been superseded by the comprehensive [Player-Location Edge Migration Design](../architecture/player-location-edge-migration.md) document (created for Issue #131). Refer to that document for the authoritative migration strategy.

## Historical Context

This ADR originally outlined preliminary thoughts on migrating player position from scalar `currentLocationId` to graph edges `(player)-[:in]->(location)`.

**What happened since:**

-   Epic #117 (Location Edge Management) was completed, delivering exit edge management patterns
-   Issue #131 produced a complete, detailed migration design document that supersedes this ADR
-   The migration design in `player-location-edge-migration.md` provides:
    -   Four-phase migration strategy with explicit gates
    -   Risk analysis and rollback plans per phase
    -   Success metrics and exit criteria
    -   Implementation code samples
    -   Open questions with recommendations

## Key Decisions (Historical Record)

This ADR established:

1. Dual-write pattern during migration (scalar + edge coexist)
2. Scalar field remains source of truth initially
3. Gradual rollout with staged percentage-based feature flags
4. Telemetry-driven go/no-go decisions at each phase

These decisions are fully elaborated in the superseding migration design document.

## Why This Document Remains

This ADR is retained for historical reference to show the evolution from early groundwork thinking to the complete migration design. The patterns established here (dual-write, telemetry-driven validation) were fully realized in the superseding document.

**For implementation, always refer to:** [Player-Location Edge Migration Design](../architecture/player-location-edge-migration.md)

## Related Documentation

-   **[Player-Location Edge Migration Design](../architecture/player-location-edge-migration.md)** – AUTHORITATIVE migration strategy (supersedes this ADR)
-   [ADR-001: Mosswell Persistence & Layering](./ADR-001-mosswell-persistence-layering.md) – Base persistence model
-   [ADR-002: Graph Partition Strategy](./ADR-002-graph-partition-strategy.md) – Partition key design and dual persistence
-   [Edge Management Guide](../developer-workflow/edge-management.md) – Exit edge patterns (template for player edges)
-   [Exit Edge Invariants](../architecture/exits.md) – Exit edge specification (Epic #117)

---

Original date: 2025-01-15  
Superseded: 2025-10-23 (Issue #131 completion)
