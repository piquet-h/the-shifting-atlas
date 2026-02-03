# Code Refactoring Roadmap: Intent Persistence

> Status: DESIGN  
> Purpose: Map required changes to existing codebase to support ActionIntent capture and persistence  
> Effort: Significant refactoring (not breaking, but widespread)

## Phase 1: Schema & Infrastructure (Foundation)

### 1.1 Add ActionIntent Type to shared/src/domainModels.ts

```typescript
// Before
export interface WorldEventEnvelope {
    payload: Record<string, unknown> // Untyped
}

// After
export interface ActionIntent {
    rawInput: string
    parsedIntent: {
        verb: string
        method?: string
        targets?: Array<{ kind: string; id?: string; name?: string }>
        resources?: Array<{ itemId: string; quantity: number }>
        context?: Record<string, unknown>
    }
    validationResult: { success: boolean; errors?: string[] }
}
```

**Files to create/modify:**

- `shared/src/domainModels/actionIntent.ts` (NEW)
- `shared/src/domainModels.ts` (export ActionIntent)

**Impact:** Low; addition only, no breaking changes.

---

### 1.2 Update WorldEventEnvelope Schema to Allow actionIntent in Payload

**File:** `shared/src/events/worldEventSchema.ts`

```typescript
// Current payload schema
payload: z.record(z.string(), z.unknown())

// Add optional actionIntent field (while keeping backward compat)
export const ActionIntentSchema = z.object({
    rawInput: z.string(),
    parsedIntent: z.object({
        verb: z.string(),
        method: z.string().optional(),
        targets: z
            .array(
                z.object({
                    kind: z.enum(['location', 'player', 'npc', 'item', 'direction']),
                    id: z.string().optional(),
                    name: z.string().optional()
                })
            )
            .optional(),
        resources: z
            .array(
                z.object({
                    itemId: z.string(),
                    quantity: z.number(),
                    charges: z.number().optional()
                })
            )
            .optional(),
        context: z.record(z.string(), z.unknown()).optional()
    }),
    validationResult: z.object({
        success: z.boolean(),
        errors: z.array(z.string()).optional(),
        warnings: z.array(z.string()).optional()
    })
})

// Updated payload schema
payload: z.record(z.string(), z.unknown()).extend({
    actionIntent: ActionIntentSchema.optional() // Backward compat: optional
})
```

**Impact:** Schema change (additive, non-breaking). Tests need to verify optional field.

---

## Phase 2: Handler Refactoring (MVP: Move Handler)

### 2.1 Update MoveCore Handler to Capture Intent

**File:** `backend/src/handlers/moveCore.ts`

**Current flow:**

```typescript
async performMove(req: HttpRequest): Promise<MoveResult> {
  // 1. Parse rawDir from request
  // 2. Normalize direction (ambiguous? missing? invalid?)
  // 3. Validate exit exists
  // 4. Update player location in SQL
  // 5. Return MoveResult
}
```

**New flow:**

```typescript
async performMove(req: HttpRequest): Promise<MoveResult> {
  // 1. Capture rawInput EARLY
  const rawInput = req.query.get('dir') || parseBody(req).dir || ''

  // 2-4. [existing logic: parse, normalize, validate]

  // 5. NEW: Build ActionIntent
  const actionIntent: ActionIntent = {
    rawInput,
    parsedIntent: {
      verb: "move",
      targets: [{
        kind: "direction",
        name: normalizationResult.direction || rawInput
      }]
    },
    validationResult: {
      success: moveResult.success,
      errors: moveResult.error ? [moveResult.error.reason] : []
    }
  }

  // 6. Emit world event WITH intent
  if (moveResult.success) {
    // DON'T do this in the HTTP handler (blocking issue!)
    // Instead, return actionIntent + let middleware enqueue
    moveResult.actionIntent = actionIntent
  }

  return moveResult
}
```

**Emit the event (in execute() or middleware):**

```typescript
protected async execute(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const moveResult = await this.performMove(req)

  // NEW: Emit world event if successful
  if (moveResult.success && moveResult.actionIntent) {
    const emitResult = emitWorldEvent({
      eventType: "Player.Move",
      scopeKey: `loc:${moveResult.location?.id}`,
      payload: {
        fromLocationId: fromId,
        toLocationId: moveResult.location.id,
        direction: direction,
        // NEW
        actionIntent: moveResult.actionIntent
      },
      actor: { kind: "player", id: this.playerGuid },
      correlationId: this.correlationId
    })

    await enqueueWorldEvent(emitResult)
  }

  return buildMoveResponse(moveResult, this.correlationId)
}
```

**Impact:**

- Moderate refactoring of MoveHandler
- NEW field in MoveResult interface: `actionIntent?: ActionIntent`
- Tests need to verify actionIntent is captured and emitted

**Critical Issue:** Currently, HTTP handler doesn't emit events (handlers return state, middleware handles queueing). This refactor requires clarifying the boundary.

---

### 2.2 Update Look Handler (Secondary)

**File:** `backend/src/handlers/look/` (if exists, or create)

