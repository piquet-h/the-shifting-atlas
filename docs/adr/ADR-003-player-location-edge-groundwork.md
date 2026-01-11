---
status: Superseded
date: 2025-01-15
relates: [ADR-002, Issue #117, Issue #131]
---

# Player-Location Edge Migration Groundwork

**⚠️ SUPERSEDED**: The original player-location edge migration design (Issue #131) assumed Gremlin player vertices and was removed post ADR-004. Player state is now SQL-only authoritative; any future graph-based player positioning will require a new ADR + design doc.

## Historical Context

This ADR originally outlined preliminary thoughts on migrating player position from scalar `currentLocationId` to graph edges `(player)-[:in]->(location)`.

**What happened since:**

- Epic #117 (Location Edge Management) was completed, delivering exit edge management patterns
- ADR-004 removed Gremlin player vertices; player state is SQL-only authoritative
- Future player-location edges (if reintroduced for multiplayer/proximity) will be designed under a new ADR

## Key Decisions (Historical Record)

This ADR established:

1. Dual-write pattern during migration (scalar + edge coexist)
2. Scalar field remains source of truth initially
3. Gradual rollout with staged percentage-based feature flags
4. Telemetry-driven go/no-go decisions at each phase

These decisions remain useful as patterns, but any future implementation must account for ADR-004 (no Gremlin player vertices).

## Why This Document Remains

This ADR is retained for historical reference to show the evolution from early groundwork thinking to the complete migration design. The patterns established here (dual-write, telemetry-driven validation) were fully realized in the superseding document.

**For current player persistence, refer to:** ADR-004 and the repository docs.

## Related Documentation

- ADR-004: Player Store Cutover Completion – SQL-only authoritative model
- [ADR-001: Mosswell Persistence & Layering](./ADR-001-mosswell-persistence-layering.md) – Base persistence model
- [ADR-002: Graph Partition Strategy](./ADR-002-graph-partition-strategy.md) – Partition key design and dual persistence
- [Edge Management Guide](../developer-workflow/edge-management.md) – Exit edge patterns (template for player edges)
- [Exit Edge Invariants](../concept/exits.md) – Exit edge specification (Epic #117, relocated to concept facet)

---

Original date: 2025-01-15  
Superseded: 2025-10-23 (Issue #131 completion)
