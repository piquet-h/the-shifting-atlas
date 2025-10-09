---
status: Accepted
date: 2025-10-02
supersedes: []
amends: []
---

# ADR-001 (Condensed): Mosswell Persistence & Tokenless Description Layering

Canonical condensed summary. Full archived narrative: `docs/adr/archive/ADR-001-full-2025-10-02.md`.

## Decision

Persist Mosswell anchor Locations & Exits immediately (Cosmos Gremlin) using immutable base prose + additive validated layer model (structural, ambient, enhancement, personalization). No inline template tokens; machine-readable attributes map accompanies prose. Early persistence stabilizes IDs and prevents drift before AI enrichment.

## Rationale (Abbreviated)

- Stable GUID anchors for future systems (hydrology, factions, quests).
- Deterministic composition for auditability & lower AI cost (only missing layers generated).
- Avoid reseed/regeneration drift & future refactor tail.

## Key Model Rules

- Base description immutable; variation only via additive layers.
- Attribute map enforces invariants & validator rules.
- Exits directional edges; idempotent creation.

## Phased Plan (Abbrev.)

P1: Interfaces + Location repository + bootstrap seeding.
P2: Composer + validator (immutability, length, contradiction).
P3: Ambient registry & composition sequence (formerly referred to as ordering — numeric/predictive sequencing removed).
P4: Telemetry + integrity hashing.
P5: AI on-ramp (ambient generation, structural proposals with approval).

## Telemetry (Initial)

- Description.Layer.Generated
- Description.Composite.Rendered
- Description.StructuralEvent.Added

## Revisit Triggers

- Localization needs → evaluate tokenization.
- Large-scale environmental transforms → diff/patch model.
- Layer storage growth threshold → separate container.

## Appendix: Partition Key Strategy

Early world persistence intentionally defers an optimized graph partitioning scheme in favor of speed and minimal surface area change. The Cosmos DB Gremlin container is provisioned with partition key path `/partitionKey` and—during the Mosswell bootstrap phase—uses a single logical value (currently `'world'`) for all vertices and edges.

### Rationale (MVP Concession)

- Small initial vertex set keeps RU + storage comfortably within a single logical partition.
- Uniform value simplifies seeding, idempotent edge creation, and traversal queries while repositories and validation logic stabilize.
- Centralizing the value (see ADR-002) lowers migration risk; call sites do not hard‑code literals.

### Evolution Path (Region Sharding)

Future scaling introduces region/biome partition values (e.g., `mosswell`, `northern_ridge`). Location creation will deterministically derive a region key; cross‑region travel remains infrequent enough that occasional cross‑partition traversals are acceptable.

### Revisit Triggers

- > 50k world vertices OR sustained RU utilization > 70% for 3 consecutive days.
- Hot partition RU concentration (> 40% of total RU in 1 logical partition) or repeated 429 throttles on traversal at < 50 RPS.
- Planned large region generation (bulk location ingestion) that would immediately exceed 10k new vertices in one batch.

### Migration (High-Level Reference)

Migration steps (export, region mapping, reingest, edge recreation, flip) are detailed in ADR-002. This appendix simply records that the current single-partition concession is intentional and bounded.

### Source of Truth

For the full, living decision record and thresholds, see **ADR-002: Graph Partition Strategy**. This appendix exists to anchor Mosswell persistence documentation and avoid ambiguity for early contributors reviewing only ADR-001.

---

This condensed ADR intentionally omits narrative detail; see archive for full context.
