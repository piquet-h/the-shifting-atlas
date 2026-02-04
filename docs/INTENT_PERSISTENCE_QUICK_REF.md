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

Persisted state is the **world event envelope** (plus its payload), not the rendered narrative.

At a minimum for player actions:

- `WorldEventEnvelope.actor` (who)
- `WorldEventEnvelope.correlationId` (trace)
- `WorldEventEnvelope.payload.actionIntent` (what they tried to do)
- event-specific payload fields / state changes (what changed)

Narrative text is explicitly **not** persisted.

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

For implementation details and sequencing, see:

- `docs/architecture/action-intent-persistence.md` (contract)
- GitHub issues/milestones (sequencing)

## Key operational rule

Persist canonical state quickly; narration is optional, bounded, and never a prerequisite for persistence.

## FAQ Quick Answers

| Q                                           | A                                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| "Why not just use templates?"               | Storing intent (small) + generating narrative (AI) handles infinite variation without templates                     |
| "Does replay show same message?"            | No—narrative regenerates (may differ), but state is identical. Both correct.                                        |
| "Does this break existing producers/tests?" | Yes—this is a deliberate contract change. Update producers/tests emitting player actions to include `actionIntent`. |
| "How does this affect latency?"             | Narrative gen doesn't block state save; bounded timeout prevents cascading delays                                   |
| "What if AI generation fails?"              | Fallback to base template. Queue enrichment for async retry.                                                        |

## Canonical docs

- `docs/architecture/event-classification-matrix.md` (Rule 2.5)
- `docs/architecture/action-intent-persistence.md` (contract)
- `docs/DESIGN_CLARIFICATION_intent_vs_narrative.md` (design summary)

Implementation work is tracked in GitHub issues (source of truth).
