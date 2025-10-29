---
description: Deprecated DI patterns (migrating to docs/architecture/dependency-injection.md)
applyTo: 'backend/**'
---

# InversifyJS Dependency Injection Patterns

> DEPRECATION NOTICE: Migrate content to `docs/architecture/dependency-injection.md`. Remove this file after milestone M5. Do not expand further—only critical hotfix clarifications.

## Purpose

InversifyJS manages lifecycle and testing for infrastructure dependencies (Gremlin client, telemetry, repositories). This instruction defines required patterns based on proven autodomme implementation.

## When to Use DI

Use InversifyJS for:

-   ✅ Infrastructure clients (Gremlin, Cosmos SQL, Azure services)
-   ✅ Telemetry/observability
-   ✅ Repositories (data access layer)
-   ✅ External API clients
-   ✅ Any dependency that needs test doubles

Do NOT use for:

-   ❌ Pure domain models (Location, Player, Exit)
-   ❌ Utility functions (validators, formatters)
-   ❌ Constants and enums

## Core Principles

1. **Interface-Based Programming**: All injectable dependencies must have interface contracts
2. **Constructor Injection**: Dependencies injected via constructor with `@inject` decorator
3. **Explicit Lifecycle**: Declare `.inSingletonScope()` or transient explicitly
4. **Test Container Isolation**: Separate test containers with mock bindings
5. **Let DI Resolve**: Never call `new` or `container.get()` during container setup

## Container Lifecycle (Azure Functions)

```typescript
// backend/src/index.ts - ONE container for entire app
let _container: Container | undefined

app.hook.appStart(async () => {
    _container = await createProductionContainer()
})

app.hook.preInvocation((context: PreInvocationContext) => {
    if (!_container) throw new Error('Container not initialized')
    context.invocationContext.extraInputs.set('container', _container)
})
```

**Rules:**

-   Container created ONCE at app startup (not per request)
-   Passed via `context.extraInputs` (no global variable)
-   Async initialization supported for config loading

## Binding Patterns

### 1. Infrastructure Clients (Singleton)

```typescript
// Interface first
export interface IGremlinClient {
    submit<T = unknown>(query: string, bindings?: Record<string, unknown>): Promise<T[]>
}

// Implementation with @injectable
@injectable()
export class GremlinClient implements IGremlinClient {
    constructor(@inject(TYPES.GremlinConfig) private config: GremlinConfig) {}
    async submit<T>(query: string, bindings?: Record<string, unknown>): Promise<T[]> {
        // implementation
    }
}

// Binding - SINGLETON for connection pooling
container.bind<IGremlinClient>(TYPES.GremlinClient).to(GremlinClient).inSingletonScope()
```

**Rationale:** Reuse connections/sessions across requests.

### 2. Repositories (Transient)

```typescript
export interface ILocationRepository {
    get(id: string): Promise<Location | undefined>
    create(location: Location): Promise<void>
}

@injectable()
export class CosmosLocationRepository implements ILocationRepository {
    constructor(
        @inject(TYPES.GremlinClient) private client: IGremlinClient,
        @inject(TYPES.TelemetryClient) private telemetry: ITelemetryClient
    ) {}
}

// Binding - TRANSIENT for request isolation
container.bind<ILocationRepository>(TYPES.LocationRepository).to(CosmosLocationRepository) // Default is transient
```

**Rationale:** Avoid shared state between requests.

### 3. Configuration Objects

```typescript
// GOOD: Bind validated config
const config = await loadPersistenceConfigAsync()
container.bind<IPersistenceConfig>(TYPES.PersistenceConfig).toConstantValue(config)

// BAD: Direct process.env access
container.bind<string>('COSMOS_ENDPOINT').toConstantValue(process.env.COSMOS_ENDPOINT!)
```

**Rationale:** Validate once, inject everywhere.

### 4. External SDKs

```typescript
// GOOD: Let DI resolve wrapper
@injectable()
export class ApplicationInsightsTelemetry implements ITelemetryClient {
    private client: AppInsights.TelemetryClient
    constructor(@inject(TYPES.AppInsightsConfig) config: AppInsightsConfig) {
        this.client = new AppInsights.TelemetryClient(config.connectionString)
    }
}
container.bind<ITelemetryClient>(TYPES.TelemetryClient).to(ApplicationInsightsTelemetry).inSingletonScope()

// BAD: Manual instantiation during setup
const appInsightsClient = new AppInsights.TelemetryClient(process.env.CONNECTION_STRING)
container.bind(TYPES.TelemetryClient).toConstantValue(appInsightsClient)
```

