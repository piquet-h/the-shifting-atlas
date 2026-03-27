# Architecture Decision Records (ADRs)

Lasting architectural choices made for The Shifting Atlas. Each ADR records the decision, context, and rationale so future sessions don't need to reconstruct the reasoning from memory or chat history.

See [`docs/README.md`](../README.md) for the full documentation hierarchy. ADRs sit at **35,000 ft** — above architecture docs (30,000 ft) but below tenets.

## Index

| ADR | Title | Status | Topic |
| --- | ----- | ------ | ----- |
| [ADR-001](./ADR-001-mosswell-persistence-layering.md) | Mosswell Persistence & Tokenless Description Layering | Accepted (portions superseded by ADR-004) | Cosmos Gremlin persistence, description layer model |
| [ADR-002](./ADR-002-graph-partition-strategy.md) | Graph Partition Strategy (MVP Single Partition Concession) | Accepted (player vertex portions superseded by ADR-004) | Gremlin partition key strategy, RU budget |
| [ADR-003](./ADR-003-player-location-edge-groundwork.md) | Player-Location Edge Migration Groundwork | Superseded (player vertices removed post ADR-004) | Player-location graph edges |
| [ADR-004](./ADR-004-player-store-cutover-completion.md) | Player Store Cutover Completion (SQL-Only Authoritative Model) | Accepted | Player state → Cosmos SQL API; Gremlin = world structure only |
| [ADR-005](./ADR-005-unified-location-description-endpoint.md) | Unified Location Description Endpoint | Accepted | Single `/location` endpoint for compiled descriptions |
| [ADR-006](./ADR-006-exit-edge-traversal-time.md) | Exit Traversal Time as Optional EXIT Edge Property | Accepted | Travel duration on exit edges |
| [ADR-007](./ADR-007-canonical-lore-versioning.md) | Canonical Lore Facts Versioning Strategy | Accepted | Lore fact versioning and canonicality |
| [ADR-008](./ADR-008-keyvault.md) | Dedicated Key Vault Provisioned | Accepted | Key Vault for non-Cosmos secrets |
| [ADR-009](./ADR-009-alert-implementation.md) | Azure Monitor Alerts over Custom Timer Function | Accepted | Azure Monitor as the alerting layer |
| [ADR-010](./ADR-010-macro-geography-persistence-strategy.md) | Macro Geography Persistence Strategy (JSON Files vs Gremlin Graph) | Accepted | JSON atlas files as authoritative macro geography source; no Gremlin macro vertices |

## Reading Tips

- Superseded ADRs remain in place as historical record. Always read the **superseding ADR** for the current authority.
- The **Revisit Triggers** section in each ADR (where present) defines the conditions under which the decision should be re-evaluated. These are enforced actively — see each ADR for details.
- For the active authority model on a given topic, start with the most recent non-superseded ADR in that area.

## Producing a New ADR

1. Copy the frontmatter pattern from an existing ADR: `status`, `date`, and `deciders` fields.
2. Include: Context, Decision, Rationale, Consequences/Trade-offs, Revisit Triggers (if applicable), and Related links.
3. Keep the decision record focused: deliberation detail belongs in architecture docs at appropriate altitude.
4. Update this index.
