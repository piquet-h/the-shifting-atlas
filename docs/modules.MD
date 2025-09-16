# A massive multiplayer online role playing game text adventure

## Vision

Similar to the early Legend of Zelda series of text adventures, this game will leverage the Dungeons & Dragons game mechanics and combine it with a free form generative AI based open world adventure, allowing players to drop into the game at any point and leave at any time.

There will be an overlaying historical concept (think Lord of the Rings or Dragonlance Chronicles) along with multiple side quests and distinct adventure locations.

It is a completely immersive text world with its own currency, different fiefdoms and governing bodies, competing religions and beliefs and secret organisations with their own agenda.

Players will be free to create their own guilds and operate in this world in their own way.

Extension points will allow developers to create extensions to the world like unique quests, dungeons, or craft unique items.

## Player Experience Pillars

- Emergent storytelling through generative AI
- Persistent world shaped by player actions
- Deep roleplay via D&D mechanics and alignment
- Collaborative exploration and guild dynamics
- Rich lore and evolving political landscapes
- Anti-griefing mechanics that reduce enjoyment for disruptive players  
  Griefing—like sabotaging quests or harassing others—leads to lower success rates, fewer interactions, and less engaging stories. The system discourages disruptive play by making it unrewarding.

## Main modules

Below each module name links to its dedicated design document (if present). Use these as entry points for deeper system details.

- 🧭 **Navigation & Traversal** ([doc](modules/navigation-and-traversal.md)): Movement systems, terrain interaction, pathfinding
    - Terrain types and modifiers
    - Fast travel and teleportation systems
    - Environmental hazards and traversal challenges
    - Dynamic map generation and fog of war
    - Traversal skill checks tied to D&D mechanics (e.g. climbing cliffs, swimming rivers)
    - Semantic exits using natural language descriptions (e.g. "a narrow path through the mist")
    - Environmental interactivity (e.g. burn vines, freeze rivers)
    - Linked faction zones with terrain access restrictions
    - Map injection API for developer-created regions and traversal puzzles

- 🧠 **AI Prompt Engineering** ([doc](modules/ai-prompt-engineering.md)): Structuring inputs for consistent world generation
    - Prompt templates for NPCs, quests, and locations
    - Contextual memory and continuity enforcement
    - Style and tone modulation
    - Safety filters and content boundaries

- 🏗️ **World Rules & Lore** ([doc](modules/world-rules-and-lore.md)): Biome transitions, danger scaling, thematic cohesion
    - Biome classification and transitions
    - Danger level scaling and encounter balancing
    - Lore codex and historical timelines
    - Environmental storytelling and world myths
    - Time progression and seasonal cycles
    - Time-based events and quest availability

- 🧑‍🤝‍🧑 **Multiplayer Mechanics** ([doc](modules/multiplayer-mechanics.md)): Syncing player states, cooperative exploration
    - Real-time state synchronization
    - Party formation and shared objectives
    - PvP and PvE mechanics
    - Instance management and matchmaking

- 🏛️ **Factions & Governance** ([doc](modules/factions-and-governance.md)): Religions, secret organisations, political systems
    - Faction reputation systems
    - Dynamic power structures and influence zones
    - Religious belief trees and schisms
    - Political elections, coups, and diplomacy

- 🧩 **Extension Framework** ([doc](modules/extension-framework.md)): Developer APIs, modding, sandboxing
    - Quest and dungeon creation tools
    - Item and NPC injection interfaces
    - World event scripting
    - Versioning and sandbox isolation

- 📜 **Quest & Dialogue Trees** ([doc](modules/quest-and-dialogue-trees.md)): NPC interactions, branching narratives
    - Dialogue branching logic and emotional tone
    - Quest types (fetch, escort, puzzle, etc.)
    - Quest dependencies and chaining
    - NPC memory and relationship tracking

- 🎭 **Player Identity & Roles** ([doc](modules/player-identity-and-roles.md)): Guilds, classes, reputation, alignment
    - Class-based skill trees and progression
    - Guild creation, management, and alliances
    - Alignment tracking and moral consequences
    - Reputation systems across regions and factions

- 🧳 **Inventory & Item Systems** (TBD doc): Ownership, usage, crafting
    - Item categorization and rarity tiers
    - Crafting recipes and material dependencies
    - Equipment slots and stat modifiers
    - Item degradation and repair mechanics

- 📈 **Economy & Trade Systems** ([doc](modules/economy-and-trade-systems.md)): Currency, marketplaces, resource flow
    - Dynamic pricing and supply-demand mechanics
    - Crafting economies and resource harvesting
    - Trade routes and merchant NPCs
    - Black markets and smuggling systems

---

### Additional High-Level Documents

- Architecture Overview: `architecture/overview.md`
- MVP Azure Architecture: `architecture/mvp-azure-architecture.md`
- Cost Optimisation: `architecture/cost-optimisation.md`
- Developer Workflow: branching (`developer-workflow/branching-strategy.md`), local setup (`developer-workflow/local-dev-setup.md`), deployment (`developer-workflow/deployment-pipeline.md`), Copilot usage (`developer-workflow/using-copilot.md`)
- Gameplay Foundations: Lore (`gameplay/lore.md`), Player Agency (`gameplay/player-agency.md`), Quests (`gameplay/quests.md`)

---

### Suggested Reading Order

1. Architecture Overview → MVP Azure Architecture
2. World Rules & Lore → Navigation & Traversal → AI Prompt Engineering
3. Player Identity & Roles → Factions & Governance → Multiplayer Mechanics
4. Quest & Dialogue Trees → Economy & Trade Systems → Extension Framework

---

### See Also

- For implementation patterns see the Azure MVP doc: [MVP Azure Architecture](architecture/mvp-azure-architecture.md)
- For world narrative grounding: [World Rules & Lore](modules/world-rules-and-lore.md)
- For procedural generation prompts: [AI Prompt Engineering](modules/ai-prompt-engineering.md)