**Current:** Returns description, no event emitted.  
**New:** Emit `Player.Look` event with intent.

```typescript
const actionIntent: ActionIntent = {
    rawInput: 'look', // or "look at fountain", etc.
    parsedIntent: {
        verb: 'look',
        targets: actionTarget ? [{ kind: 'location', id: actionTarget }] : undefined
    },
    validationResult: { success: true }
}

emitWorldEvent({
    eventType: 'Player.Look',
    scopeKey: `loc:${currentLocationId}`,
    payload: {
        locationId: currentLocationId,
        actionIntent
    }
})
```

**Impact:** Moderate; adds event emission to previously synchronous handler.

---

### 2.3 Update GetItem Handler

**File:** `backend/src/handlers/get-item/` (if exists)

Similar to Move: capture intent, emit `Player.GetItem` event.

```typescript
const actionIntent: ActionIntent = {
    rawInput: `get ${itemName}`, // What they typed
    parsedIntent: {
        verb: 'get',
        targets: [{ kind: 'item', id: itemId, name: itemName }],
        resources: [] // Items getting, not consuming
    },
    validationResult: { success: moveResult.success }
}
```

**Impact:** Moderate.

---

## Phase 3: Generic Action Handler (M4+)

**File:** `backend/src/handlers/action/` (NEW or refactor existing)

This is where complex intent parsing happens (M4 AI Read):

```typescript
// Handler that accepts arbitrary player commands
export async function handlePlayerAction(req: HttpRequest): Promise<HttpResponseInit> {
    const command = req.body.command || '' // "set fire to the forest"

    // Step 1: Intent parsing (AI or rules)
    const parsedIntent = await intentParser.parse(command, worldContext)

    const actionIntent: ActionIntent = {
        rawInput: command,
        parsedIntent,
        validationResult: { success: true } // Parsing always succeeds; validation separate
    }

    // Step 2: Validation (rules engine)
    const validationResult = await validator.validate(parsedIntent, playerState)
    if (!validationResult.success) {
        return {
            status: 400,
            jsonBody: {
                success: false,
                errors: validationResult.errors,
                actionIntent // Include parsed intent in error response for debugging
            }
        }
    }

    // Step 3: Apply state changes
    const stateChanges = await applyAction(parsedIntent, playerState)

    // Step 4: Generate narrative (bounded, with fallback)
    const narrative = await narrativeEngine.generateActionNarrative(actionIntent.parsedIntent, stateChanges, {
        timeoutMs: 1500,
        fallback: getBaseNarrative(parsedIntent.verb)
    })

    // Step 5: Emit world event
    emitWorldEvent({
        eventType: `Action.${parsedIntent.verb}`, // "Action.Ignite", "Action.Craft"
        scopeKey: `loc:${playerState.locationId}`,
        payload: {
            ...stateChanges,
            actionIntent
        },
        actor: { kind: 'player', id: playerId },
        correlationId: this.correlationId
    })

    // Step 6: Return immediately (don't wait for event processing)
    return {
        status: 200,
        jsonBody: {
            success: true,
            message: narrative,
            inventory: playerState.inventory,
            correlationId: this.correlationId
        }
    }
}
```

**Impact:** High; new handler, integrates intent parsing + validation + generation + emission.

---

## Phase 4: Narrative Engine (M5+)

**File:** `shared/src/services/narrativeEngine.ts` (NEW or extend)

```typescript
export async function generateActionNarrative(
    intent: ActionIntent['parsedIntent'],
    stateChanges: Record<string, unknown>,
    context: {
        locationName: string
        locationDescription: string
        weatherLayer?: string
    },
    options?: { timeoutMs?: number; fallback?: string }
): Promise<string> {
    // Use intent (not stored message)
    // Call AI with prompt like:
    // "Player just tried to: {verb} {method} {targets}. Describe the result."

    try {
        const narrative = await aiClient.generate(prompt, { timeoutMs: options?.timeoutMs ?? 1500 })
        return narrative
    } catch {
        return options?.fallback || `You attempt to ${intent.verb}...`
    }
}
```

**Impact:** Medium; new service, integrated with narrative layer (description composition).

---

## Boundary Issues to Resolve

### Issue 1: HTTP Handler Event Emission

**Current state:**

- Handlers return response data
- Middleware or separate component enqueues events

**Problem:**

- Intent is local to handler; if middleware enqueues, it doesn't have actionIntent
- Solution: Return actionIntent in response object, let middleware forward it

**Required change:**

```typescript
// BaseHandler or response builder needs to know about actionIntent
export interface ActionResult {
    success: boolean
    message: string
    actionIntent?: ActionIntent // NEW
    stateChanges: Record<string, unknown>
}

// Middleware uses actionIntent to enqueue event
const emitResult = emitWorldEvent({
    eventType,
    payload: {
        ...stateChanges,
        actionIntent: actionResult.actionIntent // From handler
    }
})
```

---

### Issue 2: Long-Running Narrative Generation

**Current design:**

- HTTP handler should return <500ms

