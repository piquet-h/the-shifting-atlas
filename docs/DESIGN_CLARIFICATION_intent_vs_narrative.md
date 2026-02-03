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
  resources: [{ itemId: "tinderbox-abc", chargesConsumed: 1 }]
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
      "actionId": "...",
      "rawInput": "set fire to the forest",
      "parsedIntent": { "verb": "ignite", "resources": [{ "itemId": "tinderbox", "quantity": 1 }] },
      "stateChanges": { "tinderbox.charges": 5 → 4 },
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

---

## Documentation Changes

### 1. event-classification-matrix.md (NEW Section: Rule 2.5)

**Added:** "Intent Persistence vs Narrative Ephemerality"

Clarifies:

- What IS state (intent, parsed action, state changes)
- What is NOT state (narration)
- Why multiple narratives are valid
- How this decouples latency from persistence

### 2. action-intent-persistence.md (NEW)

Defines:

- ActionIntent schema (what gets persisted)
- Two storage options (extend WorldEventEnvelope payload vs separate container)
- Recommendation: Phase 1 uses extended payload (non-breaking)
- Integration with narrative engine (how to regenerate text from intent)

### 3. action-intent-refactoring-roadmap.md (NEW)

Maps:

- Required schema changes (P0)
- Handler changes (P0 Move → P2 generic action)
- Boundary issues (event emission, narrative timeout)
- Risk assessment and rollout strategy

---

## Code Changes Required

### Minimal (MVP, M3c):

1. **Add ActionIntent Type**

    ```typescript
    // shared/src/domainModels/actionIntent.ts
    export interface ActionIntent {
        rawInput: string
        parsedIntent: { verb; method?; targets?; resources?; context? }
        validationResult: { success; errors? }
    }
    ```

2. **Update WorldEventEnvelopeSchema**

    ```typescript
    // Extend payload to allow optional actionIntent
    payload: z.record(...).extend({
      actionIntent: ActionIntentSchema.optional()
    })
    ```

3. **Update Move Handler**
    ```typescript
    // Capture rawInput + parsed intent
    // Include in emitted world event payload
    // Test: verify intent round-trips
    ```

### Moderate (M4-M5):

4. **Generic Action Handler** (intent parser + AI generation)
5. **Narrative Engine** (generate text from intent + state)
6. **Look / GetItem Handlers** (same pattern as Move)

---

## Latency Boundaries (Revised)

| Action                       | Old Boundary             | New Boundary                                             | Rationale                                                                 |
| ---------------------------- | ------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------- |
| Simple move                  | <500ms p95               | <300ms p95                                               | No narrative generation needed                                            |
| Simple look                  | <500ms p95               | <200ms p95 + optional async enrichment                   | Base description fast, AI enrichment async                                |
| Complex action (fire, craft) | <500ms p95 (impossible!) | <300ms p95 for state, ~1-2s for narrative (non-blocking) | Intent + state validation fast; narration bounded but can fail gracefully |

---

## FAQ

### Q: If narrative is ephemeral, why not just use templates?

**A:** Templates require pre-writing thousands of variations. Storing **intent** (structured) + generating **narrative** (AI) handles infinite variation efficiently. The key insight is: intent is small (structured data), but the space of valid narratives is enormous.

### Q: What if I want consistent narrative on replay?

**A:** Use a deterministic seed. Include a hash of the intent + state + seed:

```typescript
const seed = hashIntent(intent, stateChanges, timestamp) // Deterministic
const narrative = await narrativeEngine.generate(intent, { seed })
// Same seed → similar narrative (not exact, but consistent tone)
```

But for most use cases, "same state, different narration" is perfectly fine.

### Q: Does this break existing event handlers?

**A:** No. `actionIntent` is optional in WorldEventEnvelope.payload. Old events without intent use fallback templates. New handlers populate intent.

### Q: How does this interact with M4 AI Read?

**A:** Perfect alignment:

- M4 AI Read builds intent parser + validator
- Generic action handler uses intent parser output
- ActionIntent structure feeds directly into AI generation (M5)

### Q: What about simple actions like "move north"?

**A:** Intent is trivial:

```json
{
    "verb": "move",
    "targets": [{ "kind": "direction", "name": "north" }]
}
```

Narration can still vary: "You head north" vs "You walk north" vs "You venture northward." But all describe the same state change.

---

## Validation Checklist

Before merging this design, verify:

- [ ] Rule 2.5 (event-classification-matrix.md) is clear
- [ ] ActionIntent schema is well-defined
- [ ] Refactoring roadmap is realistic and staged
- [ ] Move handler refactoring plan is clear
- [ ] Narrative engine integration pattern is sketched
- [ ] Backward compatibility strategy is explicit
- [ ] Latency boundaries are realistic (no <500ms for narrative)
- [ ] Team agrees on terminology (intent vs narration, state vs ephemeral)

---

## Next Steps

1. **Merge documentation updates** (Rule 2.5 + two new design docs)
2. **Initiate Move handler refactor** (P0, M3c)
    - Assign: Who implements MVP?
    - Timeline: 2-3 days
    - Success: Move handler captures + emits ActionIntent
3. **Schedule design review** with narrative/AI team
    - Confirm narrative engine integration pattern
    - Agree on Intent → Narrative prompt shape
4. **Create GitHub issues** for handler migration
    - Move (P0, M3c)
    - Look (P1, M3c+)
    - GetItem (P1, M3c+)
    - Generic Action (P2, M4)

---

## Related Reading

- `event-classification-matrix.md` (Rule 2.5: Intent Persistence)
- `action-intent-persistence.md` (Schema definition)
- `action-intent-refactoring-roadmap.md` (Implementation plan)
- `docs/tenets.md` (#7 Narrative Consistency)
- `docs/architecture/description-layering-and-variation.md` (Narrative layers)

---

_Written: 2025-11-24 | Status: DESIGN LOCKED | Next Review: After MVP implementation_
