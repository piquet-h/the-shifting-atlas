# Quick Reference: Intent Persistence Changes

## The Core Change

```
BEFORE (WRONG):
  Player Input → [Parse] → Message → Persist Message
  "set fire to forest" → "You strike the tinderbox..."
  Problem: Need thousands of message variants

AFTER (RIGHT):
  Player Input → [Parse] → Intent → Persist Intent
                                      ↓
                                  [Generate] → Message (ephemeral)
  "set fire to forest" → { verb: "ignite", method: "tinderbox" } ← Persist this
                              ↓
                          "You strike the tinderbox..." (regenerate on demand)
```

## What Gets Persisted

```json
{
  "actionId": "uuid",
  "correlationId": "uuid",
  "playerId": "uuid",
  "timestamp": "ISO8601",
  "rawInput": "set fire to the forest",        // ← Persist
  "parsedIntent": {                             // ← Persist
    "verb": "ignite",
    "method": "tinderbox",
    "targets": [{ "kind": "location" }],
    "resources": [{ "itemId": "tinderbox", "qty": 1 }]
  },
  "stateChanges": {                             // ← Persist
    "tinderbox.charges": 5 → 4,
    "fire.intensity": 0 → moderate
  }
  // ❌ narrative: "You strike the tinderbox..." - DO NOT PERSIST
}
```

## Storage Change

**OLD:** (implicit, wrong assumption)

- Narrative is part of state

**NEW:** (explicit)

- Intent + state changes are stored in `WorldEventEnvelope.payload.actionIntent`
- Example:
    ```typescript
    emitWorldEvent({
        eventType: 'Player.Move',
        payload: {
            fromLocationId: 'loc-1',
            toLocationId: 'loc-2',
            direction: 'north',
            // NEW:
            actionIntent: {
                rawInput: 'go north',
                parsedIntent: { verb: 'move', targets: [{ kind: 'direction', name: 'north' }] },
                validationResult: { success: true }
            }
        }
    })
    ```

## Handler Refactoring (Phased)

### Phase 1 (M3c): Move Handler

```typescript
// OLD:
async performMove() {
  // Validate + update location
  // Return MoveResult
}

// NEW:
async performMove() {
  // [same validation]
  // Capture rawInput + normalized direction
  const actionIntent = {
    rawInput: req.query.get('dir'),
    parsedIntent: { verb: "move", targets: [...] }
  }
  // Emit world event with actionIntent in payload
  return { ...MoveResult, actionIntent }
}
```

### Phase 2 (M4): Generic Action Handler

```typescript
async handlePlayerAction(command) {
  // 1. Parse intent (AI)
  const intent = await intentParser.parse(command)

  // 2. Validate (rules)
  const valid = await validator.validate(intent)

  // 3. Apply state
  const changes = await applyAction(intent)

  // 4. Generate narrative (bounded, fallback)
  const message = await narrativeEngine.generate(intent, changes, { timeoutMs: 1500 })

  // 5. Emit event with intent
  emitWorldEvent({
    type: `Action.${intent.verb}`,
    payload: { actionIntent: { rawInput: command, parsedIntent: intent }, ...changes }
  })

  // 6. Return (narrative doesn't block)
  return { success: true, message, correlationId }
}
```

## Latency Impact

```
                    STATE SAVE          NARRATIVE
Simple move:        ~100ms              None (template)
Move (with look):   ~100ms              ~1-2s async
Complex action:     ~150ms              ~1-2s bounded (fallback if slow)
```

**Key:** Narrative generation doesn't block state persistence or HTTP response.

## Testing Strategy

### Test 1: Same State, Different Narrative

```typescript
const intent = { verb: "ignite", method: "tinderbox", ... }
const state = { fire: "moderate" }

const narrative1 = await narrativeEngine.generate(intent, state, { seed: 1 })
const narrative2 = await narrativeEngine.generate(intent, state, { seed: 2 })

assert(narrative1 !== narrative2)  // Different text OK
assert(narrative1.includes("fire"))  // But both describe same state
assert(narrative2.includes("fire"))
```

### Test 2: Intent Round-Trip

```typescript
const moveResult = await handler.performMove(req)
assert(moveResult.actionIntent?.rawInput === 'north')

const event = await emitWorldEvent({
    payload: { actionIntent: moveResult.actionIntent }
})
assert(event.envelope.payload.actionIntent.verb === 'move')
```

### Test 3: State Reproducibility

```typescript
// Same action + same state → same changes
const action1 = await applyAction(intent, worldState)
const action2 = await applyAction(intent, worldState)

assert.deepEqual(action1.stateChanges, action2.stateChanges)
// Narrative may differ, but state is identical
```

## FAQ Quick Answers

| Q                                | A                                                                                               |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| "Why not just use templates?"    | Storing intent (small) + generating narrative (AI) handles infinite variation without templates |
| "Does replay show same message?" | No—narrative regenerates (may differ), but state is identical. Both correct.                    |
| "Does this break old handlers?"  | No—`actionIntent` is optional. Old events use fallback templates.                               |
| "How does this affect latency?"  | Narrative gen doesn't block state save; bounded timeout prevents cascading delays               |
| "What if AI generation fails?"   | Fallback to base template. Queue enrichment for async retry.                                    |

## Documentation Artifacts

| File                                                                                       | Purpose                                                       |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| [event-classification-matrix.md](event-classification-matrix.md) (Rule 2.5)                | **Clarification**: Intent is state, narrative is ephemeral    |
| [action-intent-persistence.md](action-intent-persistence.md)                               | **Schema**: ActionIntent definition, storage, integration     |
| [action-intent-refactoring-roadmap.md](action-intent-refactoring-roadmap.md)               | **Implementation**: Phase-by-phase handler changes            |
| [DESIGN_CLARIFICATION_intent_vs_narrative.md](DESIGN_CLARIFICATION_intent_vs_narrative.md) | **Executive Summary**: Why this change matters, benefits, FAQ |

---

## Implementation Checklist (MVP)

- [ ] Merge Rule 2.5 to event-classification-matrix.md
- [ ] Add ActionIntent type to shared/src/domainModels.ts
- [ ] Update WorldEventEnvelopeSchema to allow actionIntent in payload
- [ ] Refactor Move handler to capture + emit actionIntent
- [ ] Add tests verifying actionIntent round-trip
- [ ] Demo: Generate 3 different narratives from same state
- [ ] Update Move handler telemetry

**Est. effort:** 3-4 days (after code review)

---

## Success Signal

You'll know this is working when:

1. Move handler stores actionIntent with every move event
2. Tests show multiple valid narratives for same state
3. Old events (without actionIntent) still work via fallback
4. HTTP response latency unchanged (<300ms)
5. Intent stored, narrative regenerated on demand
