# Backend Test Suite

Comprehensive test coverage for The Shifting Atlas backend services.

## Test Categories

### Unit Tests
Fast, isolated tests for individual components and functions:
- Repository interfaces (`repositoryInterfaces.test.ts`)
- Edge management (`edgeManagement.test.ts`, `exitRepository.test.ts`)
- Player authentication and identity (`playerAuth.test.ts`, `playerRepositoryIdentity.test.ts`)
- Telemetry correlation (`telemetryCorrelation.test.ts`)
- Secrets handling (`secretsHelper.test.ts`)

### Integration Tests
Tests that validate interactions between components:
- Location repository with Cosmos (`locationRepository.cosmos.test.ts`)
- Player repository (`playerRepository.test.ts`)
- World seeding (`worldSeed.test.ts`, `mosswellBootstrap.test.ts`)
- Handler envelopes (`locationHandler.envelope.test.ts`, `ping.envelope.test.ts`)
- Move operations (`performMove.core.test.ts`, `performMove.telemetry.test.ts`)

### End-to-End Tests
Comprehensive E2E tests validating full workflows (`e2e.integration.test.ts`):
- Player bootstrap → LOOK → first location
- Multi-hop traversal (3+ moves)
- Exit validation (blocked/missing exits)
- Concurrent player movements
- Performance baselines (move <500ms, LOOK <200ms)

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Specific Test File
```bash
npm test -- test/e2e.integration.test.ts
```

### Run Tests with Coverage
```bash
npm run test:cov
```

## E2E Integration Test Suite

### Purpose
The E2E test suite (`e2e.integration.test.ts`) provides high-confidence integration testing that catches regressions in persistence interactions, data model assumptions, and cross-service workflows before deployment.

### Test Coverage
- **Test Fixture**: Automated world seed with 7 test locations (≥5 required)
- **Cleanup**: Teardown removes all test data after suite completes
- **Persistence Mode**: Works with both `memory` and `cosmos` modes
- **Core Scenarios**:
  - Player bootstrap with starting location assignment
  - Location lookup (LOOK) with cold start
  - Multi-hop traversal (3+ consecutive moves)
  - Exit validation (invalid/missing/blocked exits)
  - Concurrent moves (2+ players, no state corruption)
  - Idempotency verification

### Performance Targets
- Full E2E suite: <90s (p95) ✓
- Single move operation: <500ms (p95) ✓
- LOOK query: <200ms (p95) ✓

Current results (memory mode):
- Full suite: ~35ms (well under 90s target)
- Move operations: <1ms average
- LOOK queries: <1ms average

### Environment Setup

#### Memory Mode (Default)
```bash
export PERSISTENCE_MODE=memory
npm test -- test/e2e.integration.test.ts
```

#### Cosmos Mode (Future)
```bash
export PERSISTENCE_MODE=cosmos
export COSMOS_GREMLIN_ENDPOINT_TEST=<endpoint>
export COSMOS_SQL_ENDPOINT_TEST=<endpoint>
export COSMOS_DATABASE_TEST=game-test
npm test -- test/e2e.integration.test.ts
```

### Test Fixtures
The E2E suite uses a dedicated test world blueprint with 7 locations:
- `e2e-start`: Starting point with 3 exits (north, east, west)
- `e2e-north`: Northern chamber (2-hop chain to far north)
- `e2e-far-north`: Far northern room
- `e2e-east`: Eastern wing (2-hop chain to far east)
- `e2e-far-east`: Far eastern chamber
- `e2e-west`: Western hall
- `e2e-blocked`: Dead-end room with no exits (for exit validation tests)

### CI Integration Policy
- **On PR**: Run unit tests only (fast feedback)
- **On merge to main**: Run full test suite including E2E (post-merge validation)
- **Nightly**: Run E2E + extended scenarios (cost-optimized)

## Test Helpers

### State Reset Functions
```typescript
import { __resetSeedWorldTestState } from '../src/seeding/seedWorld.js'
import { __resetLocationRepositoryForTests } from '../src/repos/locationRepository.js'
import { __resetPlayerRepositoryForTests } from '../src/repos/playerRepository.js'

// Reset all test state
__resetSeedWorldTestState()
```

### Test World Seeding
```typescript
import { seedWorld } from '../src/seeding/seedWorld.js'

const result = await seedWorld({
    blueprint: testLocations,
    demoPlayerId: 'test-player-id'
})
```

## Continuous Improvement

### Adding New Tests
1. Follow existing test patterns (describe/test blocks)
2. Use descriptive test names (Given/When/Then style)
3. Reset state between tests (`__reset*ForTests()`)
4. Verify both happy paths and edge cases
5. Include performance assertions where relevant

### Test Maintenance
- Keep tests focused and independent
- Avoid test interdependencies
- Update test fixtures when data model changes
- Monitor test execution time (flag tests >1s)

## References
- [Local Dev Setup](../../docs/developer-workflow/local-dev-setup.md)
- [ADR-002: Graph Partition Strategy](../../docs/adr/002-graph-partition-strategy.md)
- [World Seed Script](../src/seeding/seedWorld.ts)
