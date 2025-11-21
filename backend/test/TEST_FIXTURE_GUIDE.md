````markdown
# Test Fixture Guide

## Architecture: Dependency Injection for Tests

**Why:** Tests use the same Inversify DI patterns as production code. This ensures tests are realistic and changes to interfaces automatically propagate to tests.

**Key files:**

- `test/helpers/testInversify.config.ts` - Test-specific Inversify setup (imports mocks from test folder)
- `test/mocks/` - All mock implementations (moved out of src to keep production code clean)
- Production `src/inversify.config.ts` remains unchanged

**Container modes:**

- `'mock'` - All dependencies mocked (unit tests)
- `'memory'` - In-memory repositories, mocked telemetry (integration tests)
- `'cosmos'` - Real Cosmos DB (E2E tests)

## Testing Philosophy: Three-Tier Approach

The Shifting Atlas uses a three-tier testing strategy with clear boundaries:

**Unit Tests (`test/unit/`):**

- Test pure logic functions and interface contracts
- Use `UnitTestFixture` with all dependencies mocked
- Never instantiate real repository implementations
- Never manipulate `PERSISTENCE_MODE` environment variable
- Mock telemetry via DI (no real Application Insights)

**Integration Tests (`test/integration/`):**

- Test repository implementations against both memory and Cosmos DB
- Use `IntegrationTestFixture` with `describeForBothModes()`
- Get repositories from DI container (never instantiate directly)
- Mock telemetry, Key Vault, and other external dependencies
- Test actual data persistence and retrieval behavior

**E2E Tests (`test/e2e/`):**

- Test full system behavior with real Cosmos DB only
- Use `E2ETestFixture` for world seeding and performance tracking
- Validate production-readiness and performance targets
- Run post-merge only (not on PRs for cost optimization)

**Key Principle:** All test layers mock Application Insights, Key Vault, and external dependencies. Only Cosmos DB is tested with real infrastructure (integration/E2E layers only).

## Decision Matrix: Which Fixture, Which Directory?

| What You're Testing                                              | Fixture                  | Directory           | Persistence      | Mocks               |
| ---------------------------------------------------------------- | ------------------------ | ------------------- | ---------------- | ------------------- |
| Pure logic functions (e.g., `sortExits`, `getOppositeDirection`) | `UnitTestFixture`        | `test/unit/`        | None             | All dependencies    |
| Interface contracts (method signatures, return types)            | `UnitTestFixture`        | `test/unit/`        | None             | All dependencies    |
| Repository implementation behavior                               | `IntegrationTestFixture` | `test/integration/` | Memory or Cosmos | Telemetry, KeyVault |
| Azure Function handlers                                          | `IntegrationTestFixture` | `test/integration/` | Memory or Cosmos | Telemetry, KeyVault |
| Cross-repository workflows                                       | `IntegrationTestFixture` | `test/integration/` | Memory or Cosmos | Telemetry, KeyVault |
| Full system with world seeding                                   | `E2ETestFixture`         | `test/e2e/`         | Cosmos only      | Telemetry, KeyVault |
| Performance benchmarks                                           | `E2ETestFixture`         | `test/e2e/`         | Cosmos only      | Telemetry, KeyVault |

**Decision shortcuts:**

- Testing a function that doesn't touch storage? → Unit test
- Testing repository methods? → Integration test with `describeForBothModes()`
- Testing handler logic? → Integration test (handlers use repositories)
- Validating production performance? → E2E test

## Anti-Patterns to Avoid

### ❌ Don't Instantiate Repository Implementations in Unit Tests

**Wrong:**

```typescript
// Unit test - DON'T DO THIS
test('location repository returns data', async () => {
    const repo = new InMemoryLocationRepository() // ❌ Direct instantiation
    const location = await repo.get('test-id')
    assert.ok(location)
})
```

**Right:**

