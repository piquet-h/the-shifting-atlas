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
- Uses `e2e-` prefixed IDs by convention for safety
- NOT run on PRs (CI cost optimization - see `docs/developer-workflow/e2e-ci-gating-policy.md`)
- Requires separate environment variables: `GREMLIN_ENDPOINT_TEST`, `COSMOS_SQL_ENDPOINT_TEST`

**Environment setup:**

```bash
# Required for E2E tests
export GREMLIN_ENDPOINT_TEST=https://your-test-cosmos.documents.azure.com:443/
export GREMLIN_DATABASE_TEST=game-test  # Use separate test database
export GREMLIN_GRAPH_TEST=world-test    # Dedicated test graph
export COSMOS_SQL_ENDPOINT_TEST=https://your-test-cosmos-sql.documents.azure.com:443/
export COSMOS_SQL_DATABASE_TEST=game-docs-test
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
