# Design Modules: Gameplay Systems

Consolidated gameplay mechanics and experiential rules that translate Vision + Tenets into concrete, implementable systems. These modules capture the "what" and "why" of game features before technical architecture defines the "how."

---

## Purpose

Design modules bridge strategic intent (Vision, Tenets) and technical implementation (Architecture, Code). Each module:

1. **Defines experiential goals**: What should the player experience?
2. **Establishes invariants**: What rules must never be violated?
3. **Specifies contracts**: What interfaces do other systems depend on?
4. **Defers implementation details**: How to build it lives in Architecture docs

---

## Core Modules

### 1. World Rules & Lore
**Focus**: Foundational world-building, spatial semantics, canonical narrative constraints

**Key Invariants**:
- Graph-first spatial model (locations as vertices, exits as directed edges)
- Immutable base descriptions (additive layering only)
- Stable GUID identifiers for all entities
- Deterministic world state (no hidden randomness)

**Document**: `../modules/world-rules-and-lore.md`

**Depends On**: Exits concept (`../concept/exits.md`), Direction normalization (`../concept/direction-resolution-rules.md`)

---

### 2. Navigation & Traversal
**Focus**: Player movement, exit mechanics, spatial relationships, direction resolution

**Key Contracts**:
- Normalized direction vocabulary (north, south, east, west, up, down, in, out)
- Exit reciprocity rules (enforced or optional depending on context)
- Movement validation (player-location-exit triad)
- Telemetry events: `Location.Move` (success/failure), `Location.Look`

**Document**: `../modules/navigation-and-traversal.md`

**Depends On**: Exit invariants, Direction normalizer, Player-location edge model

---

### 3. Player Identity & Roles
**Focus**: Player onboarding, GUID bootstrapping, authentication, role progression

**Key Contracts**:
- Guest players receive stable GUID on first visit (cookie-backed)
- Azure AD (Entra) integration for authenticated players
- Role attributes (future: faction affiliation, reputation)
- Player-location tracking (edge-based model per ADR)

**Document**: `../modules/player-identity-and-roles.md`

**Depends On**: Authentication (Azure AD Easy Auth), Player bootstrap flow

---

### 4. Description Layering & Variation
**Focus**: Immutable base prose + additive context layers (weather, faction marks, ambience)

**Key Invariants**:
- Base description layer is immutable (canonical world text)
- Structural layers (weather, time-of-day) applied additively
- Ambient layers (AI-generated micro-lore) validated before persistence
- Provenance tracking (prompt hash + validator decision) for all AI layers

**Document**: `../modules/description-layering-and-variation.md`

