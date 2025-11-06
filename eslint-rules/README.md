# Custom ESLint Rules

This directory contains custom ESLint rules specific to The Shifting Atlas project. These rules enforce architectural patterns and prevent common mistakes.

## Rules

### `cosmos-gremlin-repo-constructor`

**Purpose:** Ensures proper Inversify dependency injection for Cosmos DB Gremlin repositories.

**Problem it solves:**  
When a class extends `CosmosGremlinRepository`, the base class has a constructor that requires `@inject('GremlinClient')`. Without an explicit constructor in the derived class, Inversify's decorator metadata may not properly recognize the injection requirement, causing `client` to be `undefined` at runtime.

**What it checks:**

-   ✅ Classes extending `CosmosGremlinRepository` must have an explicit constructor
-   ✅ The constructor must have a parameter decorated with `@inject('GremlinClient')`
-   ✅ The constructor must call `super(client)` to initialize the base class

**Example - Correct pattern:**

```typescript
import { inject, injectable } from 'inversify'
import type { IGremlinClient } from '../gremlin/gremlinClient.js'
import { CosmosGremlinRepository } from './base/index.js'
import type { ILocationRepository } from './locationRepository.js'

@injectable()
export class CosmosLocationRepository extends CosmosGremlinRepository implements ILocationRepository {
    constructor(@inject('GremlinClient') client: IGremlinClient) {
        super(client)
    }

    // ... repository methods
}
```

**Example - Violations:**

```typescript
// ❌ Missing constructor entirely
@injectable()
export class BadRepository extends CosmosGremlinRepository {
    async someMethod() { ... }
}

// ❌ Missing @inject decorator
@injectable()
export class BadRepository extends CosmosGremlinRepository {
    constructor(client: IGremlinClient) {
        super(client)
    }
}

// ❌ Missing super() call
@injectable()
export class BadRepository extends CosmosGremlinRepository {
    constructor(@inject('GremlinClient') client: IGremlinClient) {
        // Missing super(client)
    }
}
```

**When added:** October 2025  
**Related issues:** Fixed dependency injection failures in e2e tests

---

### `handlers-must-extend-base`

**Purpose:** Ensures all handler classes extend `BaseHandler` to have access to `ITelemetryClient` and common utilities.

**Applies to:** Files in `backend/src/handlers/` ending with `.handler.ts`

**What it checks:**

-   Handler classes must extend `BaseHandler`
-   Discourages standalone handler functions (old pattern)

---

### `telemetry-event-name`

**Purpose:** Enforces that telemetry event names are constants from the shared telemetry module, not inline string literals.

**Prevents:**

```typescript
// ❌ Bad - inline string
telemetryClient.trackEvent({ name: 'Player.Move' })

// ✅ Good - constant
telemetryClient.trackEvent({ name: TelemetryEvents.PLAYER_MOVE })
```

---

### `no-direct-track-event`

**Purpose:** Enforces use of the `trackGameEventStrict()` wrapper instead of calling `telemetryClient.trackEvent()` directly.

**Benefits:**

-   Standardized event structure
-   Automatic correlation ID handling
-   Centralized validation

---

### `no-room-telemetry`

**Purpose:** Prevents use of deprecated "Room" terminology in telemetry events. Use "Location" instead.

---

### `no-direct-secret-access`

**Purpose:** Enforces that secret retrieval goes through the `SecretClient` abstraction, not direct Key Vault access.

**Benefits:**

-   Centralized secret management
-   Testability (mock secrets in tests)
-   Consistent error handling

---

### `no-raw-prompt-in-telemetry` (NEW - Issue #309)

**Purpose:** **Security rule** that prevents inclusion of raw prompt or completion text in AI cost telemetry events to ensure PII safety.

**Applies to:** All TypeScript files with telemetry emission calls

**Forbidden fields (case-insensitive):**
- `promptText`, `prompt`
- `completionText`, `completion`, `response`, `responseText`
- `text`, `content`, `message`

**What it checks:**
- `trackEvent()`, `emit()`, `log()`, `trace()` calls
- Direct property assignment and `properties`/`customDimensions` objects
- Nested object structures (recursive checking)

**Example violations:**
```typescript
// ❌ VIOLATION: promptText in properties
telemetryClient.trackEvent({
    name: 'AI.Cost.Estimated',
    properties: {
        promptText: 'Generate a dungeon...',  // Flagged by ESLint
        modelId: 'gpt-4o-mini'
    }
})

// ❌ VIOLATION: completionText in nested object
const props = {
    completionText: 'The dark corridor...',  // Flagged by ESLint
    tokens: 150
}
telemetryClient.emit('AI.Cost.Estimated', props)
```

**Example compliance:**
```typescript
// ✅ CORRECT: Use prepareAICostTelemetry to strip text
import { prepareAICostTelemetry } from '@piquet-h/shared'

const payload = prepareAICostTelemetry({
    modelId: 'gpt-4o-mini',
    promptText: rawPrompt,      // Text stays local
    completionText: rawCompletion  // Not in payload
})

telemetryClient.trackEvent({
    name: 'AI.Cost.Estimated',
    properties: payload  // Only tokens, buckets, cost
})
```

**When added:** November 2025  
**Related:**
- Audit script: `scripts/verify-ai-cost-payload.mjs`
- Unit tests: `shared/test/aiCostPayloadSafety.test.ts`
- Documentation: `docs/observability/ai-cost-telemetry.md`

---

1. Create a new `.mjs` file in this directory
2. Export a rule object with `meta` and `create` properties
3. Import the rule in `backend/eslint.config.mjs`
4. Add it to the `internal` plugin rules object
5. Enable it in the `rules` configuration
6. Document it in this README

## Testing Rules

To test a rule quickly:

1. Create a temporary violating file
2. Run `npm run lint` in the backend directory
3. Verify the rule catches the violation
4. Remove the test file
