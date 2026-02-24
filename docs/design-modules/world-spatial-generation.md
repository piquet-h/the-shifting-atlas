# World Spatial Generation

**Focus**: AI-driven world expansion that creates navigable topology from narrative descriptions, enabling organic frontier growth without rigid spatial rules.

**Status**: Planned (M4 Layering & Enrichment)

---

## Objectives

- **Hybrid expansion**: Combine player-triggered exploration with scheduled world building for organic discovery
- **Description-driven topology**: Extract exits from AI-generated prose rather than imposing predetermined spatial templates
- **Narrative consistency**: Ensure every location's description explains its traversal affordances (per Tenet #7)
- **Cost efficiency**: Batch AI description generation to minimize API calls and latency
- **Terrain-aware guidance**: Provide contextual hints to AI without rigid constraints

---

## Key Contracts

### World Expansion Trigger Points

1. **Player boundary collision**: When a player attempts to move beyond mapped terrain (e.g., "move north" from village gate with no north exit)
2. **Scheduled generation**: Background processes periodically expand frontier locations tagged `boundary`
3. **Quest prerequisites**: Quest system can enqueue generation events for specific narrative destinations

### Event Types

- `World.Location.BatchGenerate`: Eager creation of root location + immediate neighbors with batched AI descriptions
- `World.Exit.Create`: Individual exit creation (handled by ExitCreateHandler per Issue #258)
- `World.Exit.InferFromDescription`: AI-driven exit extraction from existing location prose

### Exit Inference Contract

```typescript
interface ExitInferenceRequest {
    description: string
    terrain: TerrainType
    arrivalDirection: Direction
    narrativeContext?: {
        weather?: string
        time?: string
        recentEvents?: string
    }
}

interface InferredExit {
    direction: Direction
    confidence: number
    reason: string
    targetHint?: string
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

- AI decides if a river is crossable based on narrative ("swift current churns" → no east exit)
- Seasonal variations affect topology (frozen lake → walkable; thawed → requires boat)
- Dynamic obstacles modify exits without rewriting descriptions (fire blocks passage → temporary exit removal via world state overlay)

**❌ Prohibited**:

- Hard-coded rules like "all plains have 4 exits" (violates narrative primacy)
- Ignoring description contradictions (if text says "sheer cliffs north", no north exit)
- Generating exits without contextual justification

### Performance & Cost Constraints

- **Batch size**: Maximum 20 locations per AI batch call (split larger expansions into staggered events)
- **Expansion depth**: Default `depth: 1` (root + immediate neighbors only); `depth: 2` exponentially increases generation load
- **Rate limiting**: Stagger follow-up batches by 5+ seconds to avoid API throttling
- **Cost target**: <$0.01 per location cluster (1 root + 4–8 neighbors via batch discount)

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
    arrivalDirection: "south",
    terrain: "open-plain",
    expansionDepth: 1,
    batchSize: 8
  }
}
```

Handler executes:

1. Determine neighbor count based on terrain guidance
2. Create stub locations for each neighbor direction
3. Prepare batch AI request (single API call)
4. Generate contextual descriptions via AI
5. Update locations with generated prose
6. Enqueue exit creation events for all connections
7. Parse neighbor descriptions for onward exits

### Step 3: Exit Inference Post-Processing

For each generated description, AI infers exits:

```
Description: "Windswept moorland under vast sky. South, Mosswell's gate visible.
              East, a creek cuts through heath. West, dark forest edge.
              North, moor rises toward hills."

Inferred: south (0.95), east (0.90), west (0.90), north (0.85)
```

System creates `World.Exit.Create` events for each (except south, the arrival path).

---

## Terrain Guidance System

Terrain types provide **contextual hints** to AI, not rigid rules:

### Open Plains

**Guidance**: "Open plains typically allow travel in multiple directions unless narrative obstacles are present."

**Typical exits**: 4 cardinals  
**AI overrides**: Blizzard (reduces visibility), ravine (blocks specific direction)

### Dense Forest

**Guidance**: "Dense forests may limit visible exits to clearings or paths, but clever players might detect game trails."

**Typical exits**: 2 (arrival + opposite)  
**AI overrides**: Game trail (adds diagonal), ancient road (adds perpendicular)

### Hilltop

**Guidance**: "Hilltops offer panoramic views suggesting multiple descent routes unless cliffs block directions."

**Typical exits**: `down` + 2–4 cardinals  
**AI overrides**: Mountain peak (only `down`), gentle slope (all cardinals)

### Riverbank

**Guidance**: "Riverbanks permit travel parallel to water flow, perpendicular if crossings exist."

**Typical exits**: 2 parallel + arrival  
**AI overrides**: Swift current (no perpendicular), bridge (adds perpendicular)

### Narrow Corridor

**Guidance**: "Corridors permit forward/back movement, but consider alcoves or climbing opportunities."

**Typical exits**: 2 (arrival + opposite)  
**AI overrides**: Hidden alcove (adds perpendicular), shaft (adds vertical)

---

## Validation & Safety Nets

Even with AI flexibility, deterministic checks alert curators to potential issues:

### Post-Inference Validation

```typescript
function validateInferredExits(exits: InferredExit[], location: Location) {
    const warnings = []

    if (!exits.some((e) => e.direction === location.arrivalDirection)) {
        warnings.push('No exit back to origin—player could be trapped')
    }

    if (exits.includes('north') && exits.includes('south') && location.terrain === 'narrow-corridor') {
        warnings.push('Corridor has opposing exits—verify narrative supports this')
    }

    const expectedRange = getExpectedExitRange(location.terrain)
    if (exits.length < expectedRange.min || exits.length > expectedRange.max) {
        warnings.push(`Exit count ${exits.length} outside expected range ${expectedRange}`)
    }

    return { valid: warnings.length === 0, warnings }
}
```

**Warnings are advisory**: Logged for curator review but don't block generation. AI judgment takes precedence.

---

## Edge Cases & Dynamic Topology

### Seasonal Variations

Same location, different contexts:

**Winter**: "Frozen lake stretches east; ice solid enough to walk." → east exit (0.85)  
**Summer**: "Lake ripples east; no crossing without a boat." → NO east exit (0.90)

**Implementation**: Re-run inference when seasonal state changes; update exits without rewriting descriptions.

### Contradictory Descriptions

**Input**: "The moor continues north toward hills. A ravine blocks passage north."

**AI response**: No north exit (conservative interpretation prevents frustration), recommends alternative routes or traversable ravine descent.

System logs contradiction for curator review.

### Temporary Obstacles

**Fire blocks passage**: World state overlay marks exit as `blocked`; exit becomes traversable when fire subsides.

**Quest gate**: "Iron gate barred until key obtained." Exit exists but validation checks player inventory before allowing movement.

---

## Narrative-Time Reconnection

When expanding the world, the system may encounter a newly generated neighbor whose description implies it could connect back to an already-mapped location by an alternative path (e.g., a path round a forest edge, a river joining a lake shore). This avoids the world growing as disconnected finger-branches with no cross-connections.

### Invariants

1. **Graph proximity, not coordinates**: Reconnection candidates are identified by traversing the Gremlin exit graph outward from the new location up to a configurable hop limit, not by spatial grid distance. There are no (x, y) coordinates.
2. **Travel-time gate**: An edge-level `travelDurationMs` property records the narrative cost of each traversal. A candidate reconnection is only offered if the sum of travel durations along the candidate graph path does not exceed the sum along the original path by more than a configurable tolerance (default: ≤ 2× original). This prevents nonsensical shortcuts.
3. **Description consistency gate**: Reconnection is only accepted when the AI confirms both endpoint descriptions are mutually consistent (no contradictions like "sheer cliff" on one side, "gentle slope" on the other). Contradictions are logged for curator review and the reconnection is not created.
4. **No coordinate arithmetic**: The graph is the geometry. Hop count and accumulated `travelDurationMs` are the only spatial measurements.
5. **Reciprocal required**: Any reconnection exit is created bidirectionally; a one-way reconnect is a bug.

### Player experience

- Players may discover they can return to a known location via an unexpected route.
- The world feels more continuous and less tree-like after multiple expansions.
- No reconnection is ever revealed before description consistency is verified.

---

## Dependencies

- **Navigation & Traversal**: Exit creation mechanics, direction normalization
- **Description Layering**: Base descriptions remain immutable; inference uses composite prose
- **AI Prompt Engineering**: Prompt templates for batch generation and exit inference
- **World Event Handlers**: `ExitCreateHandler` (Issue #258), new `BatchGenerateHandler`
- **Player Identity**: Player-triggered expansion requires player location tracking

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

- **Design Module**: Description Layering & Variation
- **Design Module**: AI Prompt Engineering
- **Tenet #7**: Narrative Consistency (AI-driven decision-making)
- **Concept**: Exits (`../concept/exits.md`)
- **Concept**: Direction Resolution (`../concept/direction-resolution-rules.md`)
- **Architecture**: [`world-spatial-generation-architecture.md`](../architecture/world-spatial-generation-architecture.md)
- **Issue #258**: World Event Type-Specific Payload Handlers (ExitCreateHandler)

---

_Last updated: 2026-02-24 (add narrative-time reconnection section)_
