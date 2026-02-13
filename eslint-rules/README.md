# Custom ESLint Rules

This directory contains custom ESLint rules specific to The Shifting Atlas project. These rules enforce architectural patterns and prevent common mistakes.

## Rules

### `cosmos-gremlin-repo-constructor`

**Purpose:** Ensures proper Inversify dependency injection for Cosmos DB Gremlin repositories.

**Problem it solves:**  
When a class extends `CosmosGremlinRepository`, the base class has a constructor that requires `@inject('GremlinClient')`. Without an explicit constructor in the derived class, Inversify's decorator metadata may not properly recognize the injection requirement, causing `client` to be `undefined` at runtime.

**What it checks:**

- ✅ Classes extending `CosmosGremlinRepository` must have an explicit constructor
- ✅ The constructor must have a parameter decorated with `@inject('GremlinClient')`
- ✅ The constructor must call `super(client)` to initialize the base class

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

- Handler classes must extend `BaseHandler`
- Discourages standalone handler functions (old pattern)

---

### `telemetry-event`

**Purpose:** Enforces that telemetry event names follow the canonical pattern (2-3 PascalCase segments) and are registered in `GAME_EVENT_NAMES`.

**Applies to:** Usage sites where telemetry is tracked (e.g., `this.track('Event.Name', {...})`, `trackGameEvent(...)`)

**Catches:**

- Event name violates pattern: `/^[A-Z][A-Za-z]+(\.[A-Z][A-Za-z]+){1,2}$/`
- Event name not declared in `GAME_EVENT_NAMES` registry
- Non-PascalCase segments (e.g., `player.Get`, `my_event`)

**Example - Violation:**

```typescript
this.track('World.BatchGeneration.Prefetch.Failed', {...}) // ❌ 4 segments
```

---

### `telemetry-registry-pattern`

**Purpose:** Validates telemetry event names **at the source** in `shared/src/telemetryEvents.ts` `GAME_EVENT_NAMES` array before they can spread to usage sites.

**Why a separate rule:** Catches naming violations at definition time, preventing downstream violations. Simpler than trying to validate usage patterns.

**Enforces:**

- 2-3 segments maximum (`Domain.Subject?.Action`)
- PascalCase for each segment
- Pattern: `/^[A-Z][A-Za-z]+(\.[A-Z][A-Za-z]+){1,2}$/`

**Example - Violation:**

```typescript
export const GAME_EVENT_NAMES = [
    // ❌ Bad - 4 segments
    'World.BatchGeneration.Prefetch.Failed',
    // ✅ Good - 3 segments
    'World.BatchPrefetch.Failed'
] as const
```

**When added:** February 2026
**Related incident:** Telemetry event naming pattern violation caught by tests, added as lint rule to prevent future violations.

---

### `telemetry-event-name` (DEPRECATED)

**Purpose:** ~~Enforces that telemetry event names are constants from the shared telemetry module, not inline string literals.~~

**Note:** Replaced by `telemetry-event` and `telemetry-registry-pattern` rules.

---

### `telemetry-inject-decorator`

**Purpose:** Ensures required (non-optional) `telemetryService: TelemetryService` constructor parameters in repository classes are explicitly decorated with `@inject(TelemetryService)` to prevent silent DI metadata omissions when the parameter is not first.

**Checks:**

- Repository class (name contains `Repository`) constructor has a non-optional parameter named `telemetryService` typed `TelemetryService`.
- Parameter must have `@inject(TelemetryService)` decorator.
- Warns if legacy string token `@inject('TelemetryService')` is used (policy forbids string tokens for concrete services).
- Ignores optional parameters (`telemetryService?: TelemetryService`) and base abstract repository files.

**Example - Correct:**

```typescript
constructor(@inject(TelemetryService) protected telemetryService: TelemetryService) { /* ... */ }
```

**Example - Violation:**

```typescript
constructor(protected telemetryService: TelemetryService) { /* missing decorator */ }
```

**When added:** November 2025
**Related incidents:** Post-mortem of DI failure for `CosmosLocationRepository` (E2E test seed error).

---

### `no-direct-track-event`

**Purpose:** Enforces use of the `trackGameEventStrict()` wrapper instead of calling `telemetryClient.trackEvent()` directly.

**Benefits:**

- Standardized event structure
- Automatic correlation ID handling
- Centralized validation

---

### `no-room-telemetry`

**Purpose:** Prevents use of deprecated "Room" terminology in telemetry events. Use "Location" instead.

---

### `no-direct-secret-access`

**Purpose:** Enforces that secret retrieval goes through the `SecretClient` abstraction, not direct Key Vault access.

**Benefits:**

- Centralized secret management
- Testability (mock secrets in tests)
- Consistent error handling

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
        promptText: 'Generate a dungeon...', // Flagged by ESLint
        modelId: 'gpt-4o-mini'
    }
})

// ❌ VIOLATION: completionText in nested object
const props = {
    completionText: 'The dark corridor...', // Flagged by ESLint
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
    promptText: rawPrompt, // Text stays local
    completionText: rawCompletion // Not in payload
})

telemetryClient.trackEvent({
    name: 'AI.Cost.Estimated',
    properties: payload // Only tokens, buckets, cost
})
```

**When added:** November 2025  
**Related:**

- Audit script: `scripts/verify-ai-cost-payload.mjs`
- Unit tests: `shared/test/aiCostPayloadSafety.test.ts`
- Documentation: `docs/observability/ai-cost-telemetry.md`

---

### `no-inline-humor-events`

**Purpose:** Enforces that DM (Dungeon Master) humor telemetry event names are referenced from the `GAME_EVENT_NAMES` enumeration rather than being used as inline string literals.

**When added:** November 2025  
**Related issues:** Issue #393 (Humor Telemetry Enumeration & Emission)

**Applies to:** All telemetry tracking calls (`trackGameEventClient`, `trackGameEvent`, `trackGameEventStrict`, `trackEvent`)

**What it checks:**

- Detects inline usage of `DM.Humor.QuipShown` and `DM.Humor.QuipSuppressed` event names
- Enforces import and usage of constants from `GAME_EVENT_NAMES`
- Allows inline usage only in `telemetryEvents.ts` where the enum is defined

**Example violations:**

```typescript
// ❌ VIOLATION: inline humor event name
trackGameEvent('DM.Humor.QuipShown', {
    quipId: 'quip-123',
    actionType: 'move'
})

// ❌ VIOLATION: inline suppression event name
trackGameEvent('DM.Humor.QuipSuppressed', {
    suppressionReason: 'serious'
})
```

**Example compliance:**

```typescript
// ✅ CORRECT: Use constants from GAME_EVENT_NAMES
import { GAME_EVENT_NAMES } from '@piquet-h/shared'

trackGameEvent(GAME_EVENT_NAMES[108], {
    // DM.Humor.QuipShown
    quipId: 'quip-123',
    actionType: 'move'
})

trackGameEvent(GAME_EVENT_NAMES[109], {
    // DM.Humor.QuipSuppressed
    suppressionReason: 'serious'
})
```

---

## Adding New Rules

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
