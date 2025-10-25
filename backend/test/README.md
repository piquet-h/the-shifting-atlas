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
npm run test:integration         # Integration tests (uses current local.settings.json)
npm run test:integration:memory  # Integration with in-memory storage
npm run test:integration:cosmos  # Integration with real Cosmos DB
npm run test:cov                 # All tests with coverage
```

### Persistence Mode

Integration tests automatically load configuration from `local.settings.json`. By default, they use in-memory storage (fast, no credentials needed).

**Switch persistence mode:**

```bash
npm run test:integration:memory  # Use in-memory storage (default)
npm run test:integration:cosmos  # Use real Cosmos DB (requires Azure credentials)
```

These commands copy the appropriate config file before running integration tests. The setup is automatic.

## Key Differences

**Unit Tests (`test/unit/`)**

- ✅ No configuration files required
- ✅ No environment variables needed
- ✅ Fast (<2s total)
- ✅ No external service dependencies
- ✅ Tests: pure logic, validators, response formatting, mocked services

**Integration Tests (`test/integration/`)**

- ✅ Configuration loaded automatically via `test/setup.ts`
- ✅ Defaults to `PERSISTENCE_MODE=memory` (safe, fast)
- ✅ Tests real repository implementations with actual persistence
- ✅ Switch modes: `npm run test:integration:memory` or `npm run test:integration:cosmos`

**Note**: Integration tests automatically load settings from `local.settings.json`. You don't need to manually configure anything — just run `npm run test:integration` and the setup happens automatically.

## Writing New Tests

Add to `test/unit/` if:

- Testing pure functions
- No repository/database calls
- Using Inversify with mocked services (IGremlinClient, TelemetryClient)
- No configuration or environment setup needed

Add to `test/integration/` if:

- Testing repository implementations with real persistence
- Requires actual storage layer (memory or Cosmos)
- Tests cross-service workflows
- **Don't worry about setup**: Configuration loads automatically from `local.settings.json`

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
