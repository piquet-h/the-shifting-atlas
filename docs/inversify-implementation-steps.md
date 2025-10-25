# InversifyJS Implementation Steps

## Overview

This guide provides step-by-step instructions to integrate InversifyJS into The Shifting Atlas backend, based on proven patterns from the autodomme project.

## Prerequisites

-   Node.js 20.x
-   TypeScript 5.x
-   Existing backend with Azure Functions
-   Understanding of dependency injection concepts

## Phase 1: Infrastructure Setup (Non-Breaking)

### Step 1.1: Install Dependencies

```bash
cd backend
npm install inversify reflect-metadata
npm install --save-dev @types/node
```

### Step 1.2: Update TypeScript Configuration

```bash
# Edit backend/tsconfig.json
```

Add to `compilerOptions`:

```json
{
    "compilerOptions": {
        "experimentalDecorators": true,
        "emitDecoratorMetadata": true
    }
}
```

### Step 1.3: No Separate Types File Needed

**Note:** We use embedded string identifiers instead of Symbol tokens. This keeps bindings simple and avoids the need for a separate `types.ts` file.

### Step 1.4: Keep Interfaces Close to Implementations

**Principle:** Interfaces should live alongside their implementations until there's a clear need to extract them. Use existing interfaces where they already exist (e.g., `IGremlinClient` in `gremlinClient.ts`).

**Do NOT create** a separate `di/interfaces.ts` file. Instead:

-   `IGremlinClient` stays in `backend/src/gremlin/gremlinClient.ts`
-   `IPlayerRepository` stays in `backend/src/repos/playerRepository.ts` (or use existing from `@piquet-h/shared`)
-   `ILocationRepository` stays in `backend/src/repos/locationRepository.ts`

### Step 1.5: Update Gremlin Client to Implement Interface

### Step 1.5: Update Gremlin Client to Implement Interface

Edit `backend/src/gremlin/gremlinClient.ts`:

```typescript
import 'reflect-metadata'
import { injectable, inject } from 'inversify'

// Keep existing GremlinClientConfig and IGremlinClient interface here
export interface GremlinClientConfig {
    endpoint: string
    database: string
    graph: string
}

export interface IGremlinClient {
    submit<T = unknown>(query: string, bindings?: Record<string, unknown>): Promise<T[]>
}

// Add @injectable decorator
@injectable()
export class GremlinClient implements IGremlinClient {
    private connection: DriverRemoteConnectionLike | undefined

    constructor(@inject('GremlinConfig') private config: GremlinClientConfig) {}

    async submit<T = unknown>(query: string, bindings?: Record<string, unknown>): Promise<T[]> {
        if (!this.connection) {
            await this.initialize()
        }
        const raw = await this.connection!._client.submit<T>(query, bindings)
        return raw._items
    }

    private async initialize(): Promise<void> {
        // Move initialization logic from createGremlinClient here
        const gremlin = await import('gremlin')
        // ... existing setup code
        this.connection = new DriverRemoteConnection(wsEndpoint, {
            authenticator,
            traversalsource: 'g',
            mimeType: 'application/vnd.gremlin-v2.0+json'
        })
    }
}

// Keep factory for backward compatibility during migration
export async function createGremlinClient(config: GremlinClientConfig): Promise<IGremlinClient> {
    const client = new GremlinClient(config)
    await client.submit('g.V().limit(0)') // Force initialization
    return client
}
```

### Step 1.6: Container Setup in src/index.ts

**Important:** The DI container initialization belongs in `backend/src/index.ts`, registered via the app startup hook. This ensures the container is ONLY created when the Function App starts, avoiding test contamination.

Edit or create `backend/src/index.ts`:

```typescript
import 'reflect-metadata'
import { app, type PreInvocationContext } from '@azure/functions'
import type { Container } from 'inversify'
import { setupContainer } from './inversify.config.js'

let _container: Container | undefined

app.hook.appStart(async () => {
    console.log('Initializing DI container...')
    const startTime = Date.now()

    const { Container } = await import('inversify')
    _container = new Container()
    await setupContainer(_container)

    const duration = Date.now() - startTime
    console.log(`DI container initialized in ${duration}ms`)
})

app.hook.preInvocation((context: PreInvocationContext) => {
    if (!_container) {
        throw new Error('DI container not initialized')
    }
    context.invocationContext.extraInputs.set('container', _container)
})

// Import all function handlers here so they register their routes
import './functions/getExits.js'
import './functions/playerGet.js'
// ... etc
```

