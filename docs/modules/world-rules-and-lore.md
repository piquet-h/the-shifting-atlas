# Design Document: Worlds and Lore

> STATUS: FUTURE / NOT IMPLEMENTED (2025-09-21). No biome system, lore codex, faction logic, or AI-driven narrative adaptation exists yet. This file is aspirational; early implementation will focus on a single static starter room description.

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

## Overview

The AI Prompt Engineering system constructs, conditions, and parses prompts that drive consistent and immersive world generation using Azure OpenAI. It ensures spatial, thematic, and narrative coherence across the game world, and integrates deeply with item systems, traversal logic, quest logic, NPC behavior, and developer extensions.

It also supports dynamic world rules and lore systems, including environmental storytelling, historical timelines, seasonal cycles, and time-based quest availability. These features allow the game world to reflect meaningful change and continuity over time.

## Core Capabilities

### World Rules & Lore

- **Biome classification and transitions**  
  Each biome—forest, desert, tundra, swamp, volcanic, celestial—is defined
