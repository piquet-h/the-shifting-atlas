# Backend Test Suite

## Structure

```
test/
├── unit/           # Fast, isolated tests (no external dependencies)
│   ├── edgeManagement.test.ts
│   ├── exitRepository.test.ts      # Uses mocked IGremlinClient
│   ├── moveHandlerResponse.test.ts
│   ├── ping.envelope.test.ts
│   ├── secretsHelper.test.ts
│   ├── telemetryCorrelation.test.ts
│   └── telemetryInversify.test.ts  # Demo of DI-based telemetry mocking
├── integration/    # Tests with Cosmos/memory persistence
│   ├── e2e.integration.test.ts
│   ├── *Repository.test.ts
│   └── (other integration tests)
├── helpers/        # Shared test utilities
│   ├── containerHelpers.ts        # DI mocking utilities
│   └── testUtils.ts
└── setup/          # Test environment configuration
```

## Running Tests

```bash
npm test                         # Run all tests (unit + integration)
npm run test:unit                # Unit tests only (fast, no config needed)
npm run test:integration         # Integration tests (both memory and cosmos modes)
npm run test:cov                 # All tests with coverage
```

### Persistence Mode

**Integration tests no longer depend on `local.settings.json` or environment variables.**

Tests explicitly control which persistence mode(s) to test using the `getTestContainer(mode)` helper:

```typescript
// Test with memory mode only
const container = await getTestContainer('memory')

// Test with cosmos mode only (requires Azure credentials)
const container = await getTestContainer('cosmos')
```

Most integration tests use **memory mode by default** (fast, no credentials needed). Some tests may run against **both modes** to ensure consistency across implementations.

**Important:** The `local.settings.json` file is ONLY needed for running the actual Azure Functions app (`npm run dev`, `func start`). Tests do not use it.

## Key Differences

**Unit Tests (`test/unit/`)**

- ✅ No configuration files required
- ✅ No environment variables needed
- ✅ Fast (<2s total)
- ✅ No external service dependencies
- ✅ Tests: pure logic, validators, response formatting, mocked services

**Integration Tests (`test/integration/`)**

- ✅ No configuration files required
- ✅ Tests explicitly specify which persistence mode to use: `getTestContainer('memory')` or `getTestContainer('cosmos')`
- ✅ Most tests use memory mode (fast, safe, no credentials)
- ✅ Tests real repository implementations with actual persistence
- ✅ Some tests may run against both modes to ensure consistency

## Writing New Tests

Add to `test/unit/` if:

- Testing pure functions
- No repository/database calls
- Using Inversify with mocked services (IGremlinClient, TelemetryClient)
- No configuration or environment setup needed

Add to `test/integration/` if:

- Testing repository implementations with real persistence
- Requires actual storage layer (memory or cosmos)
- Tests cross-service workflows
- Use `getTestContainer('memory')` by default for fast, isolated tests
- Use `getTestContainer('cosmos')` if testing cosmos-specific behavior

### Testing Against Both Persistence Modes

To ensure your code works consistently across both memory and cosmos implementations, use the `describeForBothModes` helper:

```typescript
import { describeForBothModes } from '../helpers/dualModeTest.js'

describeForBothModes('Location Repository', (mode, getRepo) => {
    test('can create location', async () => {
        const repo = await getRepo('ILocationRepository')
        const result = await repo.upsert({
            id: 'test',
            name: 'Test',
            description: 'Test location',
            version: 1
        })
        assert.ok(result.created)
    })
})
```

This will run your tests against both 'memory' and 'cosmos' modes, ensuring consistency.

### Using Inversify for Unit Tests

For tests that need dependency injection with mocked services:

**Mocking Gremlin Client:**

```typescript
import { createTestContainer, createMockGremlinClient } from '../helpers/containerHelpers.js'
import { ExitRepository } from '../../src/repos/exitRepository.js'

// Create a mock Gremlin client
const mockClient = createMockGremlinClient({
    "outE('exit')": [{ direction: 'north', toLocationId: 'loc-2' }]
})

// Create test container with mocked dependencies
const container = createTestContainer({ gremlinClient: mockClient })
const exitRepo = container.get(ExitRepository)

// Test the repository logic without real persistence
const exits = await exitRepo.getExits('loc-1')
```

**Mocking TelemetryClient (Application Insights):**

```typescript
import { createTestContainer, createMockTelemetryClient } from '../helpers/containerHelpers.js'

// Create a mock telemetry client that captures calls
const { client, getEvents, getExceptions } = createMockTelemetryClient()

// Bind to container
const container = createTestContainer({ telemetryClient: client })

// Inject into services via DI
const myService = container.get(MyService)

// ... run tests ...

// Assert telemetry was emitted correctly
const events = getEvents()
assert.ok(events.find((e) => e.name === 'Location.Move'))
```

This approach allows testing business logic in isolation while still using the real DI container structure.

## Performance Targets

- Unit tests: <2s total
- Single move operation: <500ms (p95)
- LOOK query: <200ms (p95)
- Full test suite: <90s (p95)