### Step 1.7: Create Container Configuration

Create `backend/src/inversify.config.ts`:

```typescript
import appInsights from 'applicationinsights'
import { Container } from 'inversify'
import 'reflect-metadata'
import { GremlinClient, type GremlinClientConfig, type IGremlinClient } from './gremlin/gremlinClient.js'
import { type IPersistenceConfig, loadPersistenceConfigAsync } from './persistenceConfig.js'
import { ExitRepository } from './repos/exitRepository.js'

export const setupContainer = async (container: Container) => {
    // Bind telemetry client
    container.bind<appInsights.TelemetryClient>('TelemetryClient').toConstantValue(appInsights.defaultClient)

    // Load and bind configuration
    const config = await loadPersistenceConfigAsync()
    container.bind<IPersistenceConfig>('PersistenceConfig').toConstantValue(config)

    // Bind Gremlin client (singleton for connection pooling)
    if (config.mode === 'cosmos') {
        container.bind<GremlinClientConfig>('GremlinConfig').toConstantValue({
            endpoint: process.env.GREMLIN_ENDPOINT || '',
            database: process.env.GREMLIN_DATABASE || '',
            graph: process.env.GREMLIN_GRAPH || ''
        })
        container.bind<IGremlinClient>('GremlinClient').to(GremlinClient).inSingletonScope()

        // Bind repositories that need Gremlin
        container.bind(ExitRepository).toSelf()
    }

    return container
}
```

**Note:** Use string identifiers like `'GremlinClient'`, `'PersistenceConfig'` instead of Symbol tokens.

````typescript
import 'reflect-metadata'
import { Container } from 'inversify'
import { TYPES } from './types.js'
import type { IGremlinClient, ITelemetryClient, IPersistenceConfig } from './interfaces.js'
import { GremlinClient, type GremlinClientConfig } from '../gremlin/gremlinClient.js'
import { loadPersistenceConfigAsync } from '../persistenceConfig.js'
import { telemetryClient } from '../telemetry.js'
import { CosmosLocationRepository } from '../repos/locationRepository.cosmos.js'
import { InMemoryLocationRepository } from '../repos/locationRepository.js'
import { ExitRepository } from '../repos/exitRepository.js'

/**
 * Create and configure production dependency injection container.
 * Called once at app startup, reused across all function invocations.
 */
export async function createProductionContainer(): Promise<Container> {
    const container = new Container()

    // Load and bind configuration
    const config = await loadPersistenceConfigAsync()
    container.bind<IPersistenceConfig>(TYPES.PersistenceConfig).toConstantValue(config)

    // Bind Gremlin client (singleton - connection pooling)
    if (config.mode === 'cosmos' && config.cosmos) {
        container.bind<GremlinClientConfig>('GremlinConfig').toConstantValue(config.cosmos)
        container.bind<IGremlinClient>(TYPES.GremlinClient).to(GremlinClient).inSingletonScope()
    }

    // Bind telemetry (singleton)
    container.bind<ITelemetryClient>(TYPES.TelemetryClient).toConstantValue(telemetryClient)

    // Bind repositories based on persistence mode
    if (config.mode === 'cosmos') {
        // Repositories get Gremlin client injected automatically
        container.bind(TYPES.LocationRepository).to(CosmosLocationRepository)
        container.bind(TYPES.ExitRepository).to(ExitRepository)
    } else {
        // Memory mode
        container.bind(TYPES.LocationRepository).to(InMemoryLocationRepository).inSingletonScope()
    }

    return container
}
**Note:** Use string identifiers like `'GremlinClient'`, `'PersistenceConfig'` instead of Symbol tokens.

### Step 1.8: Create Test Container Setup

**Important:** Test container creation belongs in the test folder as a fixture setup utility.

Create `backend/test/fixtures/testContainer.ts`:

```typescript
import 'reflect-metadata'
import { Container } from 'inversify'
import type { IGremlinClient } from '../../src/gremlin/gremlinClient.js'
import type { IPersistenceConfig } from '../../src/persistenceConfig.js'

export interface TestContainerOptions {
    gremlinClient?: IGremlinClient
    config?: IPersistenceConfig
}

/**
 * Create test container with mock implementations.
 * Use in tests instead of production container to avoid side effects.
 */
export function createTestContainer(options: TestContainerOptions = {}): Container {
    const container = new Container()

    // Default test config (memory mode)
    const config: IPersistenceConfig = options.config || { mode: 'memory' }
    container.bind<IPersistenceConfig>('PersistenceConfig').toConstantValue(config)

    // Gremlin client: Use provided fake or no-op
    const gremlinClient = options.gremlinClient || createNoOpGremlinClient()
    container.bind<IGremlinClient>('GremlinClient').toConstantValue(gremlinClient)

    return container
}

function createNoOpGremlinClient(): IGremlinClient {
    return {
        async submit<T>(): Promise<T[]> {
            return []
        }
    }
}
````

### Step 1.9: Create Test Fakes Directory

```bash
cd backend/test
mkdir -p fakes
touch fakes/FakeGremlinClient.ts
```

### Step 1.9: Create Test Fakes Directory

```bash
cd backend/test
mkdir -p fakes
touch fakes/FakeGremlinClient.ts
```

Create `backend/test/fakes/FakeGremlinClient.ts`:

```typescript
import type { IGremlinClient } from '../../src/gremlin/gremlinClient.js'

type ExitData = { direction: string; toLocationId: string; description?: string; kind?: string; state?: string }

/**
 * In-memory fake Gremlin client for testing.
 */
export class FakeGremlinClient implements IGremlinClient {
    constructor(private exits: Record<string, ExitData[]> = {}) {}

    async submit<T>(query: string, bindings?: Record<string, unknown>): Promise<T[]> {
        const locationId = bindings?.locationId as string

        if (query.includes("outE('exit')")) {
            const exits = this.exits[locationId] || []
            return exits.map((e) => ({
                direction: e.direction,
                toLocationId: e.toLocationId,
                description: e.description,
                kind: e.kind,
                state: e.state
            })) as unknown as T[]
        }

        return []
    }

    // Test helper
    addExits(locationId: string, exits: ExitData[]): void {
        this.exits[locationId] = exits
    }
}
```

### Step 1.10: Verify Setup

```bash
cd backend
npm run build
```

### Step 1.10: Verify Setup

```bash
cd backend
npm run build
```

Should compile without errors. Container not yet integrated into functions.

---

## Phase 2: Repository Migration (One at a Time)

### Step 2.1: Update ExitRepository (Example)

Edit `backend/src/repos/exitRepository.ts`:

```typescript
import { injectable, inject } from 'inversify'
import type { IGremlinClient } from '../gremlin/gremlinClient.js'
import type { Direction } from '@piquet-h/shared'

export interface Exit {
    direction: Direction
    toLocationId: string
    description?: string
}

export interface IExitRepository {
    getExits(locationId: string): Promise<Exit[]>
}

@injectable()
export class ExitRepository implements IExitRepository {
    constructor(@inject('GremlinClient') private client: IGremlinClient) {}

    async getExits(locationId: string): Promise<Exit[]> {
        const exits = await this.client.submit<Exit>(
            "g.V(locationId).outE('exit').project('direction','toLocationId','description')" +
                ".by(values('direction')).by(inV().id()).by(coalesce(values('description'), constant('')))",
            { locationId }
        )
        return exits
    }
}
```

**Note:** The `IExitRepository` interface stays in this file, close to its implementation.

Update `backend/src/inversify.config.ts` container binding:

```typescript
// In setupContainer():
if (config.mode === 'cosmos') {
    // ... existing bindings
    container.bind(ExitRepository).toSelf()
}
```

### Step 2.2: Update One Function Handler

Edit `backend/src/functions/getExits.ts`:

```typescript
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import type { Container } from 'inversify'
import type { IExitRepository } from '../repos/exitRepository.js'
import { ExitRepository } from '../repos/exitRepository.js'

