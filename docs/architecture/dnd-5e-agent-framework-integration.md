# D&D 5e API + Microsoft Agent Framework Integration Strategy

## Executive Summary

This document outlines how to integrate the [D&D 5e API](https://5e-bits.github.io/docs/api) with [Microsoft Agent Framework](https://learn.microsoft.com/en-us/agent-framework/overview/agent-framework-overview) to scale The Shifting Atlas as a Gen AI-driven MMORPG text adventure.

**Key Opportunity**: Combine structured D&D 5e game rules with AI-driven narrative generation, world-building, and dynamic storytelling through MCP (Model Context Protocol) servers.

**Core Game Pillars**:

1. **Narrative & Exploration** (Primary) - AI-driven world discovery, DM persona storytelling
2. **Navigation & Traversal** (Foundation) - Graph-based spatial movement, exit mechanics
3. **Description Layering** (Immersion) - Immutable base prose + AI-generated contextual layers
4. **Combat & Mechanics** (D&D Feel) - Structured D&D 5e rules for encounters
5. **Systems & Progression** (Depth) - Economy, factions, quests, character advancement

---

## 1. What is Microsoft Agent Framework?

**Microsoft Agent Framework** is the next-generation successor to Semantic Kernel and AutoGen, combining:

- **AI Agents**: Individual agents that use LLMs to process inputs, call tools/MCP servers, and generate responses
- **Workflows**: Graph-based orchestration of multiple agents and functions for complex multi-step tasks
- **Enterprise Features**: Thread-based state management, type safety, filters, telemetry, extensive model support
- **MCP Support**: Native integration with Model Context Protocol servers for tool integration

**Key Capabilities**:

- Multi-agent orchestration patterns (sequential, concurrent, hand-off, Magentic)
- Built-in checkpointing for long-running processes
- Human-in-the-loop scenarios via request/response patterns
- Strong typing and validation
- Middleware for intercepting agent actions

---

## 2. What is the D&D 5e API?

**D&D 5e SRD API** provides structured access to D&D 5th Edition System Reference Document data:

**Available Endpoints**:

- `ability-scores` - STR, DEX, CON, INT, WIS, CHA
- `alignments` - Lawful Good, Chaotic Evil, etc.
- `classes` - Fighter, Wizard, Rogue, etc.
- `races` - Human, Elf, Dwarf, etc.
- `equipment` - Weapons, armor, adventuring gear
- `equipment-categories` - Organized equipment types
- `magic-items` - Magical equipment
- `spells` - Full spell database (filterable)
- `monsters` - Creature database (filterable)
- `conditions` - Blinded, Charmed, Frightened, etc.
- `damage-types` - Fire, Cold, Piercing, etc.
- `features` - Class/race features
- `traits` - Racial traits
- `proficiencies` - Weapon/tool/skill proficiencies
- `skills` - Acrobatics, Perception, Stealth, etc.
- `backgrounds` - Character backgrounds
- `feats` - Character feats
- `languages` - Common, Elvish, Draconic, etc.
- `magic-schools` - Evocation, Illusion, etc.
- `rules` - Game rules
- `rule-sections` - Organized rule categories
- `subclasses` - Specialized class paths
- `subraces` - Specialized race variants
- `weapon-properties` - Finesse, Heavy, Light, etc.

**Base URL**: `https://www.dnd5eapi.co/api/`

**Filtering**: `monsters` and `spells` endpoints support query parameters for advanced filtering.

---

## 3. Current State: The Shifting Atlas MCP Implementation

### 3.1 Existing MCP Servers

You currently have **two basic MCP servers** implemented as Azure Functions:

#### A. World Query Server (`/mcp/world-query`)

```typescript
// Operations:
// - op=getStarter (returns STARTER_LOCATION_ID)
// - op=getLocation&id=<locationId> (fetches specific location)
```

**Purpose**: Provides read-only access to world graph state (locations from Cosmos DB Gremlin).

#### B. Prompt Template Registry (`shared/src/prompts/` + optional backend endpoint)

```typescript
// Operations:
// - op=list (lists all prompt templates)
// - op=get&name=<templateName> (retrieves specific template)
```

**Purpose**: Exposes versioned prompt templates for AI generation (currently only `ambience.location.v1`).

### 3.2 Existing Prompts

Current template inventory:

- `ambience.location.v1` - Generates ambient sensory descriptions for locations

**Gap**: No D&D-specific prompts for combat, spell effects, NPC behavior, item descriptions, etc.

### 3.3 Architectural Constraints

- **Dual Persistence**: Cosmos DB Gremlin (world graph) + Cosmos DB SQL API (player/inventory/events)
- **Event-Driven**: HTTP player actions → persist → enqueue world events → queue triggers
- **Stateless Functions**: No polling loops, no long-running processes
- **Telemetry**: Application Insights with domain event tracking

---

## 4. Integration Strategy: Three-Tier Architecture

### Tier 1: MCP Servers (Tool Layer)

**Role**: Expose D&D 5e data and game rules as structured tools for agents.

### Tier 2: Agent Framework Agents (Decision Layer)

**Role**: AI agents make decisions about narrative, combat, NPC behavior using tools.

### Tier 3: Workflows (Orchestration Layer)

**Role**: Multi-agent workflows coordinate complex scenarios (dungeon runs, combat encounters).

---

## 5. Proposed MCP Servers for D&D 5e Integration

### Server Priority Framework

MCP servers are prioritized by their dependency relationships and alignment with core game pillars (Narrative & Exploration primary, Combat & Mechanics secondary):

| Priority | Server                | Core Dependency | Rationale                                               |
| -------- | --------------------- | --------------- | ------------------------------------------------------- |
| **P0**   | World Context         | Foundation      | AI needs world state for narrative generation           |
| **P0**   | Narrative Generator   | Foundation      | Core DM persona storytelling                            |
| **P1**   | Description Layering  | World Context   | Immutable base + contextual enrichment                  |
| **P1**   | Lore & Reference      | Narrative       | D&D flavor text, monster descriptions, spell narratives |
| **P2**   | Navigation Assistant  | World Context   | Enhance traversal with spatial reasoning                |
| **P2**   | Monster Database      | Lore            | NPC/enemy encounters in dungeons                        |
| **P2**   | Combat Rules          | Monster DB      | Battle resolution when encounters triggered             |
| **P3**   | Spell Lookup          | Combat Rules    | Player spellcasting mechanics                           |
| **P3**   | Equipment & Inventory | Lore            | Item system, loot generation                            |
| **P3**   | Character Rules       | Equipment       | Character creation, progression                         |

**Design Principle**: Build foundation (world state + narrative) before mechanics (combat + systems). Aligns with tenet "Prefer narrative humor & gameplay over accurate simulation."

---

### 5.1 World Context Server (`/mcp/world-context`) **[P0 - Foundation]**

**Purpose**: Provide AI agents with current world state for contextual narrative generation.

**Operations**:

- `op=getLocationContext&id=<locationId>` → location + exits + nearby players + recent events
- `op=getPlayerContext&id=<playerId>` → player location + inventory + recent actions
- `op=getSpatialContext&id=<locationId>&depth=2` → location graph (N-hop neighbors)
- `op=getRecentEvents&locationId=<id>&count=10` → timeline of world events at location
- `op=getAtmosphere&locationId=<id>` → current weather, time-of-day, ambient conditions

**Data Sources**:

- Cosmos DB Gremlin (location graph, exits, spatial relationships)
- Cosmos DB SQL API (players, inventory, world events)
- Existing World Query MCP (extend current `/mcp/world-query`)

**Example Use Case**: Player types "look around". World Context Server:

1. Retrieves player location + visible exits
2. Gets recent events (another player passed through 5 min ago)
3. Fetches atmospheric layers (stormy weather, dusk)
4. AI Narrative Generator weaves into: "Rain lashes the courtyard as twilight fades. Fresh boot prints lead north toward the old tower. The eastern gate stands ajar, creaking in the wind."

**Integration Point**: Extends existing `backend/src/mcp/worldQuery.ts`

---

### 5.2 Narrative Generator Server (`/mcp/narrative-generator`) **[P0 - M3/M4]**

**Purpose**: Generate DM persona narration for player actions, world events, discoveries.

**Operations**:

- `op=generateAmbience&locationId=<id>` → atmospheric micro-lore (≤120 chars)
- `op=narrateAction&action=move&result=success&context={...}` → "You stride north..."
- `op=narrateDiscovery&entity=chest&rarity=rare` → treasure discovery flavor
- `op=narrateEncounter&monster=goblin&surprise=true` → combat introduction
- `op=generateRumor&locationId=<id>&theme=mystery` → tavern gossip, hooks

**Data Sources**:

- Existing prompt templates (`backend/src/prompts/templates.ts`)
- DM Style Guide (`docs/concept/dungeon-master-style-guide.md`)
- World Context Server (for spatial awareness)
- Lore & Reference Server (for D&D flavor)

**Prompt Template Expansion**:

```typescript
{
  name: 'narration.movement.v1',
  version: '1.0.0',
  purpose: 'Generate movement narration in DM persona (wry, theatrical)',
  body: `You are a theatrical Dungeon Master. Player moved {direction} from {origin} to {destination}.
         Exits: {exitList}. Tone: wry, slightly unhinged, immersive.
         Generate 1-2 sentences (≤200 chars). Reference prior context if provided.`
},
{
  name: 'narration.discovery.v1',
  version: '1.0.0',
  purpose: 'Generate item/feature discovery in DM persona',
  body: `DM narration for discovering: {entityType} ({rarity}).
         Location context: {locationDesc}.
         Tone: campy theatricality, dry humor. 2-3 sentences.`
},
{
  name: 'narration.combat-intro.v1',
  version: '1.0.0',
  purpose: 'Generate combat encounter introduction',
  body: `Theatrical DM introduction for combat encounter.
         Monster: {monsterName} ({monsterType}, CR {challengeRating}).
         Surprise: {isSurprise}. Tone: dramatic tension + wry humor.`
}
```

**Example Use Case**: Player attacks goblin. Narrative Generator:

1. Receives combat result (hit, 9 damage)
2. Queries Monster DB for goblin flavor text
3. Applies DM persona template
4. Generates: "Your blade finds its mark with theatrical precision. The goblin's eyes widen in what might be surprise or indigestion—hard to say with goblins. (9 damage)"

**Implementation Location**: `backend/src/mcp/narrativeGenerator.ts`

---

### 5.3 Description Layering Server (`/mcp/description-layering`) **[P1 - M4]**

**Purpose**: Manage immutable base descriptions + additive contextual layers.

**Operations**:

- `op=getBase&locationId=<id>` → immutable canonical description
- `op=applyLayers&locationId=<id>&layers=weather,ambience,faction` → composited description
- `op=proposeLayer&locationId=<id>&type=ambient&content=...` → validate + persist layer
- `op=validateLayer&content=...&baseHash=<hash>` → check for canon drift
- `op=getProvenance&layerId=<id>` → prompt hash + validator decision

**Data Sources**:

- Cosmos DB SQL API (`descriptionLayers` container, PK: `/locationId`)
- Narrative Generator Server (for AI-generated ambient layers)
- World Context Server (for structural layers: weather, time)

**Layer Types** (per design modules):

- **Base** (immutable): Canonical world prose
- **Structural** (deterministic): Weather, time-of-day, seasonal
- **Ambient** (AI-generated): Micro-lore, sensory details, atmospheric fragments
- **Faction** (conditional): Faction-specific world modifications (M5+)

**Example Use Case**: Player enters dungeon. Layering Server:

1. Retrieves base description: "A stone corridor stretches into darkness."
2. Applies structural layer (cold, damp): "+ Moisture beads on the walls."
3. Applies ambient layer (AI): "+ The air tastes of old secrets and older fear."
4. Returns composited description with provenance tracking

**Validation Rules**:

- Ambient layers must not contradict base description
- AI-generated content flagged for human review if confidence < threshold
- Prompt hash recorded for all AI layers (reproducibility)
- Layer removal requires justification (audit log)

**Implementation Location**: `backend/src/mcp/descriptionLayering.ts`

---

### 5.4 Lore & Reference Server (`/mcp/lore-reference`) **[P1 - M3/M4]**

**Purpose**: Provide D&D 5e flavor text, monster lore, spell narratives for AI enrichment.

**Operations**:

- `op=getMonsterLore&name=beholder` → D&D 5e monster description + flavor
- `op=getSpellNarrative&spell=fireball` → dramatic spell description
- `op=getItemLore&item=bag-of-holding` → magic item backstory
- `op=getLocationTheme&biome=underdark` → atmospheric guidelines for biome
- `op=searchLore&query=ancient+dragons&type=monster` → fuzzy search D&D content

**Data Sources**:

- D&D 5e API: `/api/monsters` (descriptions), `/api/spells` (flavor text), `/api/magic-items`
- Cached common entries (top 100 monsters, spells)
- Custom lore additions (your world-specific content)

**Example Use Case**: AI generates dungeon room. Lore & Reference Server:

1. Queries D&D 5e API for "goblin" lore
2. Returns: "Small, black-hearted humanoids that lair in dark places..."
3. AI Narrative Generator weaves into room description
4. Result: "The chamber reeks of goblin habitation—a particular blend of mildew and poor life choices."

**Caching Strategy**:

- Pre-populate cache with SRD monsters (goblins, orcs, kobolds, dragons)
- TTL: 7 days for API responses
- Fallback to API if cache miss

**Implementation Location**: `backend/src/mcp/loreReference.ts`

---

### 5.5 Navigation Assistant Server (`/mcp/navigation-assistant`) **[P2 - M1/M3]**

**Purpose**: Enhance spatial reasoning and traversal with AI-powered suggestions.

**Operations**:

- `op=suggestDirection&from=<id>&goal=<description>` → "Try going north"
- `op=describeJourney&path=[id1,id2,id3]` → narrative journey summary
- `op=identifyLandmarks&locationId=<id>&radius=3` → notable nearby locations
- `op=inferIntent&query="find the tavern"` → resolve to location ID
- `op=validatePath&from=<id>&to=<id>` → check if path exists

**Data Sources**:

- Cosmos DB Gremlin (graph traversal, pathfinding)
- World Context Server (location metadata)
- Existing direction normalizer (`shared/src/direction.ts`)

**Example Use Case**: Player asks "how do I get to the tavern?". Navigation Assistant:

1. Searches graph for location matching "tavern"
2. Calculates shortest path from player location
3. AI generates: "The Rusty Flagon lies two blocks east and one north. Head out the main gate, turn right at the fountain, then follow the sound of questionable singing."

**Spatial Reasoning Enhancements**:

- Semantic exit resolution (M1 deferred items: "go to tower", "enter tavern")
- Relative directions (M1 deferred: "turn around", "go back")
- Multi-hop pathfinding with narrative summaries

**Implementation Location**: `backend/src/mcp/navigationAssistant.ts`

---

### 5.6 Monster Database Server (`/mcp/monster-db`) **[P2 - M5/M6]**

**Purpose**: Access creature statistics for NPC/enemy generation and combat.

**Operations**:

- `op=getRandom&challengeRating=5` → random CR 5 monster
- `op=search&name=goblin` → specific monster
- `op=filter&type=undead&cr=3` → filtered list
- `op=getAbilities&monster=ancient-red-dragon` → abilities, actions, legendary actions
- `op=getEncounterBudget&partyLevel=5&difficulty=medium` → XP budget for balanced encounter

**Data Sources**:

- D&D 5e API: `/api/monsters` (supports filtering)
- Cache common encounters (goblins, orcs, skeletons, zombies)

**Example Use Case**: AI generates dungeon encounter. Monster DB Server:

1. Queries for CR-appropriate monsters (party level 3)
2. Returns: 2d4 goblins + 1 goblin boss (CR 1)
3. Narrative Generator creates introduction
4. Combat Rules Server handles mechanics when battle starts

**Encounter Design Integration**:

- XP budget calculation per D&D 5e DMG tables
- Monster tactics suggestions (based on INT/WIS scores)
- Lair actions for legendary creatures
- Environmental hazards (traps, terrain)

**Implementation Location**: `backend/src/mcp/monsterDb.ts`

---

### 5.7 Combat Rules Server (`/mcp/combat-rules`) **[P2 - M5/M6]**

**Purpose**: Provide D&D 5e combat mechanics for battle resolution.

**Operations**:

- `op=calculateAttack&attackBonus=X&targetAC=Y` → hit/miss determination
- `op=rollDamage&diceExpression=2d6+3` → damage calculation
- `op=getCondition&name=stunned` → condition effects
- `op=checkSavingThrow&ability=dexterity&dc=15&modifier=2` → save results
- `op=calculateInitiative&modifiers=[...]` → turn order
- `op=resolveAttackOfOpportunity&trigger=movement` → AoO determination

**Data Sources**:

- D&D 5e API: `/api/conditions`, `/api/damage-types`, `/api/rules` (combat section)
- Local cache of combat rules (reduce API calls)
- Monster DB Server (for creature stats)

**Example Use Case**: Player attacks goblin. Combat Rules Server:

1. Receives: player attack bonus +5, goblin AC 15
2. Rolls d20 → 12 + 5 = 17 (hit!)
3. Rolls damage: 1d8+3 → 9 slashing
4. Returns structured result to Narrative Generator
5. Final output: "Your blade arcs true, biting deep into goblin flesh. (Hit! 9 damage)"

**Combat Flow Integration**:

```
Player Input: "attack goblin with longsword"
  ↓
[World Context] Get combat state (initiative, positions, conditions)
  ↓
[Monster DB] Retrieve goblin stats (AC 15, HP 7)
  ↓
[Combat Rules] Roll attack (d20+5) → 17 vs AC 15 (hit)
  ↓
[Combat Rules] Roll damage (1d8+3) → 9 slashing
  ↓
[Update Game State] Goblin HP: 7 → 0 (defeated)
  ↓
[Narrative Generator] "Your longsword cleaves through the goblin's crude armor..."
  ↓
[Telemetry] Track combat event (hit, damage, kill)
```

**Implementation Location**: `backend/src/mcp/combatRules.ts`

---

### 5.8 Spell Lookup Server (`/mcp/spell-lookup`) **[P3 - M5+]**

**Purpose**: Query D&D 5e spell database for spell effects, ranges, components.

**Operations**:

- `op=search&name=fireball` → spell details
- `op=filter&level=3&school=evocation` → filtered spell list
- `op=getComponents&spell=counterspell` → V, S, M components
- `op=canCast&spellLevel=5&casterLevel=9&spellSlots=1` → casting eligibility
- `op=resolveSpell&spell=shield&context={...}` → apply spell effects

**Data Sources**:

- D&D 5e API: `/api/spells` (supports filtering)
- Cache frequently-used spells (Shield, Fireball, Cure Wounds, Counterspell)

**Example Use Case**: Player casts Shield spell. Spell Lookup Server:

1. Retrieves _Shield_ (reaction, +5 AC until next turn)
2. Checks player has spell slots (level 1 slot available)
3. Applies effect to combat state
4. Narrative Generator: "You snap arcane gestures as a shimmering barrier materializes before you. (+5 AC until your next turn)"

**Spell System Phases**:

- **M5**: Read-only spell reference (for NPC spellcasters)
- **M7**: Player spellcasting with slot tracking
- **M7+**: Spell preparation, spell scrolls, ritual casting

**Implementation Location**: `backend/src/mcp/spellLookup.ts`

---

### 5.9 Equipment & Inventory Server (`/mcp/equipment`) **[P3 - M5+]**

**Purpose**: Manage item statistics, magical properties, equipment categories.

**Operations**:

- `op=search&name=longsword` → weapon stats
- `op=getMagicItem&name=bag-of-holding` → magic item details
- `op=getCategory&category=armor` → all armor types
- `op=calculateWeight&items=[...]` → encumbrance
- `op=generateLoot&cr=5&type=treasure-hoard` → random treasure generation

**Data Sources**:

- D&D 5e API: `/api/equipment`, `/api/magic-items`, `/api/equipment-categories`
- Cosmos DB SQL API (`inventory` container, PK: `/playerId`)

**Example Use Case**: Player finds loot. Equipment Server:

1. Generates random treasure (CR 3 hoard → 2d6×10 gold, 1 magic item)
2. Rolls magic item table → Potion of Healing
3. Retrieves item properties from D&D 5e API
4. AI Narrative Generator: "Among the scattered coins, a glass vial catches the torchlight. Its crimson liquid seems to pulse with gentle warmth."
5. Item added to player inventory (Cosmos SQL)

**Implementation Location**: `backend/src/mcp/equipment.ts`

---

### 5.10 Character Rules Server (`/mcp/character-rules`) **[P3 - M7+]**

**Purpose**: Validate character creation, class features, race traits, ability scores.

**Operations**:

- `op=getClass&name=wizard` → class details
- `op=getRace&name=elf` → race traits
- `op=calculateAbilityModifier&score=16` → +3 modifier
- `op=getFeatures&class=rogue&level=5` → Sneak Attack, Uncanny Dodge, etc.
- `op=getProficiencies&class=fighter` → weapon/armor proficiencies
- `op=validateCharacter&data={...}` → check character creation rules

**Data Sources**:

- D&D 5e API: `/api/classes`, `/api/races`, `/api/features`, `/api/traits`, `/api/proficiencies`, `/api/ability-scores`
- Cosmos DB SQL API (character sheets)

**Example Use Case**: New player creates character. Character Rules Server:

1. Validates race/class combination (Elf Wizard)
2. Retrieves starting proficiencies (Arcana, History)
3. Calculates ability modifiers (INT 16 → +3)
4. Generates starting equipment (spellbook, component pouch)
5. AI Narrative Generator: "You are an elven wizard, your eyes carrying the weight of centuries of arcane study. The weave of magic responds to your touch like an old friend."

**Implementation Location**: `backend/src/mcp/characterRules.ts`

**Operations**:

- `op=calculateAttack&attackBonus=X&targetAC=Y` → hit/miss determination
- `op=rollDamage&diceExpression=2d6+3` → damage calculation
- `op=getCondition&name=stunned` → condition effects
- `op=checkSavingThrow&ability=dexterity&dc=15&modifier=2` → save results

**Data Sources**:

- D&D 5e API: `/api/conditions`, `/api/damage-types`, `/api/rules` (combat section)
- Local cache of combat rules (reduce API calls)

**Example Use Case**: AI agent decides an NPC casts _Fireball_. Combat Rules Server:

1. Retrieves spell details from Spell Server
2. Calculates area of effect
3. Rolls damage (8d6)
4. Determines DEX saves for affected players
5. Returns structured combat results

---

### 5.2 Spell Lookup Server (`/mcp/spell-lookup`)

**Purpose**: Query D&D 5e spell database for spell effects, ranges, components.

**Operations**:

- `op=search&name=fireball` → spell details
- `op=filter&level=3&school=evocation` → filtered spell list
- `op=getComponents&spell=counterspell` → V, S, M components
- `op=canCast&spellLevel=5&casterLevel=9&spellSlots=1` → casting eligibility

**Data Sources**:

- D&D 5e API: `/api/spells` (supports filtering)
- Cache frequently-used spells (Fireball, Cure Wounds, Shield, etc.)

**Example Use Case**: Player types "cast shield". Agent queries Spell Lookup Server:

1. Retrieves _Shield_ spell (reaction, +5 AC until next turn)
2. Checks player has spell slots
3. Applies effect through game state update
4. Generates narrative description via AI

---

### 5.3 Monster Database Server (`/mcp/monster-db`)

**Purpose**: Access creature statistics for NPC/enemy generation and combat.

**Operations**:

- `op=getRandom&challengeRating=5` → random CR 5 monster
- `op=search&name=goblin` → specific monster
- `op=filter&type=undead&cr=3` → filtered list
- `op=getAbilities&monster=ancient-red-dragon` → abilities, actions, legendary actions

**Data Sources**:

- D&D 5e API: `/api/monsters` (supports filtering)
- Cache common encounters (goblins, orcs, skeletons)

**Example Use Case**: AI generates dungeon encounter. Monster DB Server:

1. Queries for CR-appropriate monsters
2. Returns 2d4 goblins + 1 goblin boss
3. Agent generates narrative introduction
4. Combat Rules Server handles battle mechanics

---

### 5.4 Equipment & Inventory Server (`/mcp/equipment`)

**Purpose**: Manage item statistics, magical properties, equipment categories.

**Operations**:

- `op=search&name=longsword` → weapon stats
- `op=getMagicItem&name=bag-of-holding` → magic item details
- `op=getCategory&category=armor` → all armor types
- `op=calculateWeight&items=[...]` → encumbrance

**Data Sources**:

- D&D 5e API: `/api/equipment`, `/api/magic-items`, `/api/equipment-categories`
- Local inventory database (player-specific items in Cosmos SQL)

**Example Use Case**: Player finds loot. Equipment Server:

1. Generates random treasure (magic item table)
2. Retrieves item properties from D&D 5e API
3. AI generates discovery narrative
4. Item added to player inventory (Cosmos SQL)

---

### 5.5 Character Rules Server (`/mcp/character-rules`)

**Purpose**: Validate character creation, class features, race traits, ability scores.

**Operations**:

- `op=getClass&name=wizard` → class details
- `op=getRace&name=elf` → race traits
- `op=calculateAbilityModifier&score=16` → +3 modifier
- `op=getFeatures&class=rogue&level=5` → Sneak Attack, Uncanny Dodge, etc.
- `op=getProficiencies&class=fighter` → weapon/armor proficiencies

**Data Sources**:

- D&D 5e API: `/api/classes`, `/api/races`, `/api/features`, `/api/traits`, `/api/proficiencies`, `/api/ability-scores`

**Example Use Case**: New player creates character. Character Rules Server:

1. Validates race/class combination
2. Retrieves starting proficiencies
3. Calculates ability modifiers
4. Generates starting equipment
5. AI creates personalized character intro narrative

---

### 5.6 Narrative Context Server (`/mcp/narrative-context`)

**Purpose**: Augment AI generation with D&D lore, tone guidelines, DM persona.

**Operations**:

- `op=getDMPersona` → DM style guide (existing concept doc)
- `op=getLocationTone&biome=underdark` → atmospheric guidelines
- `op=getEncounterNarrative&monster=beholder` → creature flavor text
- `op=getSpellNarrative&spell=meteor-swarm` → dramatic spell descriptions

**Data Sources**:

- Existing `docs/concept/dungeon-master-style-guide.md`
- D&D 5e API: `/api/monsters` (descriptions), `/api/spells` (flavor text)
- Custom narrative templates (prompt library expansion)

**Example Use Case**: AI generates spell cast description. Narrative Context Server:

1. Retrieves spell mechanics from Spell Lookup Server
2. Gets DM persona guidelines (dramatic, immersive)
3. Generates: "You weave arcane gestures as reality itself bends to your will. Four blazing meteors streak from the heavens, their fiery trails illuminating the battlefield..."

---

## 6. Agent Framework Integration Patterns

### 6.1 Single Agent Pattern: Exploration & Discovery

**Scenario**: Player looks around a new location.

**Agent**: `ExplorationAgent`

**Tools** (MCP Servers):

- World Context Server (location graph, exits, atmosphere)
- Description Layering Server (base + contextual layers)
- Lore & Reference Server (biome themes, flavor text)
- Narrative Generator Server (DM persona narration)

**Flow**:

```
Player Input: "look"
  ↓
ExplorationAgent decides: Need location context + description layers
  ↓
[Tool Call 1] World Context Server → Location ID, exits (N, E, W), weather (rainy)
[Tool Call 2] Description Layering Server → Base + structural + ambient layers
  ↓
ExplorationAgent decides: Enrich with atmospheric narrative
  ↓
[Tool Call 3] Lore & Reference Server → Biome theme (ruined courtyard)
[Tool Call 4] Narrative Generator Server → Apply DM persona template
  ↓
LLM generates final response:
"You stand in what was once a grand courtyard, now reclaimed by moss and
melancholy. Rain drums a requiem on cracked flagstones. Three paths beckon:
north to the tower (ominous creaking), east to the overgrown gardens (suspiciously
quiet), west to the gatehouse (door hanging askew like a broken promise)."
  ↓
[Telemetry] Track Location.Look event with enrichment metadata
```

**Implementation Location**: `backend/src/handlers/explorationAgent.ts`

---

### 6.2 Single Agent Pattern: Combat Resolver

**Scenario**: Player attacks goblin.

**Agent**: `CombatAgent`

**Tools** (MCP Servers):

- World Context Server (combat state, participant positions)
- Monster DB Server (get goblin stats)
- Combat Rules Server (attack/damage calculation)
- Narrative Generator Server (dramatic combat narration)

**Flow**:

```
Player Input: "attack goblin with longsword"
  ↓
CombatAgent decides: Need goblin AC, player attack bonus
  ↓
[Tool Call 1] World Context Server → Combat state (initiative, conditions)
[Tool Call 2] Monster DB Server → Goblin stats (AC 15, HP 7)
  ↓
CombatAgent decides: Roll attack (d20 + player bonus)
  ↓
[Tool Call 3] Combat Rules Server → Attack roll: 18 (hit!)
  ↓
CombatAgent decides: Roll damage
  ↓
[Tool Call 4] Combat Rules Server → Damage: 9 slashing
  ↓
CombatAgent decides: Generate narrative
  ↓
[Tool Call 5] Narrative Generator Server → Apply combat-intro template
  ↓
LLM generates final response:
"Your blade finds its mark! The goblin's eyes widen—in surprise or perhaps
recognition that this was, in retrospect, a terrible life choice. (9 damage.
The goblin collapses.)"
  ↓
[Update Game State] Goblin HP: 7 → 0 (defeated)
[Telemetry] Track Combat.AttackResolved event
```

**Implementation Location**: `backend/src/handlers/combatAgent.ts`

---

### 6.3 Workflow Pattern: World Discovery Journey

**Scenario**: Player enters a new region for the first time.

**Workflow**: `WorldDiscoveryWorkflow`

**Agents**:

- `LocationScoutAgent` - Analyzes spatial layout, identifies landmarks
- `AtmosphereAgent` - Generates weather, ambient conditions, sensory details
- `LoreWeaverAgent` - Adds historical context, rumors, mysteries
- `NarratorAgent` - Weaves everything into cohesive DM narration

**Tools** (MCP Servers):

- World Context Server (spatial graph, recent events)
- Description Layering Server (base + layers)
- Lore & Reference Server (regional themes)
- Narrative Generator Server (DM persona)
- Navigation Assistant Server (landmark identification)

**Flow**:

```
Workflow Start: Player moves into new region
  ↓
[Executor 1: LocationScoutAgent]
  [Tool] World Context Server → Spatial layout (3-hop neighborhood)
  [Tool] Navigation Assistant → Identify landmarks (tower, river, ruins)
  [LLM] Analyze: "This is a transition zone between forest and ruins"
  ↓
[Executor 2: AtmosphereAgent]
  [Tool] World Context Server → Current conditions (dusk, foggy)
  [Tool] Description Layering Server → Apply structural layers (fog, twilight)
  [LLM] Generate: "Mist rises from the ground as daylight bleeds away"
  ↓
[Executor 3: LoreWeaverAgent]
  [Tool] Lore & Reference Server → Regional history (ancient battlefield)
  [Tool] Narrative Generator → Generate rumor/mystery hook
  [LLM] Weave: "Locals say the fog here remembers things best left forgotten"
  ↓
[Executor 4: NarratorAgent]
  [Tool] Narrative Generator → Apply DM persona template
  Combine all outputs from previous executors
  [LLM] Final narration:
  "You emerge from the forest into a landscape that can't quite decide
   whether it's picturesque or unsettling. Mist pools in ancient craters—
   scars from a battle the moss hasn't quite forgiven. A crumbling tower
   broods to the north, while a river mutters its way south through the ruins.
   The locals say the fog here has a long memory. You get the distinct
   impression it's sizing you up."
  ↓
[Persist] Save atmospheric layer to Cosmos SQL with provenance
[Telemetry] Track WorldDiscovery.RegionEntered event
Workflow End: Return rich narrative to player
```

**Implementation Location**: `backend/src/workflows/worldDiscoveryWorkflow.ts`

---

### 6.4 Workflow Pattern: Dungeon Encounter

**Scenario**: Player enters dungeon room.

**Workflow**: `DungeonEncounterWorkflow`

**Agents**:

- `RoomDesignerAgent` - Describes environment, features, traps
- `EncounterAgent` - Generates monsters/NPCs, determines behavior
- `TreasureAgent` - Rolls loot if appropriate
- `TacticalAgent` - Analyzes combat positioning if hostiles present
- `NarratorAgent` - Weaves descriptions together

**Tools** (MCP Servers):

- World Context Server (dungeon instance state)
- Monster DB Server (encounter generation)
- Combat Rules Server (initiative, positioning)
- Equipment Server (loot generation)
- Narrative Generator Server (atmospheric descriptions)
- Description Layering Server (dungeon themes)

**Flow**:

```
Workflow Start: Player moves north into dungeon room
  ↓
[Executor 1: RoomDesignerAgent]
  [Tool] World Context Server → Room data (exits, features)
  [Tool] Description Layering Server → Dungeon theme (ancient crypt)
  [LLM] Generate: "Vaulted chamber, stone sarcophagi lining walls, collapsed ceiling"
  ↓
[Executor 2: EncounterAgent]
  [Tool] Monster DB Server → CR-appropriate monsters (3 skeletons, CR 1 total)
  [Tool] World Context Server → Recent activity (undisturbed for decades)
  [LLM] Decide: Skeletons dormant until player crosses threshold (surprise avoided)
  ↓
[Conditional Edge: Has Monsters?]
  Yes → Continue to Executor 3
  ↓
[Executor 3: TacticalAgent]
  [Tool] Combat Rules Server → Calculate initiative order
  [Tool] Monster DB Server → Skeleton tactics (mindless aggression)
  [LLM] Analyze: "Skeletons will rush player, no strategy"
  ↓
[Executor 4: TreasureAgent]
  [Tool] Equipment Server → Generate loot (CR 1 treasure)
  Result: 30 gold pieces in ancient sarcophagus
  [LLM] Place: "Coins spill from skeletal fingers clutching a rotted purse"
  ↓
[Executor 5: NarratorAgent]
  [Tool] Narrative Generator → Apply DM persona
  Combine all outputs:
  "You step into a vaulted chamber that smells of dust and poor real estate
   decisions. Stone sarcophagi line the walls like disapproving relatives at
   a family reunion. Then the dead relatives start moving. Three skeletons
   lever themselves upright with concerning enthusiasm, bones clattering like
   apocalyptic wind chimes. Roll initiative."
  ↓
[Conditional Edge: Combat Initiated?]
  Yes → Transition to CombatAgent for turn-by-turn resolution
  No → End workflow
  ↓
[Telemetry] Track DungeonEncounter.RoomEntered, Encounter.Generated events
Workflow End
```

**Implementation Location**: `backend/src/workflows/dungeonEncounterWorkflow.ts`

---

### 6.5 Multi-Agent Orchestration: Epic Boss Battle

**Scenario**: Party fights Ancient Red Dragon.

**Orchestration Pattern**: Magentic (dynamic multi-agent collaboration)

**Agents**:

- `CombatCoordinatorAgent` - Manages turn order, initiative, state
- `SpellcasterAgent` - Handles magical effects (Dragon Breath, Legendary Actions)
- `ConditionTrackerAgent` - Tracks frightened, prone, grappled conditions
- `TacticsAgent` - Determines dragon AI behavior, lair actions
- `EnvironmentAgent` - Manages terrain, hazards, dynamic elements
- `NarratorAgent` - Generates cinematic descriptions

**Tools**:

- World Context Server (battlefield state)
- Monster DB Server (dragon stats, legendary actions)
- Combat Rules Server (attack rolls, saves, damage)
- Spell Lookup Server (dragon abilities)
- Narrative Generator Server (epic narration)

**Flow**:

```
Dragon Turn:
  ↓
[CombatCoordinatorAgent] Initiates turn, polls other agents
  ↓
[TacticsAgent]
  [Tool] World Context → Battlefield state (dragon at 50% HP, players clustered)
  [Tool] Monster DB → Dragon tactics (intelligent, vengeful)
  [LLM] Decision: "Dragon is wounded, will use Frightful Presence + Fire Breath combo"
  ↓
[SpellcasterAgent]
  [Tool] Spell Lookup → Dragon abilities (Frightful Presence, Fire Breath)
  [Tool] Combat Rules → Area of effect calculation (60-foot cone)
  [LLM] Determine targets: Players A, B, C are in cone area
  ↓
[ConditionTrackerAgent]
  [Tool] Combat Rules → WIS saves vs DC 19 (Frightful Presence)
  Results: Player A fails (frightened), B & C succeed
  Apply condition: Player A movement restricted, disadvantage on attacks
  ↓
[SpellcasterAgent]
  [Tool] Combat Rules → DEX saves vs DC 21 (Fire Breath, 18d6 damage)
  Roll damage: 63 fire damage
  Results: Player A fails (63 dmg), B saves (31 dmg), C saves (31 dmg)
  ↓
[EnvironmentAgent]
  [LLM] Secondary effects: "Fire sets tapestries ablaze, smoke fills chamber"
  [Tool] World Context → Update battlefield (visibility reduced, fire hazard)
  ↓
[NarratorAgent]
  [Tool] Narrative Generator → Epic combat template
  Weave results into cinematic narrative:
  "The dragon rears back, ancient fury blazing in its eyes like the birth of
   stars gone wrong. Its roar shakes the very foundations of the mountain—a
   sound that carries the weight of empires reduced to footnotes. Then comes
   the fire. Not flame—*fire*. Reality itself seems to flinch as superheated
   death pours forth.

   Player A: Your courage wavers as primal terror grips you. The flames engulf
   you completely. (63 fire damage, FRIGHTENED)

   Player B: You dive aside! Flames scorch your cloak but you roll clear. (31 damage)

   Player C: You raise your shield just in time! The inferno washes over you. (31 damage)

   Tapestries ignite. Smoke billows. The dragon's laugh rumbles like distant thunder.
   Your turn."
  ↓
[CombatCoordinatorAgent]
  Updates game state (HP, conditions, battlefield effects)
  Returns control to players
  ↓
[Telemetry] Track Combat.LegendaryAction, Combat.AreaEffect, Combat.ConditionApplied events
```

**Implementation Location**: `backend/src/workflows/bossBattleOrchestration.ts`

---

### 6.6 Single Agent Pattern: Social Interaction & Dialogue

**Scenario**: Player talks to NPC innkeeper.

**Agent**: `DialogueAgent`

**Tools** (MCP Servers):

- World Context Server (NPC state, disposition, recent events)
- Lore & Reference Server (NPC background, regional rumors)
- Narrative Generator Server (NPC personality, dialogue style)
- Navigation Assistant Server (location recommendations)

**Flow**:

```
Player Input: "ask innkeeper about the tower"
  ↓
DialogueAgent decides: Need NPC context + relevant lore
  ↓
[Tool Call 1] World Context Server → NPC state (friendly, knows local rumors)
[Tool Call 2] Lore & Reference Server → Tower lore (abandoned wizard's tower, haunted)
  ↓
DialogueAgent decides: Generate NPC response in character
  ↓
[Tool Call 3] Narrative Generator → NPC personality template (gruff but helpful)
  ↓
LLM generates dialogue:
"The innkeeper polishes a glass that's seen cleaner days and squints at you.
'The old tower? Aye, that's Malachar's folly. Wizard thought he could bargain
with things best left un-bargained-with. Tower's been quiet for twenty years—
too quiet, if you ask me. Strange lights sometimes, and the crows won't land
on it.' He leans in conspiratorially. 'But if you're the type to ignore sensible
advice, the path north from the square will take you right to its doorstep.
Bring rope. And possibly a will.'"
  ↓
[Telemetry] Track Social.NPCInteraction, Lore.Revealed events
```

**Implementation Location**: `backend/src/handlers/dialogueAgent.ts`

---

## 7. Technical Implementation Details

---

## 7. Technical Implementation Details

### 7.1 MCP Server Template (Azure Function)

```typescript
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { Container } from 'inversify'

export interface DnDApiClient {
    fetchMonster(name: string): Promise<MonsterData>
    fetchSpell(name: string): Promise<SpellData>
    // ... other methods
}

export async function dndApiHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const container = context.extraInputs.get('container') as Container
    const dndClient = container.get<DnDApiClient>('DnDApiClient')

    const op = req.query.get('op')

    switch (op) {
        case 'getMonster': {
            const name = req.query.get('name')
            if (!name) return jsonError(400, 'Missing name parameter')
            const monster = await dndClient.fetchMonster(name)
            return jsonSuccess(200, { monster })
        }
        // ... other operations
        default:
            return jsonError(400, 'Unsupported operation')
    }
}

app.http('McpDndApi', {
    route: 'mcp/dnd-api',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: dndApiHandler
})
```

---

### 8.2 Agent Framework Integration (Python Example)

```python
from agent_framework import Agent, ModelClient
from agent_framework.mcp import MCPClient

# Initialize MCP clients pointing to your Azure Functions
combat_mcp = MCPClient(base_url="https://your-app.azurewebsites.net/api/mcp/combat-rules")
monster_mcp = MCPClient(base_url="https://your-app.azurewebsites.net/api/mcp/monster-db")
spell_mcp = MCPClient(base_url="https://your-app.azurewebsites.net/api/mcp/spell-lookup")

# Create combat agent with D&D rule tools
combat_agent = Agent(
    name="CombatAgent",
    model=ModelClient(model="gpt-4", endpoint="your-azure-openai-endpoint"),
    tools=[
        combat_mcp.get_tool("calculateAttack"),
        combat_mcp.get_tool("rollDamage"),
        monster_mcp.get_tool("search"),
        spell_mcp.get_tool("search")
    ],
    instructions="""You are a D&D 5e Dungeon Master assistant.
    Use the provided tools to resolve combat according to official D&D 5e rules.
    Always narrate results dramatically while maintaining mechanical accuracy."""
)

# Execute agent
response = await combat_agent.run("The player attacks the goblin with a longsword")
print(response.content)
```

---

### 8.3 Workflow Orchestration (Python Example)

```python
from agent_framework import Workflow, Agent
from agent_framework.patterns import sequential_orchestration

# Define agents
scout_agent = Agent(name="ScoutAgent", model=model_client, tools=[world_query_mcp])
encounter_agent = Agent(name="EncounterAgent", model=model_client, tools=[monster_mcp])
combat_agent = Agent(name="CombatAgent", model=model_client, tools=[combat_mcp, spell_mcp])
narrator_agent = Agent(name="NarratorAgent", model=model_client, tools=[narrative_mcp])

# Build workflow
dungeon_workflow = Workflow(name="DungeonEncounter")
dungeon_workflow.add_executor("scout", scout_agent)
dungeon_workflow.add_executor("encounter", encounter_agent)
dungeon_workflow.add_executor("combat", combat_agent)
dungeon_workflow.add_executor("narrator", narrator_agent)

# Define execution flow
dungeon_workflow.add_edge("scout", "encounter")
dungeon_workflow.add_edge("encounter", "combat", condition=lambda state: state.has_monsters)
dungeon_workflow.add_edge("combat", "narrator")
dungeon_workflow.add_edge("encounter", "narrator", condition=lambda state: not state.has_monsters)

# Execute workflow
result = await dungeon_workflow.run(input={"location_id": player_location, "player_id": player_id})
```

---

## 9. Data Flow Architecture

```
Player Input (HTTP)
  ↓
Azure Functions (Player Action Handler)
  ↓
Agent Framework Agent
  ↓
[Tool Calls to MCP Servers]
  ├─ Combat Rules MCP (D&D mechanics)
  ├─ Monster DB MCP (D&D 5e API)
  ├─ Spell Lookup MCP (D&D 5e API)
  ├─ World Query MCP (Cosmos Gremlin)
  └─ Narrative Context MCP (prompt templates)
  ↓
Agent Framework LLM (Azure OpenAI)
  ↓
Generated Response + Game State Updates
  ↓
Persist to Cosmos DB (SQL + Gremlin)
  ↓
Enqueue World Event (Service Bus)
  ↓
Return Response to Player
```

---

## 8. Cost & Performance Considerations

### 8.1 D&D 5e API Caching Strategy

**Problem**: D&D 5e API is external and rate-limited.

**Solution**: Local caching in Azure Functions with intelligent pre-population.

```typescript
// Cache frequently-used data
const MONSTER_CACHE: Map<string, MonsterData> = new Map()
const SPELL_CACHE: Map<string, SpellData> = new Map()

async function getCachedMonster(name: string): Promise<MonsterData> {
    if (MONSTER_CACHE.has(name)) {
        return MONSTER_CACHE.get(name)!
    }
    const data = await fetch(`https://www.dnd5eapi.co/api/monsters/${name}`)
    MONSTER_CACHE.set(name, data)
    return data
}
```

**Optimization Strategy**: Pre-populate cache with high-frequency monsters/spells on cold start (goblins, orcs, fireball, cure wounds).

**WAF Alignment**: Cost Optimization (reduce external API calls), Performance Efficiency (faster response times), Reliability (resilience to API downtime).

---

### 8.2 Agent Framework Token Usage

**Challenge**: LLM calls are expensive; multi-agent workflows multiply costs.

**Mitigation Strategies**:

1. **Model Selection by Task Complexity**:
    - GPT-4o-mini: Basic lookups, simple narratives (<$0.001/call)
    - GPT-4o: Complex reasoning, DM persona generation (<$0.01/call)
2. **Tool Call Batching**: Combine multiple MCP calls into single agent execution
3. **Response Caching**: Cache generated narratives for common scenarios (location descriptions, combat outcomes)
4. **Prompt Engineering**: Minimize system prompt tokens while maintaining quality

**Estimated Costs** (Azure OpenAI, GPT-4o pricing):

- Single combat turn: ~500-1000 tokens (~$0.005-0.01)
- Dungeon encounter workflow: ~2000-5000 tokens (~$0.02-0.05)
- Epic boss battle: ~10,000-20,000 tokens (~$0.10-0.20)

**Budget Target**: <$0.05 per player session average (assuming 10-20 agent calls per session).

**WAF Alignment**: Cost Optimization pillar - balance AI quality with operational costs.

---

### 8.3 Telemetry & Observability

**Critical Metrics**:

- Agent decision latency (p50, p95, p99)
- MCP server response times
- Token usage per agent/workflow
- D&D 5e API hit rate vs cache rate
- Combat resolution accuracy (rules compliance)

**Implementation**: Extend existing Application Insights telemetry.

```typescript
// Add D&D-specific telemetry events
trackEvent({
    name: 'Combat.AttackResolved',
    properties: {
        attackRoll: 18,
        targetAC: 15,
        damage: 9,
        attackerType: 'player',
        targetType: 'goblin'
    }
})

