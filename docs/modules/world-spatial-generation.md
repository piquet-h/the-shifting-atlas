# World Spatial Generation

**Focus**: AI-driven world expansion that creates navigable topology from narrative descriptions, enabling organic frontier growth without rigid spatial rules.

**Status**: Planned (M4 Layering & Enrichment)

---

## Objectives

-   **Hybrid expansion**: Combine player-triggered exploration with scheduled world building for organic discovery
-   **Description-driven topology**: Extract exits from AI-generated prose rather than imposing predetermined spatial templates
-   **Narrative consistency**: Ensure every location's description explains its traversal affordances (per Tenet #7)
-   **Cost efficiency**: Batch AI description generation to minimize API calls and latency
-   **Terrain-aware guidance**: Provide contextual hints to AI without rigid constraints

---

## Key Contracts

### World Expansion Trigger Points

1. **Player boundary collision**: When a player attempts to move beyond mapped terrain (e.g., "move north" from village gate with no north exit)
2. **Scheduled generation**: Background processes periodically expand frontier locations tagged `boundary`
3. **Quest prerequisites**: Quest system can enqueue generation events for specific narrative destinations

### Event Types

-   `World.Location.BatchGenerate`: Eager creation of root location + immediate neighbors with batched AI descriptions
-   `World.Exit.Create`: Individual exit creation (handled by ExitCreateHandler per Issue #258)
-   `World.Exit.InferFromDescription`: AI-driven exit extraction from existing location prose

### Exit Inference Contract

```typescript
interface ExitInferenceRequest {
    description: string // Location prose
    terrain: TerrainType // Guidance hint (not constraint)
    arrivalDirection: Direction // Guarantees reciprocal exit
    narrativeContext?: {
        weather?: string // "Heavy fog limits visibility"
        time?: string // "Dusk obscures distant paths"
        recentEvents?: string // "Landslide blocked northern route"
    }
}

interface InferredExit {
    direction: Direction
    confidence: number // 0.0-1.0 (AI's certainty)
    reason: string // "Explicit mention of creek to the east"
    targetHint?: string // Optional: "forested area", "creek crossing"
}
```

---

## Rules & Constraints

### Gameplay Invariants

1. **Reciprocal arrival path**: If player moves north to create new location, that location MUST have a south exit back (automatic via ExitCreateHandler)
2. **Description explains topology**: Players should never encounter an exit that contradicts the location's prose
3. **Terrain as guidance, not law**: AI interprets spatial logic contextually (open plains _typically_ allow cardinal movement, but fog/terrain can override)
4. **No phantom exits**: Exits must be justified by description text or clear spatial implications

### AI Flexibility (Per Tenet #7)

**✅ Encouraged**:

-   AI decides if a river is crossable based on narrative ("swift current churns" → no east exit)
-   Seasonal variations affect topology (frozen lake → walkable; thawed → requires boat)
-   Dynamic obstacles modify exits without rewriting descriptions (fire blocks passage → temporary exit removal via world state overlay)

**❌ Prohibited**:

-   Hard-coded rules like "all plains have 4 exits" (violates narrative primacy)
-   Ignoring description contradictions (if text says "sheer cliffs north", no north exit)
-   Generating exits without contextual justification

### Performance & Cost Constraints

-   **Batch size**: Maximum 20 locations per AI batch call (split larger expansions into staggered events)
-   **Expansion depth**: Default `depth: 1` (root + immediate neighbors only); `depth: 2` exponentially increases generation load
-   **Rate limiting**: Stagger follow-up batches by 5+ seconds to avoid API throttling
-   **Cost target**: <$0.01 per location cluster (1 root + 4–8 neighbors via batch discount)

---

## Expansion Flow (Eager Generation)

### Step 1: Player Triggers Boundary Expansion

Player at "North Gate" attempts `move north` with no existing exit:

1. System creates stub location with temporary name
2. Enqueues `World.Exit.Create` event (Gate → new location, bidirectional)
3. Enqueues `World.Location.BatchGenerate` event for AI descriptions

### Step 2: Batch Generation Handler

Handler receives `World.Location.BatchGenerate` event:

```typescript
{
  eventId: "uuid",
  type: "World.Location.BatchGenerate",
  payload: {
    rootLocationId: "new-moorland-uuid",
    arrivalDirection: "south",  // player came from south
    terrain: "open-plain",
    expansionDepth: 1,
    batchSize: 8
  }
}
```

Handler executes:

1. **Determine neighbor count** based on terrain guidance (open plains → 4 cardinal neighbors)
2. **Create stub locations** for each inferred neighbor direction
3. **Prepare batch AI request** (root + all neighbors in single API call)
4. **Generate descriptions** via AI with contextual prompts:
    - Root: "Describe open moorland north of Mosswell village, player arrived from south"
    - North neighbor: "Describe continuation of moorland, player arriving from south"
    - East neighbor: "Describe moorland transitioning toward creek, player arriving from west"
5. **Update locations** with AI-generated prose
6. **Enqueue exit creation events** for all root ↔ neighbor connections
7. **Parse neighbor descriptions** for onward exits (recursive expansion handled by depth parameter)

### Step 3: Exit Inference Post-Processing

For each generated description, AI infers exits:

```
Description: "Windswept moorland under vast sky. South, Mosswell's gate visible.
              East, a creek cuts through heath. West, dark forest edge.
              North, moor rises toward hills."

Inferred Exits:
- south (confidence: 0.95) → explicit mention of gate
- east (confidence: 0.90) → explicit creek landmark
- west (confidence: 0.90) → explicit forest edge
- north (confidence: 0.85) → explicit hills mention
```

System creates `World.Exit.Create` events for each (except south, which already exists as arrival path).

---

## Terrain Guidance System

Terrain types provide **contextual hints** to AI, not rigid rules:

### Open Plains

**Guidance**: "Open plains typically allow travel in multiple directions unless narrative obstacles (fog, cliffs, swamps) are present."

**Typical exits**: 4 cardinals (north, south, east, west)  
**AI override scenarios**: Blizzard (reduces to 1–2 visible directions), ravine (blocks specific cardinal)

### Dense Forest

**Guidance**: "Dense forests may limit visible exits to clearings or paths, but clever players might detect game trails or thinning canopy."

**Typical exits**: 2 (arrival + opposite)  
**AI override scenarios**: Ranger's keen eye (adds diagonal game trail), ancient road (adds perpendicular path)

### Hilltop

**Guidance**: "Hilltops offer panoramic views suggesting multiple descent routes unless sheer cliffs or dense undergrowth block specific directions."

**Typical exits**: `down` + 2–4 cardinals  
**AI override scenarios**: Mountain peak (only `down`), gentle slope (all cardinals available)

### Riverbank

**Guidance**: "Riverbanks permit travel parallel to water flow and sometimes perpendicular if crossings exist (fords, bridges)."

**Typical exits**: 2 parallel to river + arrival  
**AI override scenarios**: "Swift current, no crossing" (no perpendicular exit), "Old stone bridge" (adds perpendicular)

### Narrow Corridor

**Guidance**: "Corridors usually permit forward/back movement, but consider alcoves, side passages, or climbing opportunities if narratively justified."

**Typical exits**: 2 (arrival + opposite)  
**AI override scenarios**: "Hidden alcove to west" (adds perpendicular), "Shaft upward" (adds vertical)

---

## Validation & Safety Nets

Even with AI flexibility, deterministic checks alert curators to potential issues:

### Post-Inference Validation

```typescript
function validateInferredExits(exits: InferredExit[], location: Location) {
    const warnings = []

    // Ensure reciprocal arrival path exists
    if (!exits.some((e) => e.direction === location.arrivalDirection)) {
        warnings.push('No exit back to origin—player could be trapped')
    }

    // Check for contradictory opposing exits in restrictive terrain
    if (exits.includes('north') && exits.includes('south') && location.terrain === 'narrow-corridor') {
        warnings.push('Corridor has opposing exits—verify narrative supports this')
    }

    // Warn if exit count deviates significantly from terrain guidance
    const expectedRange = getExpectedExitRange(location.terrain)
    if (exits.length < expectedRange.min || exits.length > expectedRange.max) {
        warnings.push(`Exit count ${exits.length} outside expected range ${expectedRange}`)
    }

    return { valid: warnings.length === 0, warnings }
}
```

**Warnings are advisory**: System logs them for curator review but does not block generation. AI's narrative judgment takes precedence over heuristics.

---

## Edge Cases & Dynamic Topology

### Seasonal Variations

Same location, different contexts:

**Winter (frozen lake)**:

```
Description: "Frozen lake stretches east; ice solid enough to walk."
Inferred: east exit (confidence: 0.85, reason: "walkable ice")
```

**Summer (thawed lake)**:

```
Description: "Lake ripples east; no crossing without a boat."
Inferred: NO east exit (confidence: 0.90, reason: "uncrossable water")
```

**Implementation**: Re-run exit inference when seasonal world state changes; update exits without rewriting base description.

### Contradictory Descriptions (AI Self-Correction)

**Input**: "The moor continues north toward hills. A ravine blocks passage north."

**AI response**:

```json
{
    "exits": [], // No north exit due to ravine
    "recommendations": ["Consider 'northeast'/'northwest' detours around ravine", "Or add 'down' exit into traversable ravine"]
}
```

System logs contradiction for curator review; AI's conservative interpretation (no north exit) prevents player frustration.

### Temporary Obstacles

**Fire blocks passage**: World state overlay marks exit as `blocked` without modifying description or deleting exit entity. When fire subsides, exit becomes traversable again.

**Quest gate**: "Iron gate barred until key obtained." Exit exists in graph but validation logic checks player inventory before allowing movement.

---

## Dependencies

-   **Navigation & Traversal**: Exit creation mechanics, direction normalization
-   **Description Layering**: Base descriptions remain immutable; inference uses composite prose
-   **AI Prompt Engineering**: Prompt templates for batch generation and exit inference
-   **World Event Handlers**: `ExitCreateHandler` (Issue #258), new `BatchGenerateHandler`
-   **Player Identity**: Player-triggered expansion requires player location tracking

---

## Milestone Alignment

| Milestone | Deliverable                                           | Status |
| --------- | ----------------------------------------------------- | ------ |
| M3        | AI read-only integration (MCP servers, cost tracking) | 🚧     |
| M4        | Batch generation handler + exit inference service     | 📋     |
| M4        | Terrain guidance system + prompt templates            | 📋     |
| M5        | Dynamic topology (seasonal variations, obstacles)     | 📋     |

---

## Related Documentation

-   **Design Module**: Description Layering & Variation
-   **Design Module**: AI Prompt Engineering
-   **Tenet #7**: Narrative Consistency (AI-driven decision-making)
-   **Concept**: Exits (`../concept/exits.md`)
-   **Concept**: Direction Resolution (`../concept/direction-resolution-rules.md`)
-   **Architecture**: (TBD: `world-spatial-generation-architecture.md`)
-   **Issue #258**: World Event Type-Specific Payload Handlers (ExitCreateHandler)

---

_Last updated: 2025-11-25 (initial creation)_
