# Action Intent Persistence Design

> Status: DESIGN  
> Purpose: Define how player actions are decomposed into intent + state, enabling reproducible game state with flexible narrative generation  
> Related: `event-classification-matrix.md` (Rule 2.5: Intent Persistence vs Narrative Ephemerality)

## Core Distinction

**Action** = What player is trying to do = MUST BE PERSISTED  
**Narrative** = How we describe what happened = EPHEMERAL, regenerated on demand

### Example: "Set Fire to Forest"

```
Player Input: "set fire to the forest using my tinderbox"

Decomposed Intent:
{
  verb: "ignite",
  method: "tinderbox",
  target: { kind: "location", id: "forest-clearing" },
  resources: [{ itemId: "tinderbox-abc", chargesConsumed: 1 }]
}
↓
Applied to State:
{
  state: {
    tinderboxCharges: 5 → 4,
    locationFireIntensity: 0 → moderate
  },
  sharedWorldEffect: {
    eventType: "Location.Fire.Started",
    intensity: "moderate"
  }
}
↓
Multiple Valid Narratives (any of these):
- "You strike the tinderbox. Flames lick hungrily at the dry undergrowth."
- "Sparks leap from your tinderbox. The forest erupts in orange flames."
- "Your tinderbox catches. Fire spreads across the forest floor."

Key Invariant: Same intent + same world state → same state changes (narrative may vary)
```

## Data Model: ActionIntent

### Schema Definition

```typescript
// shared/src/domainModels/actionIntent.ts

export interface ActionIntent {
    // Metadata
    actionId: string // UUID, generated at handler
    correlationId: string // Propagated from HTTP request
    timestamp: string // ISO 8601, when action was received

    // Actor
    playerId: string // UUID of acting player
    playerName?: string // For audit readability

    // Raw Input
    rawInput: string // Exact text from player: "set fire to the forest"

    // Parsed Intent (produced by intent parser / rules engine)
    parsedIntent: {
        verb: string // "ignite", "move", "examine", "cast", etc.

        // Modifiers/methods
        method?: string // How they're doing it: "tinderbox", "spell", "friction"

        // Targets
        targets?: {
            kind: 'location' | 'player' | 'npc' | 'item' | 'direction'
            id?: string // For location/player/npc/item
            name?: string // For human readability
        }[]

        // Resources consumed/offered
        resources?: {
            itemId: string
            quantity: number
            charges?: number // For rechargeable items
        }[]

        // Context about the intent
        context?: {
            locationId: string // Where action occurs
            inventorySnapshot?: Record<string, number> // Current inventory state
            targetState?: Record<string, unknown> // State of target entity
            worldContext?: string // Free-form context (time of day, weather, etc.)
        }
    }

    // Validation result
    validationResult: {
        success: boolean
        errors?: string[]
        warnings?: string[]
    }
}
```

### Why These Fields?

| Field               | Reason                                                    | Persistence | Mutable |
| ------------------- | --------------------------------------------------------- | ----------- | ------- |
| `actionId`          | Unique action identifier for audit/replay                 | ✅ Yes      | ❌ No   |
| `correlationId`     | Trace action across HTTP/queue chain                      | ✅ Yes      | ❌ No   |
| `rawInput`          | Reproduce intent parsing decisions; detect nuance loss    | ✅ Yes      | ❌ No   |
| `playerId`          | Establish actor for state changes                         | ✅ Yes      | ❌ No   |
| `verb`              | Classify action type for routing                          | ✅ Yes      | ❌ No   |
| `method`            | Enable flexible narrative ("struck tinderbox" vs "spell") | ✅ Yes      | ❌ No   |
| `targets`           | Identify what was acted upon                              | ✅ Yes      | ❌ No   |
| `resources`         | Establish what was consumed (reproducibility)             | ✅ Yes      | ❌ No   |
| `locationId`        | Scope effect to correct world                             | ✅ Yes      | ❌ No   |
| `inventorySnapshot` | Replay validation: was action valid at that time?         | ✅ Yes      | ❌ No   |
| `worldContext`      | Provide narrative engine with context                     | ✅ Yes      | ❌ No   |

### What We Don't Store

❌ `narrativeText` — Regenerated on demand  
❌ `narrativeStyle` (tempo: snappy/immersive/cinematic) — Client preference, not persisted  
❌ `aiModelUsed` — Implementation detail  
❌ `generationLatency` — Telemetry only

## Storage Location: Two Options

### Option A: Extend WorldEventEnvelope.payload (Simpler)

Store intent as part of existing world event:

```typescript
// Move action example
{
  eventType: "Player.Move",
  correlationId: "...",
  payload: {
    // Existing state
    fromLocationId: "loc-1",
    toLocationId: "loc-2",
    direction: "north",

    // NEW: Intent for reproducibility
    actionIntent: {
      rawInput: "go north",
      parsedIntent: {
        verb: "move",
        targets: [{ kind: "direction", name: "north" }]
      }
    }
  }
}
```

**Pros:**

- Uses existing event infrastructure
- No new repository needed
- `idempotencyKey` already includes `correlationId:eventType:scopeKey`

**Cons:**

- Payload grows for every event type
- Not all events are actions (NPC.Tick, World.Ambience.Generated)

### Option B: Separate ActionHistory Container (Explicit)

New Cosmos container: `ActionHistory` with documents:

```typescript
{
  id: "action-uuid",
  partitionKey: "/playerId",
  actionId: "...",
  playerId: "...",
  correlationId: "...",
  timestamp: "...",
  rawInput: "set fire to the forest",
  parsedIntent: { ... },
  relatedEventId?: "event-uuid",  // Link to resulting world event
  status: "succeeded" | "failed",
  stateChanges: { ... }
}
```

**Pros:**

- Clear separation: actions vs world state
- Efficient queries: "all actions by player X"
- Audit trail independent of event processing

**Cons:**

- New repository type
- Need to link actions to events (post-hoc via `correlationId`)

---

## Recommendation: Option A (Extend Payload) with Rollout Strategy

**Phase 1 (M3c+):**

- Add `actionIntent` to `WorldEventEnvelope.payload` schema
- Update player action handlers (Move, Look, Examine, etc.) to populate it
- Does NOT require new repository or breaking changes

**Phase 2 (M5+, if needed):**

- If audit/replay queries become common, migrate to separate `ActionHistory` container
- Backfill from existing world events' `actionIntent` fields

**Phase 3 (M6+):**

- Narrative generation pipeline uses stored intent + state to regenerate text

---

## Handler Refactoring Scope

### Handlers That Must Capture Intent

1. **Move** (`HttpMove`, `handlePlayerMove`)
    - Current: Stores `{ fromLocationId, toLocationId, direction }`
    - Add: `{ actionIntent: { verb: "move", targets: [{ kind: "direction", name }] } }`

2. **Look / Examine** (`HttpLook`, `handlePlayerLook`)
    - Current: No world event (response-only)
    - Add: Emit `Player.Look` event with intent
    - Payload: `{ actionIntent: { verb: "look", targets: [{ kind: "location" }] } }`

3. **Get Item** (`HttpGetItem`)
    - Current: Updates inventory
    - Add: Emit `Player.GetItem` with intent
    - Payload: `{ actionIntent: { verb: "get", targets: [{ kind: "item", id }], resources: [] } }`

4. **Generic Action Handler** (planned, M4+)
    - Current: Not implemented
    - Add: Intent parser + validation → state changes → emit event with intent
    - Payload: Full `ActionIntent` structure

5. **NPC Interactions** (look/talk/trade)
    - Current: Simple state updates
    - Add: Intent capture for narrative consistency
    - Payload: `{ actionIntent: { verb: "interact", method: "trade", targets: [{ kind: "npc", id }] } }`

---

## Narrative Engine Integration

### Generation Function Signature

```typescript
// shared/src/services/narrativeEngine.ts

export interface NarrativeGenerationInput {
    actionIntent: ActionIntent['parsedIntent']
    stateChangesSummary: Record<string, unknown>
    context: {
        locationName: string
        locationDescription: string
        weatherLayer?: string
        timeOfDay?: string
        npcsPresent?: string[]
    }
    tempo?: 'snappy' | 'immersive' | 'cinematic'
    seed?: number // For deterministic variation (same seed → similar narrative)
}

export async function generateActionNarrative(input: NarrativeGenerationInput): Promise<string> {
    // Uses intent, not message history
    // Regenerates text from state + context
    // May produce different wording on each call (that's fine)
}
```

### Replay Scenario

```typescript
// Stored action (from ActionIntent or world event payload)
const action = {
  rawInput: "set fire to the forest",
  parsedIntent: {
    verb: "ignite",
    method: "tinderbox",
    resources: [{ itemId: "tinderbox-abc", chargesConsumed: 1 }]
  }
}

// Regenerate narrative (frontend shows history)
const narrative = await narrativeEngine.generateActionNarrative({
  actionIntent: action.parsedIntent,
  stateChangesSummary: { tinderboxCharges: 5 → 4, fireIntensity: 0 → moderate },
  context: { locationName: "Forest Clearing", weatherLayer: "dry season" }
})

// Output: "You strike the tinderbox. Flames lick hungrily at the dry undergrowth."
// OR:     "Sparks leap from your tinderbox. The forest erupts in orange flames."
// (Different narrative, same state change — BOTH valid)
```

---

## Backward Compatibility

**Current state:** Handlers emit world events WITHOUT intent data.  
**Transition strategy:**

1. Add optional `actionIntent?: ActionIntent` to `WorldEventEnvelope.payload`
2. Old handlers continue to work (omit intent)
3. New/refactored handlers populate intent
4. Narrative generation gracefully handles missing intent (fall back to template)

```typescript
// Graceful degradation
if (event.payload.actionIntent) {
    // Use stored intent
    return await narrativeEngine.generateActionNarrative(input)
} else {
    // Fall back to template / base description
    return getBaseNarrative(event.type)
}
```

---

## Related Documents

- `docs/architecture/event-classification-matrix.md` (Rule 2.5)
- `docs/architecture/world-event-contract.md` (WorldEventEnvelope shape)
- `docs/architecture/description-layering-and-variation.md` (Narrative layers)
- `docs/design-modules/ai-prompt-engineering.md` (AI narrative generation)

---

## Next Steps

1. **Update shared/src/domainModels.ts** with `ActionIntent` interface
2. **Update WorldEventEnvelopeSchema** to allow optional `actionIntent` in payload
3. **Refactor move handler** (MVP) to capture and emit intent
4. **Create narrative generation demo** showing intent → multiple valid narratives
5. **Update tests** to verify intent round-trips through world events
