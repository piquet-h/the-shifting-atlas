# Design Document: Navigation and Location Generation System

> Related: [World Rules & Lore](world-rules-and-lore.md) · [AI Prompt Engineering](ai-prompt-engineering.md) · [Multiplayer Mechanics](multiplayer-mechanics.md) · [Extension Framework](extension-framework.md)

## Summary

The system powers a persistent, MMO-scale text adventure blending D&D mechanics with generative AI. Players can drop in/out, form guilds, influence factions, and co-create the world through play.

Locations are represented as nodes in a 3D graph, with exits as edges storing directional vectors and rich metadata. The system ensures intuitive, context-aware navigation and dynamic location generation using Azure OpenAI and Cosmos DB.

## Location Generation

1. **Trigger: Location Creation with Exit Expansion**

   - When a new location is created, the system immediately generates all connected locations for each exit vector.
   - This proactive generation enables batch creation of multiple rooms in advance.
   - If an exit leads to an existing location node, the system tailors the new room's description to match the destination's biome, mood, and spatial context.

2. **Contextual Prompt Construction**

   - A prompt is built for Azure OpenAI, including details like current location, vector hint, nearby locations, and generation rules (e.g., biome continuity, max distance, unique names).
   - Example prompt: “Generate a new forest location approximately 10 units north of Whispering Glade. Nearby is Mossy Hollow. Ensure biome continuity and avoid naming conflicts.”

3. **AI Response Parsing**

   - Extracts details such as name, description, biome, and optional tags (e.g., mood, elevation, hazards).

4. **Vector Assignment and Convergence**

   - Computes a target vector using directional heuristics and applies proximity checks.
   - If an existing location is nearby, reuse it and add a portal with narrative stitching.
   - Otherwise, generate a new location and assign its vector.

5. **Graph Persistence**

   - Adds the new location as a vertex and the connection as an `exit_to` edge.
   - All metadata is stored in Cosmos DB.

6. **Tailoring for Existing Destinations**
   - When an exit leads to an existing location, the origin’s exit description is tailored to reflect the destination’s biome, mood, elevation, and other metadata.
   - This supports spatial continuity, narrative stitching, environmental foreshadowing, and multiplayer consistency.
   - Tailoring may be skipped for symbolic exits, mysterious destinations, or rapid traversal scenarios.

## Navigation and Traversal

1. **Traversal Logic**

   - Players choose a direction via semantic exit or freeform input.
   - The system checks for existing edges:
     - If `exit_to`: Moves to the connected location.
     - If none: Generates a new location and connection immediately.
   - New locations and edges are persisted in Cosmos DB.

2. **Procedural Navigation in 3D Space**

   - Locations are stored as 3D vectors relative to a global origin.
   - Euclidean distance measures proximity between locations.
   - Proximity thresholds define connection criteria.
   - Vector normalization ensures consistent direction representation.

3. **Directional Heuristics**

   - Directional weighting influences location generation and connections.
   - Vector adjustments and biome clustering enhance spatial and thematic coherence.

4. **Terrain Types and Modifiers**

   - Elevation and slope affect stamina cost, speed, and DCs for movement.
   - Hazards like rivers, lava, and blizzards require skill checks or items.
   - Faction zones restrict access and influence encounter tables.

5. **Traversal Skill Checks**

   - Movement challenges (e.g., climbing, swimming) are gated by D&D skill checks.
   - Terrain, gear, spells, and party assists modify DCs.

6. **Fast Travel and Teleportation**

   - Anchors like waystones and shrines enable fast travel.
   - Require discovery and resources; preserve spatial consistency.

7. **Semantic Exits**

   - Natural language descriptions are parsed into vectors and conditions.
   - Developers can seed exits with explicit vectors and tags.

8. **Multiplayer Convergence and Retroactive Portals**

   - Spatial checks reuse nearby locations to avoid duplicates.
   - If a portal doesn't exist, retroactively add one with narrative justification.
   - Temporal tags track who/when changed what.

9. **Temporal Tagging and World Evolution**

   - Each edge and location is annotated with timestamps and player IDs.
   - Evolution events (e.g., clearing vines, building bridges) mutate the graph.
   - Azure OpenAI generates narrative updates reflecting changes.

10. **Narrative Integration**

    - Prompts describe how player actions alter traversal.
    - Hidden paths become visible after evolution.

11. **Anti-Griefing Mechanics**
    - The system tracks player actions and tags disruptive behavior patterns.
    - Griefers experience reduced narrative rewards, diminished skill check success rates, and lower encounter quality over time.
    - These mechanics are designed to preserve enjoyment for cooperative players while discouraging repeated disruptive behavior.

## Extension Points and Developer API

- Developers can inject regions, traversal puzzles, and item/quest content.
- Regions are seeded with coordinates, biomes, and vector fields.
- Traversal puzzles include custom conditions, DCs, and narrative hooks.
- Safety checks validate injected content against spatial constraints.
- Contracts support generation, approval, rollback, and versioning.

## Future Expansion: Pre-Generated Quest Paths

Once basic location generation and traversal are complete, the system can support pre-generated quest paths. These are sequences of interconnected locations generated in advance to support narrative arcs, puzzles, or multi-step objectives.

- **Batch Generation**: Multiple rooms and connections are created in a single pass.
- **Narrative Continuity**: Prompts are tailored to maintain thematic and biome consistency across the path.
- **Quest Metadata**: Locations and edges are tagged with quest identifiers, objectives, and progression flags.
- **Multiplayer Support**: Paths can be shared or branched based on player decisions.
- **Branching and Re-Stitching**: Alternate routes and re-entry points are supported.
- **Agent Pathing**: NPCs use the same vector topology for goals, patrols, and pursuit.

## System Interaction Overview

### See Also

- **World Rules & Lore** – Biome transitions and environmental logic that inform traversal difficulty (`world-rules-and-lore.md`).
- **AI Prompt Engineering** – How generation prompts are structured for new locations (`ai-prompt-engineering.md`).
- **Multiplayer Mechanics** – Synchronisation of player movement and shared spatial events (`multiplayer-mechanics.md`).
- **Extension Framework** – Injecting custom regions, traversal puzzles, and environmental hooks (`extension-framework.md`).
- **Economy & Trade Systems** – Future tie-ins for trade routes and resource node placement (`economy-and-trade-systems.md`).
