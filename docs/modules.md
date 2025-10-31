# Module Index (Concept & Architecture Separation)

This index provides a concise catalog of gameplay (concept) modules and platform (architecture) modules. It deliberately excludes implementation details (roadmaps, milestones, sequencing) which now live in `modules-implementation.md`. Each entry lists:
Purpose – why the module exists.
Core Invariants – constraints that must remain true long‑term.
Phase – lifecycle state (idea → design → scaffold → in‑progress → active).

## 1. Gameplay / Narrative & Systems Modules

These shape player experience, world consistency, or emergent systems.

| Module                  | Purpose                                                                                                | Core Invariants                                                                                  | Phase       |
| ----------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ----------- |
| Navigation & Traversal  | Enable movement & spatial reasoning over a graph of locations/exits.                                   | Exits are directional edges; movement validates existence & permissions; no hidden side effects. | in‑progress |
| Description Layering    | Preserve immutable base prose; allow additive contextual variation (weather, ambience, faction marks). | Base never rewritten; layers validated; provenance recorded.                                     | design      |
| World Rules & Lore      | Cohesive thematic + systemic constraints.                                                              | Canonical codex; lore changes gated; no retconning base canon.                                   | design      |
| Player Identity & Roles | Persist player capabilities, alignment, progression.                                                   | Stable GUID; alignment changes logged; role grants explicit.                                     | idea        |
| Factions & Governance   | Model power blocs & reputation loops.                                                                  | Reputation bounded; faction effects explicit and reversible.                                     | idea        |
| Multiplayer Mechanics   | Shared state & cooperative actions.                                                                    | Server authoritative; conflict resolution deterministic.                                         | idea        |
| Quest & Dialogue Trees  | Branching narrative & NPC interaction scaffolding.                                                     | Branch state serializable; dialogue choices auditable.                                           | idea        |
| Economy & Trade         | Resource flows & pricing signals.                                                                      | No negative currency overflow; pricing deterministic per tick.                                   | idea        |
| Inventory & Items       | Player/item ownership & equipment effects.                                                             | Item IDs stable; durability optional & bounded.                                                  | idea        |

## 2. Platform / Technical Architecture Modules

These provide infrastructure, integration, or system‑level affordances enabling gameplay modules.

| Module                 | Purpose                                                                  | Core Invariants                                                      | Phase  |
| ---------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------- | ------ |
| AI Prompt Engineering  | Deterministic, hashable prompt templates enabling replay & cost control. | Templates versioned; inputs structured; no inline ad‑hoc prompts.    | design |
| Extension Framework    | Allow safe third‑party content & hooks.                                  | Sandboxed; hook vetoes logged; versioned contract.                   | idea   |
| Geospatial & Hydrology | Multi‑scale biome & water context for traversal + prompt facts.          | Deterministic tiling; hydrology graph separate from traversal edges. | idea   |
| Observability (cross)  | Unified telemetry taxonomy & correlation.                                | Event names centralized; dimensions bounded; no inline literals.     | active |

Notes:

- "Observability" included for architectural completeness (see `observability.md`). It is not a gameplay surface but an enabling platform concern.
- Cross‑cutting modules without player‑facing semantics appear only in this section.

## 3. Reading Order (MVP Focus)

Gameplay First: Navigation & Traversal → Description Layering → Player Identity (skeleton)
Platform Support: AI Prompt Engineering (read‑only MPC scope) → Observability → Extension Framework (only if integrating external tools early)

Rationale: Traversal establishes spatial verbs; description layering enriches base text; identity underpins personalization; prompt engineering constrains AI cost & determinism; observability ensures measurable iteration.

## 4. Forward Consolidation Policy

Speculative gameplay modules (Economy, Factions, Multiplayer) remain lightweight until a milestone elevates them. Upon elevation their dedicated doc should normalize to:
Problem → Invariants → Interfaces. Historical speculative notes should be archived rather than expanded in this index.

## 5. Related High‑Level References

| Doc Path                                  | Focus                                     |
| ----------------------------------------- | ----------------------------------------- |
| `architecture/overview.md`                | Platform rationale & high‑level structure |
| `observability.md`                        | Telemetry naming & dimensions             |
| `adr/ADR-002-graph-partition-strategy.md` | Graph partition evolution                 |
| `concept/direction-resolution-rules.md`   | Movement validation rules                 |
| `vision-and-tenets.md`                    | Vision & decision principles              |

## 6. Implementation Plans Relocated

All roadmap sequencing, milestones, dependency ordering, and phased deliverables have been moved to `execution/modules-implementation.md`. This keeps conceptual invariants stable while allowing the implementation plan to evolve independently.

## 7. Changelog

- 2025-10-31: Separated concept vs architecture; extracted implementation planning to `modules-implementation.md`.
- 2025-10-19: Rewritten to concise index; removed narrative vision & exhaustive bullet expansions.