**Exception:** When external SDK must be initialized before DI (e.g., Application Insights auto-collection), use `.toConstantValue()` but document why.

## Symbol Tokens (Required)

```typescript
// backend/src/di/types.ts
export const TYPES = {
    // Infrastructure
    GremlinClient: Symbol.for('IGremlinClient'),
    TelemetryClient: Symbol.for('ITelemetryClient'),
    PersistenceConfig: Symbol.for('IPersistenceConfig'),

    // Repositories
    LocationRepository: Symbol.for('ILocationRepository'),
    PlayerRepository: Symbol.for('IPlayerRepository'),
    ExitRepository: Symbol.for('IExitRepository')
}
```

**Why Symbols:**

-   Avoid naming collisions
-   Enable multiple implementations of same interface
-   Clear separation from concrete types

## Anti-Patterns (FORBIDDEN)

### ❌ Calling container.get() During Setup

```typescript
// WRONG
container.bind(TYPES.PavlokClient).toConstantValue(
    new PavlokClient(
        process.env.CLIENT_ID!,
        container.get(TYPES.TelemetryClient) // ❌ Creates order dependency!
    )
)

// RIGHT
@injectable()
class PavlokClient {
    constructor(@inject(TYPES.ClientId) clientId: string, @inject(TYPES.TelemetryClient) telemetry: ITelemetryClient) {}
}
container.bind(TYPES.PavlokClient).to(PavlokClient).inSingletonScope()
```

### ❌ Concrete Class Injection (No Interface)

```typescript
// WRONG
@injectable()
export class BlueskyHandler {
    constructor(@inject(BlueskyClient) private client: BlueskyClient) {} // ❌ Concrete class
}

// RIGHT
@injectable()
export class BlueskyHandler {
    constructor(@inject(TYPES.BlueskyClient) private client: IBlueskyClient) {} // ✅ Interface
}
```

### ❌ Manual Mocks Without Test Container

```typescript
// WRONG
test('should send message', async () => {
    const mockClient = { send: mock.fn() } as BlueskyClient // ❌ Type assertion hides issues
    const handler = new BlueskyHandler(mockClient, mockPersonality) // ❌ Manual instantiation
})

// RIGHT
test('should send message', async () => {
    const mockClient: IBlueskyClient = { send: mock.fn() } // ✅ Implements interface
    const container = createTestContainer({ blueskyClient: mockClient })
    const handler = container.get<BlueskyHandler>(TYPES.BlueskyHandler)
})
```

### ❌ Implicit Lifecycle Scope

```typescript
// WRONG - unclear if singleton or transient
container.bind(TYPES.TwitterClient).to(TwitterClient) // Defaults to transient

// RIGHT - explicit intent
container.bind(TYPES.TwitterClient).to(TwitterClient).inSingletonScope() // Connection pooling
container.bind(TYPES.TwitterHandler).to(TwitterHandler) // Transient (request isolation)
```

## Test Patterns

### Test Container Factory

```typescript
// backend/test/helpers/testContainer.ts
export interface TestBindings {
    gremlinClient?: IGremlinClient
    telemetryClient?: ITelemetryClient
    config?: IPersistenceConfig
}

export function createTestContainer(overrides: TestBindings = {}): Container {
    const container = new Container()

    // Default mocks
    const gremlinClient = overrides.gremlinClient || new FakeGremlinClient({})
    const telemetryClient = overrides.telemetryClient || createNoOpTelemetry()
    const config = overrides.config || { mode: 'memory' as const }

    container.bind<IGremlinClient>(TYPES.GremlinClient).toConstantValue(gremlinClient)
    container.bind<ITelemetryClient>(TYPES.TelemetryClient).toConstantValue(telemetryClient)
    container.bind<IPersistenceConfig>(TYPES.PersistenceConfig).toConstantValue(config)

    // Bind repositories (using memory mode or test doubles)
    container.bind<ILocationRepository>(TYPES.LocationRepository).to(InMemoryLocationRepository).inSingletonScope()

    return container
}
```

### Spy Telemetry for Assertions

```typescript
export function createSpyTelemetryClient(): ITelemetryClient & {
    events: Array<{ name: string; properties?: Record<string, unknown> }>
} {
    const events: Array<{ name: string; properties?: Record<string, unknown> }> = []
    return {
        events,
        trackEvent(args) {
            events.push(args)
        },
        trackException(args) {}
    }
}

// Usage
test('should track event', async () => {
    const telemetrySpy = createSpyTelemetryClient()
    const container = createTestContainer({ telemetryClient: telemetrySpy })
    const handler = container.get<MoveHandler>(TYPES.MoveHandler)

    await handler.move('player1', 'north')

    assert.equal(telemetrySpy.events.length, 1)
    assert.equal(telemetrySpy.events[0].name, 'Player.Move')
})
```

