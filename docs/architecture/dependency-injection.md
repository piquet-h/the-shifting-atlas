---
description: Consolidated dependency injection (InversifyJS) architecture patterns
---

# Dependency Injection Architecture (InversifyJS)

> Replaces deprecated `.github/instructions/inversify-di-patterns.md`. This is an architecture reference (not a generation instruction file). Keep focused on patterns & rationale; implementation details belong in code and tests.

## Goals

- Explicit lifecycle management (singleton infrastructure, transient business logic)
- Testability via interface contracts and isolated containers
- Avoid hidden coupling / circular dependencies

## Scope

Applies to backend Azure Functions code under `backend/src/` using DI for:

- Gremlin / Cosmos clients
- Telemetry client
- Repositories
- External API clients

## Core Patterns

### Container Initialization (Azure Functions v4)

Create once at app start and pass via `InvocationContext.extraInputs`.

```ts
import { Container } from 'inversify'
import { setupContainer } from '../../backend/src/inversify.config.js'

const container = new Container()

app.hook.appStart(async () => {
    await setupContainer(container)
})

app.hook.preInvocation((ctx) => {
    ctx.invocationContext.extraInputs.set('container', container)
})
```

### Interfaces & Tokens

This repo currently uses **string tokens**, centralized in `backend/src/di/tokens.ts` as `TOKENS`.
Keeping tokens in one place reduces drift/typos across container configs, health checks, and `@inject(...)` decorators.

```ts
import { TOKENS } from '../../backend/src/di/tokens.js'
```

### Binding Lifecycle

- Infrastructure (connections, telemetry): `.inSingletonScope()`
- Repositories / handlers: transient (default) unless pooling rationale exists

### Example Binding

```ts
container.bind<IGremlinClient>(TOKENS.GremlinClient).to(GremlinClient).inSingletonScope()
container.bind<ILocationRepository>(TOKENS.LocationRepository).to(CosmosLocationRepository) // transient
```

### Configuration Injection

Load & validate once, inject as constant value:

```ts
const config = await loadPersistenceConfigAsync()
container.bind<IPersistenceConfig>(TOKENS.PersistenceConfig).toConstantValue(config)
```

## Testing Patterns

### Test Container Factory

Use the shared test container setup in `backend/test/helpers/testInversify.config.ts`.

Provide overrides via fixture repositories rather than manual binding in individual tests.

```ts
import { Container } from 'inversify'
import { setupTestContainer } from '../../backend/test/helpers/testInversify.config.js'

const c = new Container()
await setupTestContainer(c, 'mock')
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
2. Add token to `TOKENS` (string identifiers)
3. Decorate with `@injectable()`
4. Replace manual instantiation with DI binding
5. Add test fake
6. Update tests to use container

## Checklist (Adding New Injectable)

- [ ] Interface defined
- [ ] Token added to `TOKENS`
- [ ] Class `@injectable()`
- [ ] Constructor uses `@inject` for deps
- [ ] Lifecycle scope explicit
- [ ] Test fake & container override
- [ ] No direct `process.env` (config validated centrally)

## Removal of Deprecated File

If any deprecated DI instruction doc remains, remove it once references are updated.

## References

- InversifyJS docs: https://inversify.io/
- Azure Functions Node v4: https://learn.microsoft.com/azure/azure-functions/functions-reference-node

---

_Last reviewed: 2025-10-29_