```typescript
// Integration test - use fixture
test('location repository returns data', async () => {
    const repo = await fixture.getLocationRepository() // ✅ From DI
    const location = await repo.get('test-id')
    assert.ok(location)
})
```

### ❌ Don't Manipulate PERSISTENCE_MODE in Unit Tests

**Wrong:**

```typescript
// Unit test - DON'T DO THIS
test('handler works in cosmos mode', async () => {
    process.env.PERSISTENCE_MODE = 'cosmos' // ❌ Environment manipulation
    const fixture = new UnitTestFixture()
    await fixture.setup()
    // ... test code
})
```

**Right:**

```typescript
// Handler should use dependency injection
class MyHandler {
    constructor(
        @inject('PersistenceConfig') private config: IPersistenceConfig // ✅ DI
    ) {}

    protected async execute() {
        const mode = this.config.mode // ✅ Use injected config
    }
}

// Unit test is now simple
test('handler works', async () => {
    const fixture = new UnitTestFixture() // ✅ No env manipulation
    await fixture.setup()
    // Handler respects mocked config from fixture
})
```

### ❌ Don't Create Fake Gremlin Clients in Tests

**Wrong:**

```typescript
// DON'T DO THIS
class FakeGremlinClient implements IGremlinClient {
    async submit<T>(query: string): Promise<T[]> {
        // ... fake implementation
    }
}

test('cosmos repository works', async () => {
    const fakeClient = new FakeGremlinClient() // ❌ Manual fake
    const repo = new CosmosLocationRepository(fakeClient)
    // ... test code
})
```

**Right:**

```typescript
// Integration test - use real implementations via DI
test('cosmos repository works', async () => {
    const repo = await fixture.getLocationRepository() // ✅ From DI
    // Memory mode: InMemoryLocationRepository
    // Cosmos mode: CosmosLocationRepository with real client
})
```

### ❌ Don't Call setupTestContainer Directly

**Wrong:**

```typescript
// DON'T DO THIS
test('my test', async () => {
    const container = await setupTestContainer('memory') // ❌ Direct call
    const repo = container.get<ILocationRepository>('ILocationRepository')
    // ... test code
})
```

**Right:**

```typescript
// Use fixture
beforeEach(async () => {
    fixture = new IntegrationTestFixture('memory') // ✅ Fixture handles it
    await fixture.setup()
})

test('my test', async () => {
    const repo = await fixture.getLocationRepository() // ✅ Via fixture
})
```

### ❌ Don't Mix Test Concerns

**Wrong:**

```typescript
// Unit test file with integration test
describe('sortExits logic', () => {
    test('sorts directions correctly', () => {
        // ✅ Pure logic - belongs here
    })

    test('repository returns sorted exits', async () => {
        const repo = await fixture.getLocationRepository() // ❌ Integration test in unit file
    })
})
```

**Right:**

```typescript
// test/unit/exitRepository.test.ts - pure logic only
describe('sortExits', () => {
    test('sorts directions correctly', () => {
        const sorted = sortExits(exits) // ✅ Pure logic
    })
})

// test/integration/exitRepository.test.ts - repository behavior
describeForBothModes('Exit Repository', (mode) => {
    test('repository returns sorted exits', async () => {
        const repo = await fixture.getExitRepository() // ✅ Repository test
    })
})
```

## Test Migration Checklist

When moving tests from unit to integration (or identifying misplaced tests):

### Step 1: Identify Test Type

- [ ] Does it test pure logic with no dependencies? → Keep in unit
- [ ] Does it instantiate repository implementations? → Move to integration
- [ ] Does it use fake Gremlin clients? → Move to integration
- [ ] Does it test interface contracts only? → Keep in unit

### Step 2: Update Test Structure

- [ ] Import `IntegrationTestFixture` instead of `UnitTestFixture`
- [ ] Wrap tests in `describeForBothModes()` helper
- [ ] Remove any repository instantiation (use `fixture.getXxxRepository()`)
- [ ] Remove any fake client implementations
- [ ] Add `beforeEach` with fixture setup
- [ ] Add `afterEach` with fixture teardown