### Centralized Test Fakes

```typescript
// backend/test/fakes/FakeGremlinClient.ts
export class FakeGremlinClient implements IGremlinClient {
    constructor(private data: Record<string, unknown[]>) {}

    async submit<T>(query: string, bindings?: Record<string, unknown>): Promise<T[]> {
        // Simulate graph operations
        if (query.includes("outE('exit')")) {
            const locationId = bindings?.locationId as string
            return (this.data[locationId] || []) as T[]
        }
        return []
    }

    // Test helpers
    addLocation(id: string, data: unknown[]): void {
        this.data[id] = data
    }
}
```

**Rules:**

-   One fake per interface in `backend/test/fakes/`
-   Fake implements same interface as production
-   Provides test helpers (addLocation, reset, etc.)
-   Reused across all tests

## Function Handler Pattern

```typescript
// backend/src/functions/getExits.ts
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import type { Container } from 'inversify'
import { TYPES } from '../di/types.js'
import type { IExitRepository } from '../repos/exitRepository.js'

export async function getExits(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
    // Get container from context
    const container = ctx.extraInputs.get('container') as Container
    if (!container) {
        ctx.error('DI container not available')
        return { status: 500, body: 'Internal server error' }
    }

    // Resolve dependencies
    const repo = container.get<IExitRepository>(TYPES.ExitRepository)

    // Business logic
    const locationId = req.params.locationId
    const exits = await repo.getExits(locationId)

    return {
        status: 200,
        jsonBody: { exits }
    }
}

app.http('getExits', {
    methods: ['GET'],
    route: 'locations/{locationId}/exits',
    handler: getExits
})
```

**Rules:**

-   Check container availability with clear error
-   Resolve dependencies at function start
-   Keep handler focused on HTTP concerns
-   Let repository handle data access

## Validation Checklist

When adding new injectable class:

-   [ ] Interface defined (IMyService)
-   [ ] Class decorated with `@injectable()`
-   [ ] Constructor uses `@inject(TYPES.Something)`
-   [ ] Symbol token added to TYPES
-   [ ] Binding added to production container
-   [ ] Lifecycle scope declared explicitly
-   [ ] Test fake implements same interface
-   [ ] Test container can bind fake

## Migration Strategy

When refactoring existing code:

1. **Define interface** for the dependency
2. **Add Symbol token** to TYPES
3. **Add `@injectable()` decorator** to implementation
4. **Update constructor** to use `@inject(TYPES.X)`
5. **Update container binding** (remove manual instantiation)
6. **Create test fake** in `backend/test/fakes/`
7. **Update tests** to use test container
8. **Verify**: Run tests, check no manual `new` calls remain

## Performance Considerations

-   **Container initialization**: ~5-10ms (one-time at app start)
-   **Dependency resolution**: <1ms per request (negligible)
-   **Singleton scope**: Reuses instances (faster + connection pooling)
-   **Transient scope**: New instance per request (isolated but slight overhead)

**Default rule:** Singleton for infrastructure, transient for business logic.

## References

-   InversifyJS docs: https://inversify.io/
-   Autodomme implementation: `communication/api/src/inversify.config.ts` (proven pattern)
-   Test examples: `communication/api/test/blueskyHandler.test.ts`

## Questions & Edge Cases

**Q: When to use `.toConstantValue()` vs `.to(Class)`?**
A: Use `.toConstantValue()` only for:

-   Pre-initialized SDKs that require early setup (e.g., Application Insights auto-collection)
-   Primitive configuration values (validated objects)
-   Externally-created instances (rare)

Otherwise use `.to(Class)` to let DI manage lifecycle.

**Q: What if circular dependencies occur?**
A: Circular dependencies indicate design issue. Refactor by:

1. Extracting shared logic to separate service
2. Using events/callbacks instead of direct references
3. Reviewing responsibility boundaries

**Q: How to inject optional dependencies?**
A: Use `@optional()` decorator:

```typescript
constructor(
    @inject(TYPES.Required) required: IRequired,
    @inject(TYPES.Optional) @optional() optional?: IOptional
) {}
```

**Q: Multiple implementations of same interface?**
A: Use named bindings:

```typescript
container.bind<ILogger>(TYPES.Logger).to(ConsoleLogger).whenTargetNamed('console')
container.bind<ILogger>(TYPES.Logger).to(FileLogger).whenTargetNamed('file')

// Inject
constructor(@inject(TYPES.Logger) @named('console') logger: ILogger) {}
```

_Last reviewed: 2025-10-29_
