# Handlers

## Architecture: Handlers vs Functions

This folder contains **handler logic** for HTTP and queue endpoints. Handler classes implement business logic, validation, and orchestration, but do NOT register Azure Functions routes.

### Separation Pattern

**handlers/** (this folder):

- Business logic for HTTP/queue endpoints
- Export handler classes (injectable via DI) and handler functions
- Import Azure types only (`import type { HttpRequest, ... } from '@azure/functions'`)
- **DO NOT call `app.http()` or register routes**
- Safe to import in unit tests without triggering Azure Functions runtime

**functions/** (sibling folder):

- Azure Functions route registration only
- Call `app.http()` / `app.timer()` / `app.serviceBusQueue()` to bind routes to handlers
- Import handlers and wire them to Azure runtime
- Not imported by tests (avoids app initialization overhead and side effects)

### Why Separate?

**Testing Isolation:** Tests import from `handlers/` to test business logic without triggering Azure Functions runtime initialization. The `app.http()` registration in `functions/` has side effects (route registration, middleware setup, environment loading) that are unnecessary and slow in unit tests.

**Clear Boundaries:**

- `handlers/` = domain logic (what to do)
- `functions/` = infrastructure bindings (how to expose it)

### Example Pattern

```typescript
// handlers/gremlinHealth.ts
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { injectable } from 'inversify'

@injectable()
export class GremlinHealthHandler extends BaseHandler {
    protected async execute(): Promise<HttpResponseInit> {
        // Business logic here
    }
}

export async function gremlinHealth(req: HttpRequest, ctx: InvocationContext) {
    const container = ctx.extraInputs.get('container')
    const handler = container.get(GremlinHealthHandler)
    return handler.handle(req, ctx)
}
// ✅ NO app.http() call here
```

```typescript
// functions/gremlinHealth.ts
import { app } from '@azure/functions' // ← Runtime import
import { gremlinHealth } from '../handlers/gremlinHealth.js'

app.http('HttpGremlinHealth', {
    // ← Route registration
    route: 'backend/health/gremlin',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: gremlinHealth
})
```

```typescript
// test/unit/gremlinHealth.test.ts
import { gremlinHealth } from '../../src/handlers/gremlinHealth.js'
// ✅ Imports handler directly, no app.http() side effects

test('should return health status', async () => {
    const response = await gremlinHealth(mockReq, mockCtx)
    // Test business logic
})
```

### Handler Organization

Handlers are currently flat in this directory. When the count exceeds ~20 handlers, consider grouping by domain aggregate:

```
handlers/
  player/
    playerCreate.ts
    playerMove.ts
    playerGet.ts
  location/
    locationLook.ts
    linkRooms.ts
  health/
    health.ts
    gremlinHealth.ts
```

### Related Documentation

- Test fixture guide: `../test/TEST_FIXTURE_GUIDE.md`
- Service layer: `../services/README.md`