### Step 3: Update File Location

- [ ] Move file from `test/unit/` to `test/integration/`
- [ ] Update relative import paths (usually `../../src/` stays the same)
- [ ] Verify fixture imports resolve correctly

### Step 4: Verify Tests

- [ ] Run unit tests: `npm run test:unit` (count should decrease)
- [ ] Run integration tests: `npm test test/integration/yourfile.test.ts`
- [ ] Verify tests pass in memory mode
- [ ] Verify cosmos mode skips gracefully (if no `PERSISTENCE_MODE=cosmos`)

### Step 5: Update Related Files (if needed)

- [ ] If adding new `fixture.getXxxRepository()` method, add to `IntegrationTestFixture.ts`
- [ ] Ensure repository binding exists in `testInversify.config.ts`

### Migration Example

**Before (unit test with fake client):**

```typescript
// test/unit/exitRepository.test.ts
import { CosmosExitRepository } from '../../src/repos/exitRepository.js'

class FakeGremlinClient {
    /* ... */
}

describe('Exit Repository', () => {
    test('getExits returns data', async () => {
        const fake = new FakeGremlinClient()
        const repo = new CosmosExitRepository(fake)
        const exits = await repo.getExits('loc-1')
        assert.equal(exits.length, 2)
    })
})
```

**After (integration test with fixture):**

```typescript
// test/integration/exitRepository.test.ts
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'
import type { ContainerMode } from '../helpers/testInversify.config.js'

function describeForBothModes(suiteName: string, testFn: (mode: ContainerMode) => void): void {
    const modes: ContainerMode[] = ['memory', 'cosmos']
    for (const mode of modes) {
        describe(`${suiteName} [${mode}]`, () => {
            if (mode === 'cosmos' && process.env.PERSISTENCE_MODE !== 'cosmos') {
                test.skip('Cosmos tests skipped (PERSISTENCE_MODE != cosmos)', () => {})
                return
            }
            testFn(mode)
        })
    }
}

describeForBothModes('Exit Repository', (mode) => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture(mode)
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    test('getExits returns data', async () => {
        const repo = await fixture.getExitRepository()
        // Create test data
        const locationRepo = await fixture.getLocationRepository()
        await locationRepo.upsert({ id: 'loc-1', name: 'Test', description: '', exits: [] })

        const exits = await repo.getExits('loc-1')
        assert.equal(exits.length, 0) // Initially empty
    })
})
```

## Fixtures

### UnitTestFixture

Use for unit tests. Provides container with all dependencies mocked.

**Non-obvious behavior:**

- `getTelemetryClient()` returns `MockTelemetryClient` - access `.events`, `.exceptions` arrays directly for assertions
- Container uses 'mock' mode automatically

**Example:**

```typescript
test('example', async () => {
    const telemetry = await fixture.getTelemetryClient()
    // ... test code ...
    assert.equal(telemetry.events[0].name, 'Test.Event')
})
```

### IntegrationTestFixture

Use for integration tests. Specify persistence mode in constructor.

**Non-obvious behavior:**

- `getTelemetryClient()` returns `MockTelemetryClient` in 'memory'/'mock' modes (not real App Insights)
- Telemetry is automatically mocked - no need for manual setup
- Repositories come from DI container based on persistence mode
- Optional performance tracking for regression detection (opt-in)
- Automatic SQL document tracking (cosmos mode only): When persistence mode is `cosmos`, repository methods for player docs, inventory items, description layers (future Cosmos implementation), and world events are monkey‑patched to auto‑register created documents with the internal `SqlTestDocTracker`. Teardown deletes them best‑effort. Manual `registerSqlDoc()` is only needed for custom test writes outside standard repository methods.

**Example:**

