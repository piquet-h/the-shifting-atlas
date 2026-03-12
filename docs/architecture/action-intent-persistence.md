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

Authoritative implementation source of truth: `shared/src/actionIntent.ts`.

### Schema Definition

```typescript
// shared/src/actionIntent.ts — illustrative; shared contract is authoritative

export type ActionIntentTargetKind =
    | 'location'
    | 'player'
    | 'npc'
    | 'item'
    | 'direction'
    | 'latent-reference' // unresolved but bounded surface reference

export type ActionIntentResourceKind =
    | 'item'
    | 'currency'
    | 'offer'    // social-contract: something offered in a bargain
    | 'proof'    // social-contract: evidence presented in negotiation
    | 'service'  // social-contract: labour/action pledged
    | 'ability'  // social-contract: capability/skill offered

export interface ActionIntent {
    // Raw Input
    rawInput: string // Exact text from player: "set fire to the forest"

    // Parsed Intent (produced by intent parser / rules engine)
    parsedIntent: {
        verb: string   // "ignite", "move", "examine", "cast", etc.
        method?: string // How they're doing it: "tinderbox", "spell", "friction"

        targets?: {
            kind: ActionIntentTargetKind
            id?: string              // Canonical entity ID (resolved)
            name?: string            // Human-readable label
            surfaceText?: string     // Unresolved surface mention from raw input
            canonicalDirection?: string // For direction-kind targets
        }[]

        resources?: {
            kind: ActionIntentResourceKind
            id?: string              // Canonical entity ID (resolved)
            itemId?: string          // Inventory item reference
            name?: string            // Human-readable label
            quantity?: number        // Positive integer
            charges?: number         // Non-negative; for rechargeable items
            details?: Record<string, unknown> // Extensible metadata
        }[]

        context?: Record<string, unknown> // Bounded intent context
    }

    // Validation result
    validationResult: {
        success: boolean
        errors?: string[]
        warnings?: string[]
    }
}
```

The illustrative interface above is kept in sync with the exported shared contract; when they diverge, `shared/src/actionIntent.ts` is authoritative.

### Why These Fields?

| Field       | Reason                                                    | Persistence | Mutable |
| ----------- | --------------------------------------------------------- | ----------- | ------- |
| `rawInput`  | Reproduce intent parsing decisions; detect nuance loss    | ✅ Yes      | ❌ No   |
| `verb`      | Classify action type for routing                          | ✅ Yes      | ❌ No   |
| `method`    | Enable flexible narrative ("struck tinderbox" vs "spell") | ✅ Yes      | ❌ No   |
| `targets`   | Identify what was acted upon                              | ✅ Yes      | ❌ No   |
| `resources` | Establish what was consumed (reproducibility)             | ✅ Yes      | ❌ No   |
| `context`   | Bounded intent metadata (urgency, weather, etc.)          | ✅ Yes      | ❌ No   |

**Note:** `correlationId`, `timestamp`, and `actor` already exist on `WorldEventEnvelope` and should not be duplicated inside `ActionIntent`.

### Target Kinds

| Kind               | Meaning                                                                    |
| ------------------ | -------------------------------------------------------------------------- |
| `location`         | A named map location with a canonical ID                                   |
| `player`           | A player character                                                         |
| `npc`              | A non-player character                                                     |
| `item`             | An inventory or world item                                                 |
| `direction`        | A traversal direction (north/south/etc.); `canonicalDirection` is preferred for determinism; `surfaceText` / `name` for ambiguous surface mentions needing AI resolution |
| `latent-reference` | Unresolved surface mention ("the suspicious stranger") — no canonical ID yet |

`latent-reference` enables non-mutating command resolution: the resolver knows a surface name was mentioned but does not require a canonical entity ID until resolution time.

### Resource Kinds (Social-Contract Ready)

| Kind       | Meaning                                                       |
| ---------- | ------------------------------------------------------------- |
| `item`     | Physical inventory item                                       |
| `currency` | In-game currency                                              |
| `offer`    | Something offered in a bargain (social-contract)              |
| `proof`    | Evidence or attestation presented in negotiation              |
| `service`  | Labour or action pledged as part of a deal                    |
| `ability`  | A capability or skill offered or invoked                      |

The `offer`, `proof`, `service`, and `ability` kinds are present now so that social-contract and bargain actions can use the same `ActionIntent` shape without a schema revision.

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

## Design Rationale

### Why Not Store Narrative Text?

**Problem with the old approach:**

- Thousands of ways to phrase an action → thousands of message templates, or generic boring fallbacks
- HTTP response blocked on AI generation (800–2000ms latency)
- Disputes are unresolvable ("I had 5 charges, you said I succeeded")

**Solution:**

1. **Store intent** (small, fast, deterministic): `{ verb: "ignite", method: "tinderbox", targets: [...] }`
2. **Generate narrative** (AI, on demand): "You strike the tinderbox. Flames lick hungrily at the dry undergrowth."
3. **Replay produces identical state** — narrative may differ, but the outcome is always the same

**Latency decoupling:**

- Intent + state write: 100–300ms (quick DB write)
- Narrative generation: async, bounded by timeout + fallback
- HTTP response returns immediately after state is persisted

### Three Valid Narratives for the Same State

```
State: { event: "Location.Fire.Started", intensity: "moderate", cause: "player-tinderbox" }

Narrative A: "You strike the tinderbox. Flames lick hungrily at the dry undergrowth."
Narrative B: "Sparks leap from your tinderbox. The forest erupts in orange flames."
Narrative C: "Your tinderbox catches. Fire spreads across the forest floor."
```

All three are correct. State is ground truth; narration is ephemeral rendering.

---

## FAQ

| Question                                    | Answer                                                                                                                |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| "Why not just use templates?"               | Storing intent (small) + generating narrative (AI) handles infinite variation without templates                       |
| "Does replay show same message?"            | No — narrative regenerates (may differ), but state is identical. Both correct.                                        |
| "Does this break existing producers/tests?" | Yes — this is a deliberate contract change. Update producers/tests emitting player actions to include `actionIntent`. |
| "How does this affect latency?"             | Narrative gen doesn't block state save; bounded timeout prevents cascading delays                                     |
| "What if AI generation fails?"              | Fall back to base template; queue enrichment for async retry.                                                         |

---

## Related Documents

- `docs/architecture/event-classification-matrix.md` (Rule 2.5)
- `docs/architecture/world-event-contract.md` (WorldEventEnvelope shape)
- `docs/architecture/action-intent-migration-shape.md` (migration shape)
- `docs/design-modules/ai-prompt-engineering.md` (AI narrative generation)