trackEvent({
    name: 'Agent.ToolCall',
    properties: {
        agentName: 'CombatAgent',
        toolName: 'combat-rules.calculateAttack',
        latencyMs: 45
    }
})
```

---

## 9. Security & Safety Considerations

### 11.1 Input Validation

**Risk**: Players inject malicious queries to D&D 5e API or manipulate combat outcomes.

**Mitigation**:

- Validate all player inputs before passing to agents
- Sanitize MCP server responses
- Rate limit MCP server calls per player

---

### 11.2 Agent Guardrails

**Risk**: AI agents make mechanically incorrect D&D rulings or generate inappropriate content.

**Mitigation**:

- **Middleware Filters**: Validate agent outputs against D&D 5e rules
- **Content Moderation**: Use Azure Content Safety for generated narratives
- **Deterministic Checks**: Combat math verified programmatically, not by LLM

```python
from agent_framework import Agent
from agent_framework.middleware import ValidationMiddleware

def validate_combat_result(response):
    # Ensure attack roll + modifier <= 20 + modifier
    # Ensure damage >= 0
    # Ensure valid damage types
    return is_valid

combat_agent = Agent(
    name="CombatAgent",
    model=model_client,
    middleware=[ValidationMiddleware(validate_fn=validate_combat_result)]
)
```

---

### 11.3 Secrets Management

**Critical**: Never expose D&D 5e API keys (if using paid tier) or Azure OpenAI keys.

**Implementation**: Use existing Key Vault pattern from your architecture.

---

## 12. Testing Strategy

### 12.1 MCP Server Tests

**Unit Tests**: Each MCP operation tested in isolation.

```typescript
describe('Combat Rules MCP', () => {
    it('calculates attack roll correctly', async () => {
        const result = await combatRulesMcp.calculateAttack({
            attackBonus: 5,
            targetAC: 15,
            roll: 12 // mocked d20
        })
        expect(result.hit).toBe(true) // 12 + 5 = 17 >= 15
    })
})
```

---

### 12.2 Agent Integration Tests

**Integration Tests**: Agents with real MCP servers, mocked LLM responses.

```python
@pytest.mark.asyncio
async def test_combat_agent_resolves_attack():
    # Mock LLM to return structured tool calls
    mock_model = MockModelClient(response="I'll calculate the attack roll")
    combat_agent = Agent(name="CombatAgent", model=mock_model, tools=[combat_mcp])

    result = await combat_agent.run("attack goblin")

    assert result.tool_calls[0].tool == "combat-rules.calculateAttack"
    assert result.tool_calls[0].args["targetAC"] == 15 # from monster DB
