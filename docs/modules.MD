# Module Index (Essence)

Single‑page index of active or planned gameplay and platform modules. Each entry captures: Purpose (why it exists), Core Invariants (what must remain true), and Current Phase (idea → design → scaffold → in‑progress → active).

This page intentionally omits deep mechanics detail—see the linked module doc when you need full rationale. If a module doc becomes mostly historical or speculative, prune it there rather than expanding this index.

| Module                  | Purpose                                                                                                | Core Invariants                                                                                  | Phase       |
| ----------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ----------- |
| Navigation & Traversal  | Enable movement & spatial reasoning over a graph of locations/exits.                                   | Exits are directional edges; movement validates existence & permissions; no hidden side effects. | in‑progress |
| Description Layering    | Preserve immutable base prose; allow additive contextual variation (weather, ambience, faction marks). | Base never rewritten; layers validated; provenance recorded.                                     | design      |
| Geospatial & Hydrology  | Multi‑scale biome & water context for traversal + prompt facts.                                        | Deterministic tiling; hydrology graph separate from traversal edges.                             | idea        |
| AI Prompt Engineering   | Deterministic, hashable prompt templates enabling replay & cost control.                               | Templates versioned; inputs structured; no inline ad‑hoc prompts.                                | design      |
| World Rules & Lore      | Cohesive thematic + systemic constraints.                                                              | Canonical codex; lore changes gated; no retconning base canon.                                   | design      |
| Player Identity & Roles | Persist player capabilities, alignment, progression.                                                   | Stable GUID; alignment changes logged; role grants explicit.                                     | idea        |
| Factions & Governance   | Model power blocs & reputation loops.                                                                  | Reputation bounded; faction effects explicit and reversible.                                     | idea        |
| Multiplayer Mechanics   | Shared state & cooperative actions.                                                                    | Server authoritative; conflict resolution deterministic.                                         | idea        |
| Quest & Dialogue Trees  | Branching narrative & NPC interaction scaffolding.                                                     | Branch state serializable; dialogue choices auditable.                                           | idea        |
| Extension Framework     | Allow safe third‑party content & hooks.                                                                | Sandboxed; hook vetoes logged; versioned contract.                                               | idea        |
| Economy & Trade         | Resource flows & pricing signals.                                                                      | No negative currency overflow; pricing deterministic per tick.                                   | idea        |
| Inventory & Items       | Player/item ownership & equipment effects.                                                             | Item IDs stable; durability optional & bounded.                                                  | idea        |

### Forward Consolidation

Some module docs are speculative (Economy, Factions, Multiplayer). They remain placeholders until a milestone promotes them to active design; at that point their standalone doc should shrink to: Problem → Invariants → Interfaces.

### Reading Order (MVP Focus)

1. Navigation & Traversal
2. Description Layering
3. AI Prompt Engineering (scoped to read‑only MCP use)
4. Extension Framework (only if integrating external tools)

### Related High‑Level Docs

-   `architecture/overview.md` – platform why
-   `observability.md` – telemetry naming & dimensions
-   `adr/ADR-002-graph-partition-strategy.md` – partition evolution

---

Changelog:

-   2025-10-19: Rewritten to concise index; removed narrative vision & exhaustive bullet expansions (now covered across dedicated docs & ADRs).