```typescript
beforeEach(async () => {
    fixture = new IntegrationTestFixture('memory') // or 'mock'
    await fixture.setup()
})

test('example', async () => {
    const repo = await fixture.getLocationRepository()
    const telemetry = await fixture.getTelemetryClient()
    // ... test code ...
})
```

**Performance tracking (optional):**

```typescript
beforeEach(async () => {
    fixture = new IntegrationTestFixture('memory', { trackPerformance: true })
    await fixture.setup()
})

test('detect performance regression', async () => {
    const repo = await fixture.getLocationRepository()

    // Run operation multiple times to gather samples
    for (let i = 0; i < 20; i++) {
        const start = Date.now()
        await repo.get('test-location-id')
        fixture.trackPerformance('location-lookup', Date.now() - start)
    }

    const p95 = fixture.getP95Latency('location-lookup')
    const avg = fixture.getAverageLatency('location-lookup')

    console.log(`Location lookup p95: ${p95}ms, avg: ${avg}ms`)

    // Assert performance targets (in-memory should be very fast)
    assert.ok(p95 < 50, 'In-memory lookup should be <50ms p95')
})
```

### E2ETestFixture

Use for end-to-end tests against real Cosmos DB. Requires test credentials.

**Architecture:**

- Uses **composition** (not inheritance) - wraps IntegrationTestFixture in cosmos mode
- Adds E2E-specific capabilities: performance tracking, world seeding, automated cleanup

**When to use:**

- Production-readiness validation
- Cosmos DB interaction testing (Gremlin + SQL API)
- Performance benchmarking (p95 latency targets)
- Post-merge verification (not run on PRs for cost optimization)

**Non-obvious behavior:**

- Forces `PERSISTENCE_MODE=cosmos` (constructor delegates to IntegrationTestFixture)
- Tracks performance metrics - access via `getP95Latency(operationName)`
- Test data cleanup is **automated** (Gremlin delete by ID)
- Automatic SQL API document cleanup: repository methods (`upsertPlayer`, `addItem`, `addLayer` (future Cosmos impl), `store` in world event repo) are monkey‑patched in cosmos mode to auto‑register created documents for deletion at teardown. You can still call `registerSqlDoc(container, pk, id)` manually for edge cases not yet wrapped.
- `e2e-` prefixed IDs remain acceptable for visual identification but are no longer required for SQL cleanup (tracking is wrapper‑based rather than prefix‑based).
- NOT run on PRs (CI cost optimization - see `docs/developer-workflow/e2e-ci-gating-policy.md`)
- Requires separate environment variables: `GREMLIN_ENDPOINT_TEST`, `COSMOS_SQL_ENDPOINT_TEST`

**Environment setup:**

```bash
# Required for E2E tests
export GREMLIN_ENDPOINT_TEST=https://your-test-cosmos.documents.azure.com:443/
export GREMLIN_DATABASE_TEST=game  # Same database as prod
export GREMLIN_GRAPH_TEST=world-test    # Dedicated test graph within game database
export COSMOS_SQL_ENDPOINT_TEST=https://your-test-cosmos-sql.documents.azure.com:443/
export COSMOS_SQL_DATABASE=game  # Same database as prod (isolation via partition keys)
export NODE_ENV=test  # Routes to 'test' partition
export PERSISTENCE_MODE=cosmos
```

**Example:**

