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
  Each biome—forest, desert, tundra, swamp, volcanic, celestial, abyssal, alpine, aquatic, urban—has:
    - `ambientTone` (soundscape or mood anchors)
    - `environmentalTags` (see below)
    - `movementModifiers` (affect traversal speed / stamina DC)
    - `encounterBias` (weights for fauna / factions / events)
    - `hazardProfile` (cold, heat, toxicity, visibility)
      Transitions attempt continuity unless deliberately abrupt (e.g., magical boundary). Prompt scaffolding includes previous biome + target drift factor.

### Environmental Tags (Shared Taxonomy)

Lightweight semantic atoms attached to Rooms, Zones, or Structures to inform AI prompts and gameplay systems. Examples:

| Category   | Examples                                          | Usage                                        |
| ---------- | ------------------------------------------------- | -------------------------------------------- |
| Material   | `stone`, `sand`, `mossy`, `crystal`               | Texture adjectives for description layering. |
| Atmosphere | `humid`, `arid`, `festive`, `ominous`             | Mood tuning & encounter tables.              |
| Function   | `market`, `arena`, `shrine`, `library`            | Quest / NPC spawning heuristics.             |
| Hazard     | `slippery`, `unstable`, `toxic_fumes`             | Skill checks & gating.                       |
| Acoustic   | `echoing`, `muffled`, `roaring_crowd`             | Sensory layering.                            |
| Governance | `guild_controlled`, `faction_red`, `neutral_zone` | Faction influence & lawfulness.              |

Tags are additive; AI generation uses them as soft constraints. Removal/Addition of tags can trigger description regeneration events.

### Layered Descriptions (Integration with Navigation Schema)

To maintain authorial control while leveraging generative AI, each Room stores a stable `baseDescription` plus an ordered list of `descLayers` (see `navigation-and-traversal.md`). Layers can represent seasonal shifts, event consequences, AI embellishments, or faction occupation.

Rendering order (example):

1. `baseDescription`
2. Active `event` layers (recent world changes)
3. Active `seasonal` layer (if current in-game season matches)
4. Most recent approved `ai` embellishment
5. Synthesized exits summary (cached)

Versioning: Each layer carries `createdUtc`, `layer`, optional `expiresUtc`, plus moderation metadata. Expired or invalidated layers are ignored without deletion (historical audit preserved).

### Regeneration Triggers

- **Structural change**: Exit added/removed, gate state toggled → mark `exitsSummaryCache` stale & queue AI summary refresh.
- **Environmental delta**: Tag set updated (e.g., add `smoldering` after a fire event) → propose new `event` layer.
- **Faction control shift**: Governance tag replaced → append new faction occupation layer instead of rewriting history.
- **Time-based decay**: Long-lived `event` layers (e.g., temporary festival) auto-expire producing a cleanup layer describing aftermath.
- **Player milestone**: Completion of a quest arc may unlock hidden descriptors (adds a gated layer only visible to qualified players—future personalization).

### AI Safety & Moderation Notes

- AI-generated text is staged first; persisted only after automated + optional human checks.
- Disallowed content filters run before commit (safety gating). Fallback is `baseDescription` + safe subset of prior layers.
- Prompt hashing (`promptHash`) prevents redundant costly generations when context unchanged.

### Coliseum & Large Structures (Lore Perspective)

Large iconic locations (Coliseum, Great Library, Sky Citadel) project identity through consistent tag clusters (`arena`, `stone`, `roaring_crowd`). The lore system treats them as _cultural anchors_ influencing:

- Regional encounter flavor
- Faction diplomatic events
- Seasonal festivals (temporary layers)

When hierarchical `Structure` vertices are introduced, global lore events may target the parent, cascading regeneration to contained Rooms with tailored modifiers.

### Cross-Document Links

- Structural + exit schema: `navigation-and-traversal.md`
- Prompt assembly: `ai-prompt-engineering.md`
- Faction dynamics (influences tags): `factions-and-governance.md`

---

_Additions (2025-09-25): Completed biome section, introduced environmental tags, description layering, regeneration triggers, and structure lore alignment._
