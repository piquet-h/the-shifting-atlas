# Architecture Index

This folder contains the _technical_ design of The Shifting Atlas. Prefer this index when you want the canonical doc for a topic without reading every file.

## Read these first

- `overview.md` — stable “bridge” doc: what’s implemented vs planned, and why the architecture looks the way it does.
- `mvp-azure-architecture.md` — concrete MVP resource shape + dual persistence model.
- `frontend-api-contract.md` — request/response contracts the frontend relies on.

## World model & persistence

- `cosmos-sql-containers.md` — container catalog and operational notes.
- `cosmos-sql-api-schema.md` — document schema guidance (field-level expectations).
- `sql-repository-pattern.md` — repository abstraction patterns for Cosmos SQL.
- `cosmos-database-naming.md` — naming conventions and consistency rules.

## World traversal, exits, and spatial structure

- `world-spatial-generation-architecture.md` — how the spatial world is generated/expanded.
- `exit-generation-hints.md` — guidance and invariants for exit creation.
- `location-version-policy.md` — versioning rules when locations/exits change.
- `realm-hierarchy.md` — scope inheritance model used across world features.

## Events, async processing, and safety

- `world-event-contract.md` — the WorldEvent envelope contract + implementation references.
- `event-classification-matrix.md` — decision tree: synchronous vs queued vs AI work.

## AI / Agents / MCP

- `agentic-ai-and-mcp.md` — canonical architecture for MCP tool surfaces and agent runtimes.
- `intent-parser-agent-framework.md` — intent parsing architecture (IR, gating, evolution path).
- `dnd-5e-agent-framework-integration.md` — D&D 5e integration wiring and boundaries.
- `ab-testing-implementation.md` — deterministic prompt/behavior A/B testing patterns.

## Description layering & integrity

- `layer-overlap-policy.md` — rules for combining layers without contradiction.
- `hero-prose-layer-convention.md` — conventions for “hero prose” and narrative layers.
- `integrity-hash-system.md` — integrity hash computation and anomaly handling.
- `narration-governance.md` — validator pipeline mechanics and bounded creativity enforcement.
- `parameterized-action-flow.md` — execution spec for intent → parameter diff → narration composition.
- `perception-actions.md` — execution spec for non-mutating sensory actions and transient flags.
- `scene-synthesiser.md` — post-composition optional scene enrichment (latency/caching contract).

## Workbooks, dashboards, and operational analytics

- `workbook-parameter-guidelines.md` — parameter rules for Application Insights workbooks.

## Dependency injection patterns

- `dependency-injection.md` — DI conventions and patterns (kept here to avoid drift).

## If you can’t find something

- Search within `docs/architecture/` first.
- If the content is about gameplay semantics rather than implementation details, check `../design-modules/`.
