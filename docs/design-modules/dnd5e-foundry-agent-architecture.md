# D&D 5e API Integration (Agent-runtime agnostic)

**Status**: Design Proposal  
**Created**: 2026-01-30  
**Purpose**: Map D&D 5e SRD API endpoints to the Shifting Atlas multi-role architecture (combat, spells, NPCs, monsters) without depending on a specific hosted agent portal/runtime.

> **Note**: Earlier iterations of this doc assumed specific Foundry portal features. In practice, portal capabilities can vary by tenant/API version. This design module therefore treats Foundry as an optional future runtime and keeps the integration **tool-surface-driven**.

> Technical wiring details belong in `docs/architecture/` (see `../architecture/agentic-ai-and-mcp.md`).

---

## Executive Summary

Integrate D&D 5e System Reference Document (SRD) API into The Shifting Atlas via **AI roles** to enable:

- Rules-accurate combat resolution
- Spell validation and narrative generation
- Monster/NPC behavior templates
- Equipment and magic item discovery

**Core Principle**: D&D API provides mechanics; Shifting Atlas AI roles transform mechanics into narrative via the existing DM narrator persona.

**Architecture Decision (2026-01-30)**: **Adapter-first approach** — All D&D access is expressed as tool calls with stable schemas.

- ✅ **Read-only lookups** → D&D adapter tools (can be implemented in a local **server-side** runner, or behind the backend MCP server)
- ✅ **Stateful operations** → Backend tools only (MCP endpoints) that combine D&D mechanics + world state + telemetry + persistence

---

## Role Topology

### 1. **Combat Resolver Agent** (`combat-resolver`)

**What it does**: adjudicates combat mechanics (rolls, hit/miss, damage, conditions) and produces a structured combat outcome that the DM narrator can render.

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
- a short narrative stub (2–3 sentences) for the DM narrator to incorporate

---

### 2. **Magic & Spells Agent** (`spell-authority`)

**What it does**: validates whether a spell can be cast in the current context and computes the mechanical effects (DCs, targeting, damage/healing) for the combat resolver + DM narrator.

**Responsibilities**:

- Validate if player/NPC can cast requested spell
- Calculate save DCs and area-of-effect
- Determine material component requirements
- Generate narrative description of spell effects

**Example Flow**:

```
Player: "I cast Fireball at the goblins"
→ Spell Authority validates:
  ✓ Player is wizard level 5+
  ✓ 3rd-level spell slot available
  ✓ Targets within 150 ft range
→ Returns: { dc: 15, damage: "8d6", saveType: "DEX", affectedTargets: ["goblin-1", "goblin-2"] }
→ DM Narrator: "You unleash arcane fury. The goblins scatter—one dives left..."
```

---

### 3. **Monster & NPC Catalog Agent** (`bestiary`)

**What it does**: provides SRD monster reference, encounter suggestions, and lightweight behavior hooks that can be contextualized by the DM narrator.

**Responsibilities**:

- Suggest contextually appropriate monsters for encounters
- Provide stat blocks for combat resolution
- Generate NPC personality hooks from traits
- Cache frequently-used monsters (goblins, wolves, bandits)

**Wandering NPC example (conceptual)**:

- Use SRD stats (speed, senses, alignment cues) to shape a simple movement/engagement tendency.
- Hand the resulting intent (e.g., “patrol”, “ambush”, “flee when bloodied”) to the DM narrator for rendering.

---

### 4. **Character Rules Agent** (`character-authority`)

**What it does**: validates whether a player action is plausible given class/background capabilities and suggests appropriate skill/proficiency framing.

**Responsibilities**:

- Validate if player action aligns with class capabilities
- Suggest narratively plausible actions based on background
- Provide proficiency bonuses for skill checks
- Track level-based feature unlocks

**Integration with Narrative System**:

```
Player: "I use my sailor background to read these nautical charts"
→ Character Authority: { background: "sailor", proficiencies: ["navigator's tools", "water vehicles"], plausible: true }
→ DM Narrator: "Your sea-weathered eyes trace the lines... [success narrative]"
```

---

### 5. **Equipment & Treasure Agent** (`quartermaster`)

**What it does**: generates loot outcomes appropriate to encounter context and describes them in a way that supports Narrative Consistency.

**Responsibilities**:

- Procedurally generate treasure appropriate to location/encounter CR
- Validate item usage (attunement requirements, class restrictions)
- Calculate encumbrance (if tracked)
- Describe magic item discovery narratively

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

- **SRD reference is advisory**: D&D SRD data informs adjudication, but canonical world state is still Shifting Atlas state.
- **Read-only vs stateful split**:
    - read-only SRD lookups can be served from an adapter (runner or backend)
    - any action that mutates world state must cross the backend validation boundary
- **No browser secrets**: local website UX must not embed model credentials in client-side code.

Technical details (tool names, schemas, and the live MCP catalog) are maintained in `../architecture/agentic-ai-and-mcp.md`.

For the D&D-specific specialization layer, see: [Agentic AI & MCP (Section C)](../architecture/agentic-ai-and-mcp.md#c-dd-5e-integration-domain-specialization).

## See also

- `../architecture/agentic-ai-and-mcp.md` (tool surface + orchestration boundaries)
- `../developer-workflow/local-dev-setup.md` (run the local website + backend)

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