**Problem:**

- Narrative generation for complex actions takes 800-2000ms
- Can't block HTTP response

**Solution:**  
Use bounded timeout + fallback:

```typescript
const narrativePromise = narrativeEngine.generate(intent, {
    timeoutMs: 1200,
    fallback: `You ${intent.verb} successfully.`
})

// Don't await; return immediately, but track for enrichment
const [narrative] = await Promise.allSettled([narrativePromise])
const message = narrative.status === 'fulfilled' ? narrative.value : narrative.reason

// If narrative was slow, enqueue async enrichment
if (narrativeLatency > 500) {
    enqueueActionEnrichment({
        actionId,
        intent,
        fallback: message
    })
}
```

---

### Issue 3: Backward Compatibility

**Current events don't have actionIntent.**

**Solution:**

- Make `actionIntent` optional in schema
- Graceful degradation: if missing, fall back to template
- Gradually migrate handlers

```typescript
// When rendering stored action:
if (event.payload.actionIntent) {
    return generateNarrative(event.payload.actionIntent, event.payload)
} else {
    return getTemplateNarrative(event.type)
}
```

---

## Refactoring Checklist

### Core Schema (P0)

- [ ] Create `shared/src/domainModels/actionIntent.ts`
- [ ] Update `WorldEventEnvelopeSchema` to allow optional actionIntent
- [ ] Add tests for ActionIntent validation

### Move Handler (P0 MVP)

- [ ] Update `MoveCore.performMove()` to capture rawInput + normalization
- [ ] Update `MoveResult` interface with `actionIntent?: ActionIntent`
- [ ] Update event emission to include actionIntent in payload
- [ ] Add tests verifying actionIntent round-trips through world event

### Look Handler (P1)

- [ ] Emit `Player.Look` event with intent
- [ ] Tests

### Get Item Handler (P1)

- [ ] Emit `Player.GetItem` event with intent
- [ ] Tests

### Generic Action Handler (P2, M4+)

- [ ] Create handler structure
- [ ] Integrate intent parser
- [ ] Integrate validator
- [ ] Add bounded narrative generation
- [ ] Comprehensive tests

### Narrative Engine (P3, M5+)

- [ ] Create `narrativeEngine.generateActionNarrative()`
- [ ] Integrate with description composer
- [ ] Add timeout + fallback logic
- [ ] Tests with mock AI responses

### Utilities

- [ ] Add `ActionIntent` exports to barrel files (`index.ts`)
- [ ] Update telemetry to track intent parsing latency
- [ ] Add optional actionIntent field to world event telemetry

---

## Risk Assessment

| Risk                                   | Likelihood | Impact | Mitigation                                                               |
| -------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------ |
| Breaking change to WorldEventEnvelope  | Low        | High   | Keep actionIntent optional; add schema version                           |
| Handler event emission timing issues   | Medium     | Medium | Define clear responsibility: handler returns intent, middleware emqueues |
| Narrative generation timeout cascades  | Medium     | Medium | Bounded timeouts + fallback templates; track latency                     |
| Intent parsing missing edge cases      | High       | Low    | Start with simple verbs (move, look, get); expand gradually              |
| Backward compat issues with old events | Medium     | Low    | Graceful fallback when actionIntent missing                              |

---

## Effort Estimate

| Phase               | Scope                     | Est. Days    | Notes                                      |
| ------------------- | ------------------------- | ------------ | ------------------------------------------ |
| 1: Schema           | Types + validation        | 2            | Low risk, contained change                 |
| 2: Move Handler     | MVP handler + tests       | 4            | Moderate; requires careful event timing    |
| 3: Other handlers   | Look, GetItem             | 3            | Repetitive once pattern established        |
| 4: Generic handler  | M4+ action system         | 8            | High complexity; intent parser + validator |
| 5: Narrative engine | AI generation integration | 5            | Depends on M5 narrative layer completion   |
| **Total**           | **Full refactoring**      | **~22 days** | Spread across M3c–M6                       |

---

## Rollout Strategy

### M3c (Now)

- [ ] Merge Rule 2.5 documentation clarification
- [ ] Create ActionIntent schema
- [ ] MVP: Update Move handler + tests
- [ ] Demo: Same state, different narratives

### M4 AI Read

- [ ] Integrate intent parser (M4 AI Read workstream)
- [ ] Generic Action handler
- [ ] Update Look, GetItem handlers

### M5 Quality & Depth

- [ ] Narrative engine integration
- [ ] Async enrichment for slow narratives
- [ ] Dashboard: track intent parse success rate

### M6+ Systems

- [ ] Extend to all action types
- [ ] Audit trail queries

---

## Success Criteria

- [ ] ActionIntent is captured for all player-initiated actions
- [ ] Same state produces multiple valid narratives (verified by test)
- [ ] No breaking changes to existing handlers
- [ ] HTTP response latency unaffected (narrative generation doesn't block)
- [ ] Backward compat maintained (old events work with fallbacks)
- [ ] Telemetry tracks intent parsing success, generation latency