```

---

### 12.3 Workflow E2E Tests

**E2E Tests**: Full workflows with real agents, real MCP servers, mocked player inputs.

```python
@pytest.mark.asyncio
async def test_dungeon_encounter_workflow():
    workflow = build_dungeon_encounter_workflow()

    result = await workflow.run(input={
        "player_id": "test-player",
        "location_id": "test-dungeon-room"
    })

    assert result.state.encounter_generated
    assert result.state.treasure_rolled
    assert len(result.narrative) > 0
```

---

## 13. Migration Path from Current Implementation

### Step 1: Pilot MCP Server (Combat Rules)

**Action**: Implement basic `combat-rules` MCP server alongside existing player action handlers.

**Integration Point**: `backend/src/functions/player.ts` (existing HTTP move handler)

**No Breaking Changes**: Existing functionality remains; new MCP endpoint is additive.

---

### Step 2: Standalone Agent Experiment

**Action**: Create a standalone Python script using Agent Framework to consume your new MCP server.

**Location**: `backend/scripts/agent-experiment.py`

**Purpose**: Validate Agent Framework + MCP integration without touching production code.

---

### Step 3: Hybrid Handler (Traditional + Agent)

**Action**: Modify one existing handler (e.g., combat) to optionally use Agent Framework.

**Pattern**:

```typescript
async function handlePlayerAction(req: HttpRequest): Promise<HttpResponseInit> {
    const useAgent = req.query.get('experimental') === 'true'

    if (useAgent) {
        return await agentFrameworkHandler(req) // New path
    } else {
        return await traditionalHandler(req) // Existing path
    }
}
```

**Benefit**: A/B test agent-based logic vs traditional handlers.

---

### Step 4: Full Agent Migration

**Action**: Replace traditional handlers with Agent Framework orchestration.

**Scope**: All player actions routed through agents/workflows.

**Timeline**: Post-MVP (M7+)

---

## 14. Key Decisions & Trade-offs

| Decision                | Option A                     | Option B                       | Recommendation                                      |
| ----------------------- | ---------------------------- | ------------------------------ | --------------------------------------------------- |
| **MCP Server Location** | Azure Functions (current)    | Separate containerized service | Azure Functions (leverage existing infra)           |
| **Agent Hosting**       | Azure Functions (Python)     | Azure Container Apps           | Azure Functions (simplicity, cold start acceptable) |
| **D&D 5e API**          | Real-time API calls          | Cached in Cosmos DB            | Hybrid (cache common data, API for rare lookups)    |
| **Agent Language**      | Python (official support)    | .NET (team familiarity)        | Python (richer Agent Framework ecosystem)           |
| **Workflow Complexity** | Start simple (single agents) | Full workflows from day 1      | Start simple, evolve to workflows                   |

---

## 15. Success Metrics

### Phase 1 (Combat Rules Integration)

- ✅ 100% of combat encounters follow D&D 5e rules
- ✅ <200ms average MCP server response time
- ✅ <2s average agent resolution time
- ✅ Zero rule violations detected in testing

### Phase 2 (Spell System)

- ✅ All SRD spells available and functional
- ✅ Spell slot tracking 100% accurate
- ✅ AI-generated spell narratives rated 4+ /5 by testers

### Phase 3 (Equipment)

- ✅ 500+ items in equipment database
- ✅ Item effects apply correctly in combat
- ✅ Loot generation feels balanced and rewarding

### Phase 4 (Character Creation)

- ✅ 12 classes fully implemented
- ✅ Character progression matches D&D 5e PHB
- ✅ AI-guided creation reduces new player confusion

### Phase 5 (Advanced Workflows)

- ✅ Full dungeon runs possible end-to-end
- ✅ Multi-agent coordination seamless (no visible seams)
- ✅ Workflow checkpointing enables 1+ hour sessions

---

---

## 10. Resources & References

### Official Documentation

- [Microsoft Agent Framework Overview](https://learn.microsoft.com/en-us/agent-framework/overview/agent-framework-overview)
- [Agent Framework GitHub](https://github.com/microsoft/agent-framework)
- [D&D 5e API Documentation](https://5e-bits.github.io/docs/api)
- [Model Context Protocol (MCP) Spec](https://spec.modelcontextprotocol.io/)

### Project Documentation

- `docs/tenets.md` - Core design principles (WAF alignment)
- `docs/concept/dungeon-master-style-guide.md` - Narrative tone & DM persona
- `docs/architecture/` - Technical architecture (dual persistence, event-driven)
- `docs/architecture/intent-parser-agent-framework.md` - Intent parsing design
- `.github/copilot-instructions.md` - Development workflow & documentation hierarchy

---

## Appendix A: Example API Responses

### D&D 5e API - Monster

```json
GET https://www.dnd5eapi.co/api/monsters/goblin

