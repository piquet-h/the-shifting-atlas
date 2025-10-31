# The Shifting Atlas: Vision & Decision Tenets

## What We Are Building

The Shifting Atlas is a persistent, event‑driven multiplayer text world where **narrative layering**, **deterministic AI assistance**, and **modular systemic expansion** converge. Players traverse a graph of locations enriched by additive description layers, engage with humorous DM‑style narration, and influence evolving world history through validated events. The platform balances imaginative emergence with architectural discipline: a dual persistence model (immutable world graph + mutable SQL state) and strict telemetry governance enable replay, observability, and safe extension.

## Core Experience Pillars

1. Spatial Storytelling: Movement and location context create a navigable, lore‑rich fabric.
2. Narrative Layering: Base prose remains immutable; context (weather, faction marks, ambience) accumulates additively.
3. Humorous Guidance: A lightly eccentric narrator converts ambiguity into playful, non‑blocking outcomes.
4. Deterministic AI Support: Prompt templates are hashed/versioned; advisory outputs validated before materialization.
5. Event‑Driven Evolution: Player commands & systemic ticks produce auditable world events; processors advance state asynchronously.
6. Extensible Systems: Factions, quests, dungeons, economy, and extension hooks integrate via explicit contracts—not ad‑hoc coupling.
7. Safe Multiplayer: Anti‑grief patterns reduce disruptive incentives; cooperative progression favored.

## Decision Tenets (Guiding Principles)

| Tenet                                                       | Rationale                                   | Tradeoff Accepted                          |
| ----------------------------------------------------------- | ------------------------------------------- | ------------------------------------------ |
| Prefer narrative humour & gameplay over accurate simulation | Maintains engagement & accessibility        | Reduced simulation fidelity                |
| Determinism over raw randomness                             | Enables replay, debugging, cost control     | Requires managed variation mechanisms      |
| Immutable base prose, additive layering only                | Prevents lore drift & retcon conflicts      | Requires provenance & layering validator   |
| Centralized telemetry event names (no inline literals)      | Ensures schema consistency, low cardinality | Slight upfront governance overhead         |
| Advisory AI before mutation                                 | Mitigates risk & hallucination side effects | Slower path to autonomous generation       |
| Idempotent world operations                                 | Safe retries under transient failures       | Additional existence checks per operation  |
| Separation of concept, architecture, execution facets       | Reduces documentation drift & leakage       | Initial reorganization cost                |
| Feature flags for emergent mechanics                        | Controlled rollout & rollback               | More configuration surface                 |
| Player clarity > simulation realism                         | Avoids opaque complexity & grief vectors    | Some systems simplified (economy, physics) |
| Extensibility sandboxed & versioned                         | Protects core stability & security          | Integration friction for third parties     |

## Facet Boundaries

| Facet        | Scope                                 | Mutation Frequency | Example Docs                                                          |
| ------------ | ------------------------------------- | ------------------ | --------------------------------------------------------------------- |
| Concept      | Narrative, systemic invariants        | Low                | `concept/exits.md`, `concept/dungeons.md`                             |
| Architecture | Technical persistence & integration   | Medium             | `architecture/overview.md`, `adr/ADR-002-graph-partition-strategy.md` |
| Execution    | Plans, sequencing, milestone progress | High               | `execution/modules-implementation.md`, `execution/roadmap.md`         |

## World Modeling Principles

- Graph-first spatial semantics (locations & exits as vertices/edges).
- Dual persistence: Gremlin (immutable structure) + SQL API (mutable player/inventory/events).
- Stable GUIDs for all entities; no composite natural keys.
- Idempotent creation/removal for exits, layers, events.
- Partition evolution gated by empirical RU telemetry (per ADR‑002).

## AI Integration Strategy

- Stage M3: Read‑only MCP servers (world-query, prompt-template, telemetry).
- Stage M4+: Narrative enrichment via validated additive layers.
- Mutation gates (write proposals) only after deterministic validators & cost telemetry mature.

## Anti-Grief Patterns

- Low reward loops for pure disruption (no progression via spam failure).
- Shared cooperative benefits favored (dungeon instance scaling, faction reputation group actions).
- Auditable events + correlation IDs enable moderation & rollback.

## Extension Philosophy

Sandboxed hooks, schema‑validated proposals, explicit version contracts. No direct graph writes; proposals emit events validated against invariants (exit uniqueness, layering immutability).

## Success Metrics (Foundational)

- Traversal reliability (move success rate ≥95%).
- Layering integrity (0 retcon violations per audit window).
- Advisory AI pass-through latency within budget (< defined threshold) with deterministic hash match rate ≥99%.
- Telemetry schema error rate <2% per sprint.
- Extension sandbox rejection clarity (≥90% proposals return structured reasons).

## Evolution Path Snapshot

1. Foundation (M0–M1): Movement & persistence baseline.
2. Observability (M2): Instrument & tune.
3. Advisory AI (M3): Read contextual surfaces.
4. Layering & Enrichment (M4): Narrative additive expansion.
5. Systems (M5): Factions, economy signals, extension sandbox.
6. Episodic Instances (M6): Dungeon runs with replayable templates.

## Related References

| Topic                   | Doc                                       |
| ----------------------- | ----------------------------------------- |
| Architecture bridge     | `architecture/overview.md`                |
| Partition strategy      | `adr/ADR-002-graph-partition-strategy.md` |
| Exit invariants         | `concept/exits.md`                        |
| Direction normalization | `concept/direction-resolution-rules.md`   |
| Dungeon runs concept    | `concept/dungeons.md`                     |
| Implementation clusters | `execution/modules-implementation.md`     |

## Change Governance

Tenet modifications require brief rationale & updated tradeoff row; major shifts may trigger an ADR. Facet boundary changes must update this file + affected cross-links.

## Change Log

| Date       | Change                                                    |
| ---------- | --------------------------------------------------------- |
| 2025-10-31 | Initial creation (vision & decision tenets consolidated). |

---

_Authored: 2025-10-31_
