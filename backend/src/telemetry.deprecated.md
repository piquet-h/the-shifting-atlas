# Deprecated: telemetry.ts

**Status**: DEPRECATED - Use `TelemetryService` instead

## Migration Guide

### Old Pattern (Deprecated)

```typescript
import { trackGameEvent, trackGameEventStrict } from '../telemetry.js'

// Standalone function call
trackGameEvent('Player.Get', { playerId: id })
```

### New Pattern (Preferred)

```typescript
import { TelemetryService } from '../telemetry/TelemetryService.js'
import { inject, injectable } from 'inversify'

@injectable()
export class MyRepository {
    constructor(@inject('TelemetryService') private telemetryService: TelemetryService) {}

    async myMethod() {
        this.telemetryService.trackGameEvent('Player.Get', { playerId: id })
    }
}
```

## Why Migrate?

1. **Proper Dependency Injection**: TelemetryService follows DI pattern, making testing easier
2. **ES Module Compatibility**: Removes `require()` calls that break in ES modules
3. **Better Encapsulation**: Enrichment logic is centralized in the service
4. **Type Safety**: Injectable interface provides better IntelliSense

## Migration Status

✅ **All migrations completed!**

- All repositories (Cosmos SQL, Cosmos Gremlin, Memory)
- All middleware (rateLimitMiddleware, validationMiddleware)
- All handlers extending BaseHandler
- **Utility modules now accept optional TelemetryService parameter:**
    - `telemetry/timing.ts` - `withTiming()` and `startTiming()` accept `telemetryService` in options
    - `secrets/secretsHelper.ts` - `getSecret()` and `clearSecretCache()` accept optional `telemetryService`

### Usage Examples for Utilities

**Timing with TelemetryService:**

```typescript
import { withTiming } from '../telemetry/timing.js'
import { inject, injectable } from 'inversify'
import type { TelemetryService } from '../telemetry/TelemetryService.js'

@injectable()
export class MyService {
    constructor(@inject('TelemetryService') private telemetryService: TelemetryService) {}

    async doWork() {
        const result = await withTiming(
            'MyOperation',
            async () => {
                // work here
                return data
            },
            { telemetryService: this.telemetryService, category: 'business-logic' }
        )
    }
}
```

**Secrets with TelemetryService:**

```typescript
import { getSecret } from '../secrets/secretsHelper.js'

const apiKey = await getSecret('model-provider-api-key', {
    telemetryService: this.telemetryService
})
```

Note: TelemetryService is **optional** in utility functions - if not provided, telemetry will be silently skipped.

## Constants Still Available

These remain exported from `TelemetryService.ts`:

- `CORRELATION_HEADER`
- `extractCorrelationId()`
- `extractPlayerGuid()`
- `GameTelemetryOptions` interface