**Depends On**: Narrative governance (`../concept/narration-governance.md`), AI integration strategy (Tenets #7)

---

### 5. Quest & Dialogue Trees
**Focus**: Branching narrative, player choices, quest state tracking

**Status**: Planned (M5+)

**Key Contracts** (draft):
- Quest graph (vertices: states, edges: transitions)
- Dialogue options validated against player context (location, inventory, faction)
- Event-driven quest progression (no polling)

**Document**: `../modules/quest-and-dialogue-trees.md`

**Depends On**: Event emission, Player state, Faction module

---

### 6. Economy & Trade Systems
**Focus**: Resource exchange, pricing signals, trade routes, NPC merchant behaviors

**Status**: Planned (M5+)

**Key Contracts** (draft):
- Economy signals (price fluctuations) as world events
- Trade actions validated against inventory and location
- Anti-exploit heuristics (rate limiting, value sanity checks)

**Document**: `../modules/economy-and-trade-systems.md`

**Depends On**: Inventory model, NPC tick skeleton, Faction reputation

---

### 7. Factions & Governance
**Focus**: Player allegiance, reputation systems, faction-specific world modifications

**Status**: Planned (M5+)

**Key Contracts** (draft):
- Faction reputation as player attribute (SQL document)
- Faction-specific description layers (additive, conditional)
- Group actions (cooperative dungeon scaling, faction quests)

**Document**: `../modules/factions-and-governance.md`

**Depends On**: Player roles, Description layering, Quest system

---

### 8. AI Prompt Engineering
**Focus**: Deterministic AI behavior, prompt versioning, bounded creative hallucination

**Key Invariants**:
- Prompt templates stored in version-controlled registry
- Prompt hash recorded with all AI-generated content
- Advisory AI (read-only) before mutation AI (write proposals)
- Classification taxonomy: ambient, structural, ephemeral, flavor

**Document**: `../modules/ai-prompt-engineering.md`

**Depends On**: Narrative governance, Telemetry (AI cost tracking), MCP read-only servers (M3)

---

### 9. Narrative Voice Guidelines
**Focus**: DM persona, humor tone, player-facing text style, AI narration boundaries

**Key Invariants**:
- Consistent DM voice (lightly eccentric, humorous, non-blocking)
- Player clarity > simulation realism
- Ambiguity resolved playfully (never punitive)
- Ephemeral narration does not override canonical base prose

**Document**: `../concept/dungeon-master-style-guide.md`, `../modules/narration-governance.md`

**Depends On**: AI Prompt Engineering, Description Layering

---

## Supporting Concept Documents

These documents define immutable rules and semantic constraints (not gameplay features):

- **Exits**: `../concept/exits.md` – Exit invariants, reciprocity, uniqueness constraints
- **Direction Resolution**: `../concept/direction-resolution-rules.md` – Normalizing cardinal, ordinal, semantic, and relative directions
- **Dungeons**: `../concept/dungeons.md` – Instance-based subgraph mechanics (M6 focus)
- **Parameterized Actions**: `../concept/parameterized-action-flow.md` – Command parsing and parameter resolution
- **Perception Actions**: `../concept/perception-actions.md` – `look`, `examine`, sensory detail hierarchy

---

## Module Dependencies (Visual)

```
Vision & Tenets
       ↓
 Design Modules (this layer)
       ↓
   Architecture (persistence, services, infrastructure)
       ↓
 Roadmap (milestone sequencing)
       ↓
     Code
```

**Dependency Flow**:
1. **World Rules** → foundational for all other modules
2. **Navigation & Traversal** → depends on Exits, Directions
3. **Player Identity** → independent (auth-focused)
4. **Description Layering** → depends on World Rules, AI Prompt Engineering
5. **Quests, Economy, Factions** → depend on Navigation, Player Identity, Layering

---

## Milestone Alignment

| Module                        | Primary Milestone | Status                     |
| ----------------------------- | ----------------- | -------------------------- |
| World Rules & Lore            | M0–M1             | ✅ Foundation established  |
| Navigation & Traversal        | M1                | ✅ Core loop implemented   |
| Player Identity & Roles       | M0–M1             | ✅ Bootstrap complete      |
| Description Layering          | M4                | 🚧 Planned                 |
| AI Prompt Engineering         | M3–M4             | 🚧 Read-only (M3), Write (M4) |
| Narrative Voice Guidelines    | M3–M4             | 🚧 Concurrent with AI      |
| Quest & Dialogue Trees        | M5+               | 📋 Deferred                |
| Economy & Trade               | M5+               | 📋 Deferred                |
| Factions & Governance         | M5+               | 📋 Deferred                |

---

## How to Use This Layer

### For Developers:
- **Starting a new feature?** Check if a design module already defines the contracts.
- **Unclear about invariants?** Read the relevant module + concept docs before writing code.
- **Introducing a new mechanic?** Propose a design module document first (small PRs, design doc reference).

### For Designers:
- **Defining a new system?** Create a new module document under `../modules/` following the template below.
- **Updating an existing system?** Edit the module doc and cross-reference any affected ADRs or architecture docs.

### For AI Context (Copilot, MCP Agents):
- **Need gameplay rules?** Read design modules for the authoritative "what" and "why."
- **Need implementation details?** Refer to `../architecture/` for the "how."

---

## Design Module Template

When creating a new design module:

```markdown
# [Module Name]

**Focus**: One-sentence summary of the experiential goal.

**Status**: Planned | In Progress | Implemented | Deprecated

---

## Objectives

- Bullet list of player-facing goals
- What experience does this enable?

---

## Key Contracts

- Interfaces or events other systems depend on
- Invariants that must never be violated

---

## Rules & Constraints

- Gameplay rules (e.g., "exits must be reciprocal")
- Performance/cost constraints (e.g., "RU budget < 50 per query")
- Accessibility requirements (e.g., "keyboard-navigable menus")

---

## Dependencies

- Other design modules this depends on
- Concept documents that define foundational semantics

---

## Milestone Alignment

| Milestone | Deliverable | Status |
|-----------|-------------|--------|
| Mx        | Feature Y   | ✅ / 🚧 / 📋 |

---

## Related Documentation

- Architecture: [link]
- ADR: [link]
- Concept: [link]

---

_Last updated: YYYY-MM-DD_
```

---

## Quality Standards

All design modules must:
1. ✅ Define clear experiential goals (player-facing outcomes)
2. ✅ Specify invariants and contracts (what other systems rely on)
3. ✅ Avoid implementation details (no Cosmos queries, no Bicep syntax)
4. ✅ Cross-reference dependencies (other modules, concept docs, ADRs)
5. ✅ Include milestone alignment (when will this be built?)

---

## Related Documentation

| Layer                  | Document                                     |
| ---------------------- | -------------------------------------------- |
| Vision (60k ft)        | `../vision-and-tenets.md` (Vision section)   |
| Tenets (50k ft)        | `../tenets.md`                               |
| Architecture (30k ft)  | `../architecture/mvp-azure-architecture.md`  |
| Roadmap (20k ft)       | `../roadmap.md`                              |
| Examples (10k ft)      | `../examples/` (planned)                     |

---

_Last updated: 2025-11-07 (initial creation; consolidated gameplay mechanics from modules/ and concept/)_