{
  "index": "goblin",
  "name": "Goblin",
  "size": "Small",
  "type": "humanoid",
  "alignment": "neutral evil",
  "armor_class": 15,
  "hit_points": 7,
  "hit_dice": "2d6",
  "challenge_rating": 0.25,
  "actions": [
    {
      "name": "Scimitar",
      "attack_bonus": 4,
      "damage_dice": "1d6",
      "damage_bonus": 2
    }
  ]
}
```

### D&D 5e API - Spell

```json
GET https://www.dnd5eapi.co/api/spells/fireball

{
  "index": "fireball",
  "name": "Fireball",
  "level": 3,
  "school": { "name": "Evocation" },
  "casting_time": "1 action",
  "range": "150 feet",
  "components": ["V", "S", "M"],
  "duration": "Instantaneous",
  "damage": {
    "damage_type": { "name": "Fire" },
    "damage_at_slot_level": {
      "3": "8d6",
      "4": "9d6",
      "5": "10d6"
    }
  },
  "dc": {
    "dc_type": { "name": "DEX" },
    "dc_success": "half"
  }
}
```

---

## Appendix B: Agent Framework Code Samples

### Basic Agent with Tools

```python
from agent_framework import Agent, ModelClient
from agent_framework.tools import Tool

# Define a tool
@Tool(name="roll_dice", description="Roll dice (e.g., 2d6+3)")
def roll_dice(expression: str) -> int:
    # Parse expression and return result
    return 15  # Simplified

