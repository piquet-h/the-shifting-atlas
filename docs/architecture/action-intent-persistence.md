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
  targets: [{ kind: "location", id: "forest-clearing" }],
  resources: [{ itemId: "tinderbox-abc", quantity: 1, charges: 1 }]
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

        // Context about the intent (optional, bounded)
        context?: Record<string, unknown>
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

| Field       | Reason                                                    | Persistence | Mutable |
| ----------- | --------------------------------------------------------- | ----------- | ------- |
| `rawInput`  | Reproduce intent parsing decisions; detect nuance loss    | ✅ Yes      | ❌ No   |
| `verb`      | Classify action type for routing                          | ✅ Yes      | ❌ No   |
| `method`    | Enable flexible narrative ("struck tinderbox" vs "spell") | ✅ Yes      | ❌ No   |
| `targets`   | Identify what was acted upon                              | ✅ Yes      | ❌ No   |
| `resources` | Establish what was consumed (reproducibility)             | ✅ Yes      | ❌ No   |

**Note:** `correlationId`, `timestamp`, and `actor` already exist on `WorldEventEnvelope` and should not be duplicated inside `ActionIntent`.

### What We Don't Store

❌ `narrativeText` — Regenerated on demand  
❌ `narrativeStyle` (tempo: snappy/immersive/cinematic) — Client preference, not persisted  
❌ `aiModelUsed` — Implementation detail  
❌ `generationLatency` — Telemetry only

## Storage Location

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
      },
      validationResult: { success: true }
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

---

## Decision (Current)

We persist **ActionIntent** inside the world event payload:

- `WorldEventEnvelope.payload.actionIntent` is the canonical home for player intent.
- **For any player-initiated action** (`envelope.actor.kind === 'player'`), `payload.actionIntent` is **required**.
- Narrative text remains ephemeral and is regenerated from intent + observed state.

Sequencing and rollout details live in GitHub issues/milestones (source of truth). This document defines the contract.

---

## Implementation notes (non-normative)

- Any **producer** that emits a player-actor envelope must supply `payload.actionIntent`.
- Narrative generation is intentionally not specified here; keep it out of canonical persistence paths.

---

## Related Documents

- `docs/architecture/event-classification-matrix.md` (Rule 2.5)
- `docs/architecture/world-event-contract.md` (WorldEventEnvelope shape)
- `docs/architecture/description-layering-and-variation.md` (Narrative layers)
- `docs/design-modules/ai-prompt-engineering.md` (AI narrative generation)

---

## Next Steps

Implementation work is tracked in GitHub issues/milestones.
