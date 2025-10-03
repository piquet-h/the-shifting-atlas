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
P3: Ambient registry & ordering.
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

---

This condensed ADR intentionally omits narrative detail; see archive for full context.