# Create agent
agent = Agent(
    name="DiceRoller",
    model=ModelClient(model="gpt-4"),
    tools=[roll_dice],
    instructions="You are a dice rolling assistant. Use the roll_dice tool."
)

# Run
response = await agent.run("Roll 2d6+3 for me")
```

### Workflow with Conditional Routing

```python
from agent_framework import Workflow, Agent

workflow = Workflow(name="ConditionalExample")
workflow.add_executor("step1", agent1)
workflow.add_executor("step2a", agent2a)
workflow.add_executor("step2b", agent2b)

workflow.add_edge("step1", "step2a", condition=lambda s: s.value > 10)
workflow.add_edge("step1", "step2b", condition=lambda s: s.value <= 10)

result = await workflow.run(input={"value": 15})
```

---

## 16. Summary: Balanced Integration Strategy

### Core Philosophy

The Shifting Atlas is **narrative-first, combat-ready**:

1. **Narrative & Exploration** (60% focus)
    - AI-driven DM persona storytelling
    - Immutable base descriptions + additive contextual layers
    - World discovery as primary gameplay loop
    - Atmospheric richness through multi-agent collaboration

2. **Navigation & Spatial Reasoning** (20% focus)
    - Graph-based world model (foundation)
    - Semantic exits and pathfinding
    - AI-enhanced traversal guidance

3. **Combat & D&D Mechanics** (15% focus)
    - Structured D&D 5e rules for encounters
    - Tactical depth without overwhelming narrative flow
    - Combat as punctuation, not primary verb

4. **Systems & Progression** (5% focus)
    - Economy, factions, quests (M5+ foundation)
    - Character advancement and customization
    - Long-term engagement hooks

### Why This Balance?

Your design documents emphasize:

- **Tenets**: "Prefer narrative humour & gameplay over accurate simulation"
- **DM Style Guide**: "Theatrical, wry, gently chaotic"

**Key Insight**: D&D 5e API provides **structured rules for moments of conflict**, while Agent Framework enables **freeform narrative exploration**. The integration excels when:

- Combat rules are deterministic and fair (D&D 5e mechanics)
- Narrative generation is creative and theatrical (AI agents with DM persona)
- World state remains authoritative and auditable (dual persistence model)

---

**Document Version**: 1.0  
**Last Updated**: 2025-11-08  
**Status**: ARCHITECTURE SPECIFICATION  
**Layer**: Architecture (30k ft) - Technical design for D&D 5e + Agent Framework integration  
**Related**:

- Design Modules: `docs/concept/dungeon-master-style-guide.md`
- Architecture: `docs/architecture/intent-parser-agent-framework.md`
- Tenets: `docs/tenets.md` (Narrative over simulation, Explicit over implicit, Build for observability)