export async function getExits(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
    // Get container from context
    const container = ctx.extraInputs.get('container') as Container
    if (!container) {
        ctx.error('DI container not available')
        return { status: 500, body: 'Internal server error' }
    }

    try {
        const repo = container.get<IExitRepository>(ExitRepository)
        const locationId = req.params.locationId

        if (!locationId) {
            return { status: 400, body: 'Missing locationId' }
        }

        const exits = await repo.getExits(locationId)

        return {
            status: 200,
            jsonBody: { exits }
        }
    } catch (error) {
        ctx.error('Error getting exits:', error)
        return { status: 500, body: 'Failed to get exits' }
    }
}

app.http('getExits', {
    methods: ['GET'],
    route: 'locations/{locationId}/exits',
    handler: getExits
})
```

**Note:** Use the class directly as the service identifier instead of a Symbol.

### Step 2.3: Container Already Initialized in App Startup

The container is already set up in `backend/src/index.ts` from Step 1.6, so no additional work needed here.

### Step 2.4: Update Test for ExitRepository

Edit `backend/test/unit/exitRepository.test.ts` (moved from integration tests since it uses fully mocked dependencies):

```typescript
import { Direction } from '@piquet-h/shared'
import assert from 'node:assert'
import { test } from 'node:test'
import { createTestContainer } from './fixtures/testContainer.js'
import { FakeGremlinClient } from './fakes/FakeGremlinClient.js'
import { ExitRepository, type IExitRepository } from '../src/repos/exitRepository.js'

test('should get exits for location', async () => {
    // Setup: Create container with fake data
    const fakeClient = new FakeGremlinClient({
        loc1: [
            { direction: 'north', toLocationId: 'loc2' },
            { direction: 'south', toLocationId: 'loc3' }
        ]
    })
    const container = createTestContainer({ gremlinClient: fakeClient })

    // Bind the repository in the test container
    container.bind(ExitRepository).toSelf()

    // Get repository from container
    const repo = container.get<IExitRepository>(ExitRepository)
    const exits = await repo.getExits('loc1')

    // Assert
    assert.equal(exits.length, 2)
    assert.equal(exits[0].direction, 'north')
    assert.equal(exits[0].toLocationId, 'loc2')
})
```

**Note:** Since ExitRepository tests use only mocked `IGremlinClient` with no real persistence, they belong in `test/unit/` rather than `test/integration/`.

### Step 2.5: Test the Migration

```bash
cd backend
npm run build
npm run test:unit  # Unit tests run faster and don't require configuration
```

Should pass. If successful, proceed to next repository.

---

## Phase 3: Complete Migration

### Step 3.1: Migrate LocationRepository

Follow same pattern as ExitRepository:

1. Add `@injectable()` decorator to `CosmosLocationRepository`
2. Update constructor to inject `'GremlinClient'` (string identifier)
3. Keep `ILocationRepository` interface in the same file
4. Update `inversify.config.ts` container bindings
5. Update tests to use `createTestContainer` from `test/fixtures/testContainer.ts`

### Step 3.2: Migrate PlayerRepository

Same process as LocationRepository. Use existing `IPlayerRepository` interface if it exists in `@piquet-h/shared/types/playerRepository`.

### Step 3.3: Update All Function Handlers

For each function in `backend/src/functions/`:

1. Get container from `ctx.extraInputs`
2. Resolve dependencies with `container.get(RepositoryClass)` using the class as identifier
3. Remove manual instantiation code

### Step 3.4: Update Telemetry Integration (Optional)

If you want telemetry tracked via DI, you can bind it:

```typescript
// In backend/src/inversify.config.ts
import { telemetryClient } from './telemetry.js'

