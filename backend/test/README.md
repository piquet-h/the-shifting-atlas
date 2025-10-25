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
│   └── telemetryCorrelation.test.ts
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
npm test                    # Run all tests (unit + integration)
npm run test:unit          # Unit tests only (fast, no config needed)
npm run test:integration   # Integration tests (needs local.settings.json)
npm run test:cov           # All tests with coverage
```

### Persistence Mode

Integration tests support two modes via `local.settings.json`:

```bash
npm run test:memory        # Use in-memory storage (default, fast)
npm run test:cosmos        # Use real Cosmos DB (requires credentials)
```

## Key Differences

**Unit Tests (`test/unit/`)**

- ✅ No `local.settings.json` required
- ✅ No `PERSISTENCE_MODE` environment variable needed
- ✅ Fast (<2s total)
- ✅ No external service dependencies
- Test: pure logic, validators, response formatting

**Integration Tests (`test/integration/`)**

- Loads configuration from `local.settings.json` via `test/setup.ts`
- Requires `PERSISTENCE_MODE=memory` or `cosmos`
- Tests real repository implementations
- Uses state reset helpers between tests

## Writing New Tests

Add to `test/unit/` if:

- Testing pure functions
- No repository/database calls
- Fully mocked dependencies
- Using Inversify with mocked service implementations

Add to `test/integration/` if:

- Testing repository implementations
- Requires persistence layer (memory or Cosmos)
- Tests cross-service interactions

### Using Inversify for Unit Tests

For tests that need dependency injection with mocked services:

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

This approach allows testing business logic in isolation while still using the real DI container structure.

## Performance Targets

- Unit tests: <2s total
- Single move operation: <500ms (p95)
- LOOK query: <200ms (p95)
- Full test suite: <90s (p95)