```typescript
beforeEach(async () => {
    if (process.env.PERSISTENCE_MODE !== 'cosmos') {
        console.log('⊘ Skipping E2E tests (PERSISTENCE_MODE != cosmos)')
        return
    }
    fixture = new E2ETestFixture()
    await fixture.setup()
})

afterEach(async () => {
    if (fixture) {
        await fixture.teardown() // Automatic cleanup
    }
})

test('world seeding performance', async () => {
    const start = Date.now()
    const { locations, demoPlayerId } = await fixture.seedTestWorld()
    const duration = Date.now() - start

    fixture.trackPerformance('seed-world', duration)

    assert.ok(locations.length >= 5, 'Should seed ≥5 locations')

    const p95 = fixture.getP95Latency('seed-world')
    console.log(`Seed world p95: ${p95}ms`)
})

test('move operation performance', async () => {
    const { locations } = await fixture.seedTestWorld()
    const locationRepo = await fixture.getLocationRepository()

    const start = Date.now()
    const result = await locationRepo.move(locations[0].id, 'north')
    const duration = Date.now() - start

    fixture.trackPerformance('move-operation', duration)

    assert.equal(result.status, 'ok', 'Move should succeed')
    assert.ok(duration < 500, 'Should complete in <500ms')
})
```

**Performance tracking:**

```typescript
// Track operation latency
fixture.trackPerformance('operation-name', durationMs)

// Get p95 latency for acceptance criteria validation
const p95 = fixture.getP95Latency('operation-name')
assert.ok(p95 < 500, 'p95 latency should be <500ms')

// Get all metrics for an operation
const metrics = fixture.getPerformanceMetrics('operation-name')
console.log(`Recorded ${metrics.length} samples`)
```

**Custom test blueprints:**

```typescript
import { Location } from '@piquet-h/shared'

const customBlueprint: Location[] = [
    {
        id: 'e2e-custom-1',
        name: 'Custom Test Room',
        description: 'Custom test setup',
        exits: [{ direction: 'north', to: 'e2e-custom-2' }]
    }
    // ... more locations
]

const { locations, demoPlayerId } = await fixture.seedTestWorld(customBlueprint)
```

**Running E2E tests:**

```bash
# Run E2E suite (requires Cosmos credentials)
npm run test:e2e

# E2E tests automatically skip if not in cosmos mode
PERSISTENCE_MODE=memory npm run test:e2e  # Will skip with message
```

**CI Strategy:**

- **PR checks:** Integration tests only (fast feedback, no cost)
- **Post-merge:** E2E tests run automatically on main branch
- **Nightly:** Extended E2E scenarios (future)
- See: `docs/developer-workflow/e2e-ci-gating-policy.md`

## Helpers

### seedTestWorld

Shared helper for world seeding in tests (both integration and E2E).

**Located:** `test/helpers/seedTestWorld.ts`

**Usage:**

```typescript
import { seedTestWorld, getDefaultTestLocations, getE2ETestLocations } from '../helpers/seedTestWorld.js'

const result = await seedTestWorld({
    locationRepository: await fixture.getLocationRepository(),
    playerRepository: await fixture.getPlayerRepository(),
    demoPlayerId: 'test-player-id', // optional
    blueprint: customLocations // optional, uses defaults if omitted
})

// Returns:
// - locations: Location[]           (blueprint used)
// - demoPlayerId: string             (player ID created/retrieved)
// - locationsProcessed: number
// - locationVerticesCreated: number
// - exitsCreated: number
// - playerCreated: boolean
```

**Default blueprints:**

- `getDefaultTestLocations()` - 5-location graph for integration tests (IDs: `test-loc-*`)
- `getE2ETestLocations()` - 5-location graph for E2E tests (IDs: `e2e-test-loc-*`)

## Testing Philosophy: Fix Design Flaws, Don't Work Around Them

**Core Principle:** When a test reveals a design flaw, fix the underlying design issue rather than making the test pass through workarounds.

### Why This Matters

Tests are not just about verification—they're about discovering problems early. When a test fails or becomes difficult to write, it's often exposing a design issue in the production code.

**Anti-Pattern: Test Workarounds**

```typescript
// ❌ BAD: Test manipulates environment to work around handler reading env directly
test('health check in cosmos mode', async () => {
    process.env.PERSISTENCE_MODE = 'cosmos' // Working around design flaw
    fixture = new UnitTestFixture()
    await fixture.setup()
    // ... test code that's now coupled to environment state
})
```