export const setupContainer = async (container: Container) => {
    // Bind telemetry client as constant value
    container.bind('TelemetryClient').toConstantValue(telemetryClient)

    // ... rest of setup
}
```

But since telemetry is typically used as a global singleton, direct import is often simpler.

---

## Phase 4: Cleanup

### Step 4.1: Remove Singleton Patterns

Search for and remove:

-   `let singleton: Repository | undefined` patterns
-   `getLocationRepo()` factory functions
-   Module-level caching

Replace with container resolution.

### Step 4.2: Remove Duplicate Fakes

Delete inline `FakeGremlinClient` definitions from test files. Use centralized version in `backend/test/fakes/`.

### Step 4.3: Update Documentation

Update `backend/README.md` with:

-   DI container usage (initialized in `src/index.ts` via app startup hook)
-   How to add new injectable classes (use `@injectable()` decorator, inject with string identifiers)
-   Test patterns with `createTestContainer` from `test/fixtures/testContainer.ts`
-   Keep interfaces close to implementations until extraction is needed

---

## Key Architecture Decisions

### 1. No Separate Types File

-   **Rationale:** Embedded string identifiers are simpler and easier to maintain at this scale
-   **Pattern:** Use class constructors as identifiers: `container.get(ExitRepository)`
-   **For primitives:** Use descriptive strings: `@inject('GremlinConfig')`

### 2. Interfaces Stay Close to Implementations

-   **Rationale:** Premature abstraction adds complexity without clear benefit
-   **Pattern:** Define `IExitRepository` in `exitRepository.ts`, not in a separate `interfaces.ts`
-   **Exception:** Use existing shared interfaces (e.g., `IPlayerRepository` from `@piquet-h/shared`) when available

### 3. Test Container in Test Folder

-   **Location:** `backend/test/fixtures/testContainer.ts`
-   **Rationale:** Test utilities belong with tests, not in src
-   **Pattern:** Import `createTestContainer` in tests, bind repositories as needed per test

### 4. Container Registration in App Startup

-   **Location:** `backend/src/index.ts` using `app.hook.appStart()`
-   **Rationale:** Container only created when Function App starts, avoiding test contamination
-   **Pattern:** Configuration in `inversify.config.ts`, initialization in `index.ts`

---

## Verification Checklist

After implementation:

-   [ ] `npm run build` succeeds
-   [ ] `npm test` all tests pass
-   [ ] `npm run lint` clean
-   [ ] Functions start locally (`npm run dev`)
-   [ ] Test one function end-to-end
-   [ ] Container initialization logged on startup
-   [ ] No manual `new Repository()` calls in functions
-   [ ] Test fakes centralized in `test/fakes/`
-   [ ] All repositories use `@injectable()` decorator

---

## Troubleshooting

### "No matching bindings found for serviceIdentifier: GremlinClient"

**Cause:** Service not bound in container.

**Fix:** Check `inversify.config.ts` has binding:

```typescript
container.bind<IGremlinClient>('GremlinClient').to(GremlinClient).inSingletonScope()
```

Or use the class as identifier:

```typescript
container.bind(ExitRepository).toSelf()
```

### "Missing required @injectable annotation"

**Cause:** Class uses `@inject` but missing `@injectable()` decorator.

**Fix:** Add to class:

```typescript
@injectable()
export class MyClass {}
```

### "Circular dependency detected"

**Cause:** Two classes depend on each other.

**Fix:** Refactor to break cycle (extract shared logic, use events, review boundaries).

### Tests fail with "container.get is not a function"

**Cause:** Test not using container or wrong container type.

**Fix:** Use `createTestContainer()` from test fixtures:

```typescript
import { createTestContainer } from './fixtures/testContainer.js'

const container = createTestContainer()
container.bind(ExitRepository).toSelf()
const repo = container.get(ExitRepository)
```

### "Container not initialized" error in tests

**Cause:** Production app startup hook running in test environment.

**Fix:** The container in `src/index.ts` should NOT be imported in tests. Tests should use `createTestContainer()` from `test/fixtures/testContainer.ts` instead.

---

## Performance Benchmarks

Expected timings:

-   Container initialization: 5-10ms
-   Dependency resolution: <1ms
-   Test execution: No measurable difference

Monitor with telemetry tracking in app startup hook.

---

## Next Steps After Completion

1. Update `.github/copilot-instructions.md` to reference DI patterns
2. Add examples to onboarding docs
3. Create PR template checklist for new dependencies
4. Consider adding container validation on startup
5. Document common patterns in team wiki

---

## Getting Help

If issues arise:

-   Review autodomme implementation: `communication/api/src/inversify.config.ts`
-   Check InversifyJS docs: https://inversify.io/
-   Refer to `.github/instructions/inversify-di-patterns.md`
-   Ask in team chat with error messages and context
