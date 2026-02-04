# Design Clarification: State vs Narration (Summary)

> Status: DESIGN LOCKED  
> Date: 2025-11-24  
> Audience: Architecture reviewers, handler implementers, narrative engineers

## The Insight (Correcting Prior Assumptions)

**Original Assumption (WRONG):**

> "The message shown to the player IS state—it's the ground truth of what happened"

**Corrected Understanding (RIGHT):**

> "The message is a linguistic _translation_ of state. Multiple valid translations can describe the same state. State is ground truth; narration is ephemeral rendering."

### Example: "Set Fire to Forest"

**Canonical State:**

```json
{
    "event": "Location.Fire.Started",
    "location": "forest-clearing",
    "intensity": "moderate",
    "cause": "player-tinderbox"
}
```

**Three Valid Narratives (all describe the same state):**

1. "You strike the tinderbox. Flames lick hungrily at the dry undergrowth."
2. "Sparks leap from your tinderbox. The forest erupts in orange flames."
3. "Your tinderbox catches. Fire spreads across the forest floor."

**Key Property:**

- State is **deterministic**: same action + same world state → always same state change
- Narration is **ephemeral**: regenerated on demand, may vary stylistically
- On replay: state is identical, narration may differ (both correct)

---

## What MUST Be Persisted

### Layer 1: Player Input (Raw)

```typescript
{
    rawInput: 'set fire to the forest using my tinderbox'
}
```

### Layer 2: Parsed Intent (Deterministic Interpretation)

```typescript
{
  verb: "ignite",
  method: "tinderbox",
  targets: [{ kind: "location", id: "forest-clearing" }],
  resources: [{ itemId: "tinderbox-abc", quantity: 1, charges: 1 }]
}
```

### Layer 3: State Changes (Result)

```typescript
{
  stateChanges: {
    "tinderbox.charges": 5 → 4,
    "location.fire.intensity": 0 → moderate
  },
  sharedWorldEvent: {
    eventType: "Location.Fire.Started",
    intensity: "moderate"
  }
}
```

### Layer 4: [NOT PERSISTED] Narration

```typescript
{
    narrative: 'You strike the tinderbox. Flames lick hungrily...'
    // ↑ Regenerated on demand from layers 1-3
}
```

---

## Why This Matters (Three Benefits)

### 1. **Avoids the Templating Trap**

**Old Problem:**

- "There are thousands of ways to set fire—I need thousands of templates"
- This leads to either hand-crafted messages (unmaintainable) or generic fallbacks (boring)

**New Solution:**

- Store **intent** (structured): "set fire, method=tinderbox, location=forest"
- Generate **narrative** (AI): "You strike the tinderbox..." (varied, always appropriate)
- No templates needed; intent + AI generation handles infinite variation

### 2. **Enables Reproducible Gameplay**

**Scenario: Player disputes outcome**

- Player: "I had 5 charges, you said I succeeded. Why is my tinderbox now at 4?"
- Audit trail:
    ```json
    {
        "correlationId": "...",
        "rawInput": "set fire to the forest",
        "parsedIntent": { "verb": "ignite", "resources": [{ "itemId": "tinderbox", "quantity": 1 }] },
        "stateChanges": { "tinderbox.charges": { "from": 5, "to": 4 } },
        "sharedWorldEvent": { "eventType": "Location.Fire.Started" }
    }
    ```
- Proof: Replay shows exact same state change, narration may vary but outcome is identical

### 3. **Decouples Latency Pressure from Correctness**

**Old design (flawed):**

- "Message must be persisted before HTTP returns"
- "But message generation takes 800-2000ms"
- "Therefore HTTP response takes 800-2000ms"
- Contradiction!

**New design:**

- "Intent must be persisted before HTTP returns" (100-300ms: quick validation + state write)
- "Narrative can be generated asynchronously" (no latency impact)
- "If narration needed in HTTP response, use bounded timeout + fallback"
- No contradiction; no blocking on narrative generation

**Note:** `correlationId`, `timestamp`, and `actor` live on the event envelope; `ActionIntent` focuses on raw input + parsed intent + validation outcome.

---

## References (canonical)

- `docs/architecture/event-classification-matrix.md` (Rule 2.5)
- `docs/architecture/action-intent-persistence.md` (contract)
- `docs/architecture/action-intent-refactoring-roadmap.md` (migration shape)