**Proper Pattern: Fix the Design**

```typescript
// ✅ GOOD: Handler uses dependency injection, test is clean
test('health check in cosmos mode', async () => {
    const fixture = new UnitTestFixture() // Always uses mock config
    await fixture.setup()
    // Handler respects injected config, no environment manipulation needed
})
```

### Real Example: gremlinHealth Handler (Issue #538)

**The Problem:** Test revealed handler was reading `resolvePersistenceMode()` directly from environment instead of using injected `IPersistenceConfig`.

**Symptom:** Unit tests failed when `PERSISTENCE_MODE=cosmos` was set externally, even though `UnitTestFixture` was supposed to isolate tests.

**Wrong Solution:** Make tests pass by conditionally checking environment:

```typescript
// ❌ Don't do this
if (process.env.PERSISTENCE_MODE === 'cosmos') {
    assert.strictEqual(body.mode, 'cosmos') // Test now reinforces bad design
} else {
    assert.strictEqual(body.mode, 'memory')
}
```

**Right Solution:** Fix the handler to use dependency injection:

```typescript
// ✅ Handler before (design flaw)
class GremlinHealthHandler {
    constructor(@inject('ITelemetryClient') telemetry: ITelemetryClient) {
        super(telemetry)
    }
    protected async execute() {
        const mode = resolvePersistenceMode() // Reading env directly!
        // ...
    }
}

// ✅ Handler after (proper DI)
class GremlinHealthHandler {
    constructor(
        @inject('ITelemetryClient') telemetry: ITelemetryClient,
        @inject('PersistenceConfig') private readonly persistenceConfig: IPersistenceConfig
    ) {
        super(telemetry)
    }
    protected async execute() {
        const mode = this.persistenceConfig.mode // Using injected config!
        // ...
    }
}
```

**Result:** Tests now pass regardless of environment state. Handler properly respects DI container configuration.

### Design Flaw Indicators

Watch for these signs that production code needs fixing, not tests:

1. **Environment Manipulation in Tests**
    - If tests need to set `process.env.*` to work, the code is reading env directly instead of using config
2. **Conditional Test Logic**
    - If tests have `if/else` based on external state, the code is not properly isolated
3. **Test Setup Complexity**
    - If test setup requires elaborate environment preparation, the code has too many dependencies

4. **Fixture Violations**
    - If `UnitTestFixture` tests behave differently based on external state, the code bypasses DI

### When to Fix vs. When to Accept

**Always fix:**

- Handlers reading environment variables directly instead of using injected config
- Tests that must manipulate global state to pass
- Production code that can't be tested without external dependencies

**Acceptable (not design flaws):**

- Integration tests that require real infrastructure (that's their purpose)
- E2E tests that need environment setup (testing real deployment)
- Tests validating environment configuration logic itself

### Decision Framework

```
Test is hard to write or fails unexpectedly
    ↓
Is this a unit test?
    ↓
Yes → Does it need environment manipulation or external state?
    ↓
Yes → Production code has a design flaw
    ↓
Fix the production code to use dependency injection
    ↓
Test should now be simple and isolated
```

## Migration Notes

**Old pattern (manual mocks):**

```typescript
const { getEvents, restore } = mockTelemetry(telemetryClient)
```

**New pattern (DI):**

```typescript
const telemetry = await fixture.getTelemetryClient()
// Access telemetry.events directly
```

**Old pattern (inheritance in E2ETestFixture):**

```typescript
export class E2ETestFixture extends IntegrationTestFixture {
    constructor() {
        super('cosmos')
    }
}
```

**New pattern (composition in E2ETestFixture):**

```typescript
export class E2ETestFixture {
    private baseFixture: IntegrationTestFixture
    constructor() {
        this.baseFixture = new IntegrationTestFixture('cosmos')
    }
}
```
````
