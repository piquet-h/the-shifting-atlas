---
description: Consolidated dependency injection (InversifyJS) architecture patterns
---

# Dependency Injection Architecture (InversifyJS)

> Replaces deprecated `.github/instructions/inversify-di-patterns.md`. This is an architecture reference (not a generation instruction file). Keep focused on patterns & rationale; implementation details belong in code and tests.

## Goals

-   Explicit lifecycle management (singleton infrastructure, transient business logic)
-   Testability via interface contracts and isolated containers
-   Avoid hidden coupling / circular dependencies

## Scope

Applies to backend Azure Functions code under `backend/src/` using DI for:

-   Gremlin / Cosmos clients
-   Telemetry client
-   Repositories
-   External API clients

## Core Patterns

### Container Initialization (Azure Functions v4)

Create once at app start and pass via `InvocationContext.extraInputs`.

```ts
let _container: Container | undefined

app.hook.appStart(async () => {
    _container = await createProductionContainer()
})

app.hook.preInvocation((ctx) => {
    if (!_container) throw new Error('Container not initialized')
    ctx.invocationContext.extraInputs.set('container', _container)
})
```

### Interfaces & Tokens

Use symbol tokens to avoid collisions:

```ts
export const TYPES = {
    GremlinClient: Symbol.for('IGremlinClient'),
    TelemetryClient: Symbol.for('ITelemetryClient'),
    LocationRepository: Symbol.for('ILocationRepository'),
    PlayerRepository: Symbol.for('IPlayerRepository')
}
```

### Binding Lifecycle

-   Infrastructure (connections, telemetry): `.inSingletonScope()`
-   Repositories / handlers: transient (default) unless pooling rationale exists

### Example Binding

```ts
container.bind<IGremlinClient>(TYPES.GremlinClient).to(GremlinClient).inSingletonScope()
container.bind<ILocationRepository>(TYPES.LocationRepository).to(CosmosLocationRepository) // transient
```

### Configuration Injection

Load & validate once, inject as constant value:

```ts
const config = await loadPersistenceConfigAsync()
container.bind<IPersistenceConfig>(TYPES.PersistenceConfig).toConstantValue(config)
```

## Testing Patterns

### Test Container Factory

Provide overrides for fakes/spies:

```ts
export function createTestContainer(overrides: Partial<TestBindings> = {}): Container {
    const c = new Container()
    c.bind(TYPES.GremlinClient).toConstantValue(overrides.gremlinClient || new FakeGremlinClient({}))
    c.bind(TYPES.TelemetryClient).toConstantValue(overrides.telemetryClient || createNoOpTelemetry())
    return c
}
```

### Telemetry Spy

Capture events for assertions without external calls.

## Anti-Patterns (Avoid)

| Pattern                             | Issue                    | Fix                        |
| ----------------------------------- | ------------------------ | -------------------------- |
| `container.get()` during binding    | Order dependency         | Use constructor injection  |
| Concrete class injection            | Tight coupling           | Inject interface token     |
| Manual new in handler without DI    | Hard to mock             | Resolve via container      |
| Hidden singleton state in transient | Leaks cross-request data | Explicit scope declaration |

## Migration Steps (Legacy Code)

1. Define interface
2. Add symbol token
3. Decorate with `@injectable()`
4. Replace manual instantiation with DI binding
5. Add test fake
6. Update tests to use container

## Checklist (Adding New Injectable)

-   [ ] Interface defined
-   [ ] Token added to `TYPES`
-   [ ] Class `@injectable()`
-   [ ] Constructor uses `@inject` for deps
-   [ ] Lifecycle scope explicit
-   [ ] Test fake & container override
-   [ ] No direct `process.env` (config validated centrally)

## Removal of Deprecated File

Once this doc is merged and referenced by other docs, delete `inversify-di-patterns.md` after milestone M5.

## References

-   InversifyJS docs: https://inversify.io/
-   Azure Functions Node v4: https://learn.microsoft.com/azure/azure-functions/functions-reference-node

---

_Last reviewed: 2025-10-29_
