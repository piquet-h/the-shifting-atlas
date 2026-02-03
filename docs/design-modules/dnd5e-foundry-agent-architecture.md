# D&D 5e API Integration (Tool-surface-driven)

**Status**: Design Proposal  
**Created**: 2026-01-30  
**Purpose**: Map D&D 5e SRD API endpoints to the Shifting Atlas multi-role architecture (combat, spells, NPCs, monsters) without depending on a specific hosted agent portal/runtime.

> **Note**: Earlier iterations of this doc assumed specific Foundry portal features. In practice, portal capabilities can vary by tenant/API version. This design module keeps the integration **tool-surface-driven** and avoids portal-specific assumptions.

> Technical wiring details belong in `docs/architecture/` (see `../architecture/agentic-ai-and-mcp.md`).

This file is a **design-module-level contract** for how the D&D 5e ruleset plugs into The Shifting Atlas. It intentionally avoids re-stating generic MCP/agent architecture and avoids defining narration style.

- Agent/tool wiring and trust boundaries: `../architecture/agentic-ai-and-mcp.md`
- AI behavior inside constraints (grounding, refusal/deferral, uncertainty): `./ai-prompt-engineering.md`

---

## Executive Summary

Integrate D&D 5e System Reference Document (SRD) API into The Shifting Atlas via **AI roles** to enable:

- Rules-accurate combat resolution
- Spell validation and mechanical effect computation
- Monster/NPC behavior templates
- Equipment and magic item discovery

**Core Principle**: SRD data provides **mechanics reference**. Canonical world state remains Shifting Atlas state; player-facing narration is downstream framing of validated outcomes.

**Architecture Decision (2026-01-30)**: **Adapter-first approach** — All D&D access is expressed as tool calls with stable schemas.

- ✅ **Read-only lookups** → D&D adapter tools exposed via the backend tool surface (MCP/OpenAPI/Azure Functions tool)
- ✅ **Stateful operations** → Backend-controlled validation + persistence only (never direct world mutation from narration)

---

## Role Topology

### 1. **Combat Resolver Agent** (`combat-resolver`)

**What it does**: adjudicates combat mechanics (rolls, hit/miss, damage, conditions) and produces a structured combat outcome for deterministic persistence and downstream rendering.

**Responsibilities**:

- Calculate attack rolls (d20 + mods vs AC)
- Resolve damage (weapon dice + ability mods)
- Track initiative, conditions, and turns
- Emit structured combat log to Cosmos events collection

**Inputs (conceptual)**:

- participant stats (player + NPC instances)
- action intent (attack, cast, dodge)
- environment modifiers (cover, surprise, etc.)

**Outputs (conceptual)**:

- a structured combat result (rolls, effects, completion)
- optional presentational hints (non-authoritative) that a narrator layer may use

---

### 2. **Magic & Spells Agent** (`spell-authority`)

**What it does**: validates whether a spell can be cast in the current context and computes the mechanical effects (DCs, targeting, damage/healing) for the combat resolver + narrator layer.

**Responsibilities**:

- Validate if player/NPC can cast requested spell
- Calculate save DCs and area-of-effect
- Determine material component requirements
- Produce a structured spell effect summary suitable for validation + resolution

**Example Flow**:

```
Player: "I cast Fireball at the goblins"
→ Spell Authority validates:
  ✓ Player is wizard level 5+
  ✓ 3rd-level spell slot available
  ✓ Targets within 150 ft range
→ Returns: { dc: 15, damage: "8d6", saveType: "DEX", affectedTargets: ["goblin-1", "goblin-2"] }
→ Narrator layer renders: player-facing description consistent with the validated result
```

---

### 3. **Monster & NPC Catalog Agent** (`bestiary`)

**What it does**: provides SRD monster reference, encounter suggestions, and lightweight behavior hooks that can be contextualized by the narrator layer.

**Responsibilities**:

- Suggest contextually appropriate monsters for encounters
- Provide stat blocks for combat resolution
- Generate NPC personality hooks from traits
- Cache frequently-used monsters (goblins, wolves, bandits)

**Wandering NPC example (conceptual)**:

- Use SRD stats (speed, senses, alignment cues) to shape a simple movement/engagement tendency.
- Hand the resulting intent (e.g., “patrol”, “ambush”, “flee when bloodied”) to the narrator layer for rendering.

---

### 4. **Character Rules Agent** (`character-authority`)

**What it does**: validates whether a player action is plausible given class/background capabilities and returns structured adjudication support (e.g., relevant proficiencies, features, and constraints).

**Responsibilities**:

- Validate if player action aligns with class capabilities
- Suggest narratively plausible actions based on background
- Provide proficiency bonuses for skill checks
- Track level-based feature unlocks

**Integration with Narrative System**:

```
Player: "I use my sailor background to read these nautical charts"
→ Character Authority: { background: "sailor", proficiencies: ["navigator's tools", "water vehicles"], plausible: true }
→ Narrator layer renders: a player-facing outcome consistent with the adjudication
```

---

### 5. **Equipment & Treasure Agent** (`quartermaster`)

**What it does**: generates loot outcomes appropriate to encounter context and returns structured results that a narrator layer can describe.

**Responsibilities**:

- Procedurally generate treasure appropriate to location/encounter CR
- Validate item usage (attunement requirements, class restrictions)
- Calculate encumbrance (if tracked)
- Provide optional presentational hints (non-authoritative)

**Treasure Generation Example**:

```json
// Input: { encounterCR: 5, locationTheme: "ancient-library" }
// Output:
{
    "loot": [
        { "item": "Potion of Healing", "rarity": "common", "value": 50 },
        { "item": "Scroll of Identify", "rarity": "uncommon", "value": 100, "requiresAttunement": false },
        { "item": "Dusty Tome", "custom": true, "loreHook": "Contains fragmentary map to the Shifting Isles" }
    ],
    "narrative": "Beneath the toppled lectern, you find..."
}
```

---

## Design rules & boundaries

This module follows `docs/tenets.md` (especially [Tenet #7: Narrative Consistency](../tenets.md#7-narrative-consistency) and its bounded plausibility boundary).

### Authority Boundary: Mechanics, State, and Narration

This is the D&D-specific restatement of the broader boundary in `../architecture/agentic-ai-and-mcp.md#b-authority-boundary-canonical-state-vs-narrative-plausibility`.

**Deterministic systems are authoritative** (mechanics resolution, spatial validation, temporal reconciliation, entity state).

AI agents may:

- query authoritative systems (via tools),
- propose interpretations (e.g., which rule applies),
- and generate narrative explanations of outcomes.

AI agents may not:

- introduce facts that contradict canonical state,
- bypass mechanics or traversal constraints,
- or cause world state to change through narration alone.

Narration exists to explain how a valid outcome occurs, not to make an invalid outcome acceptable.

- **SRD reference is advisory**: D&D SRD data informs adjudication, but canonical world state is still Shifting Atlas state.
- **Read-only vs stateful split**:
    - read-only SRD lookups are served via adapters with stable schemas
    - any action that mutates world state must cross the backend validation boundary
- **No browser secrets**: local website UX must not embed model credentials in client-side code.

Technical details (tool names, schemas, and the live MCP catalog) are maintained in `../architecture/agentic-ai-and-mcp.md`.

For the D&D-specific specialization layer, see: [Agentic AI & MCP (Section C)](../architecture/agentic-ai-and-mcp.md#c-dd-5e-integration-domain-specialization).

## See also

- `../architecture/agentic-ai-and-mcp.md` (tool surface + orchestration boundaries)

## Open Questions

1. **Combat UI**: Should combat be interactive (turn-by-turn) or automated (resolved in single API call)?
2. **NPC Persistence**: How long do wandering NPCs live? (Delete after 24hr idle? Persist indefinitely?)
3. **Spell Slots**: Track per long rest? Auto-regenerate on schedule? Player-initiated rest?
4. **Character Sheets**: Do players create full D&D character sheets or just narrative backgrounds?
5. **Dice Rolling**: Server-side only or support client-side rolls with verification?

---

## References

- [D&D 5e SRD API Docs](https://5e-bits.github.io/docs/api)
- `../architecture/agentic-ai-and-mcp.md`
- ADR-002: Dual Persistence Strategy
- ADR-004: Player Storage Cutover
