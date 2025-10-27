# E2E Integration Tests

End-to-end integration tests running against real Cosmos DB (Gremlin + SQL API) to validate full traversal and persistence flows.

## Purpose

- Validate production-readiness of Cosmos interactions
- Test data model assumptions and cross-service workflows
- Catch regressions in persistence layer before deployment
- Verify performance targets (move <500ms, LOOK <200ms p95)

## Running E2E Tests

```bash
cd backend

# Ensure Cosmos configuration is set
export PERSISTENCE_MODE=cosmos
export COSMOS_GREMLIN_ENDPOINT_TEST=https://your-test-cosmos.documents.azure.com:443/
export COSMOS_SQL_ENDPOINT_TEST=https://your-test-cosmos.documents.azure.com:443/
export COSMOS_DATABASE_TEST=game-test

# Run E2E tests
npm run test:e2e
```

## Test Files

- **cosmos.e2e.test.ts** - Core E2E test scenarios covering acceptance criteria
- **E2ETestFixture.ts** - Test fixture with Cosmos setup, seeding, and performance tracking

## Test Coverage

### ✓ World Seeding & Cleanup
- Seed script creates ≥5 locations with exits
- Cleanup strategy logs test data for monitoring
- Idempotent re-run safe

### ✓ Player Bootstrap & First LOOK (Cold Start)
- Player bootstrap → location lookup → first LOOK flow
- Performance: LOOK query <200ms (p95)

### ✓ Multi-Hop Traversal
- Move 3+ times and verify location updates
- Performance: Move operation <500ms (p95)

### ✓ Exit Validation
- Missing exit returns error (no-exit)
- Invalid direction returns error

### ✓ Concurrent Operations
- 2 players move simultaneously without state corruption
- Concurrent location lookups return consistent data

### ✓ Telemetry Emission
- Operations emit telemetry events to Application Insights

### ✓ Performance & Reliability
- Cosmos throttling (429) handled via SDK retry
- Partition key strategy validated per ADR-002

## Environment Variables

Required:
```bash
PERSISTENCE_MODE=cosmos
COSMOS_GREMLIN_ENDPOINT_TEST or COSMOS_GREMLIN_ENDPOINT
COSMOS_SQL_ENDPOINT_TEST or COSMOS_SQL_ENDPOINT
```

Recommended (separate test database):
```bash
COSMOS_DATABASE_TEST=game-test
COSMOS_SQL_DATABASE_TEST=game-docs-test
COSMOS_SQL_CONTAINER_PLAYERS=players
COSMOS_SQL_CONTAINER_INVENTORY=inventory
COSMOS_SQL_CONTAINER_LAYERS=descriptionLayers
COSMOS_SQL_CONTAINER_EVENTS=worldEvents
```

## Test Data Cleanup

Current implementation logs test entity IDs for monitoring/manual cleanup.

**Manual Cleanup:**
1. Review console output for test entity IDs (prefixed with `e2e-`)
2. Remove via Azure Portal or Cosmos SDK scripts

**Future Enhancement:**
- Automated cleanup when repository delete methods are available
- Or use dedicated test database that can be wiped between runs

## Performance Targets (p95)

Per issue #170 acceptance criteria:
- Full suite: <90s
- Single move operation: <500ms
- LOOK query: <200ms

**Note:** Performance may vary based on:
- Cosmos DB provisioning (RU/s allocation)
- Network latency to Cosmos endpoint
- Test environment load

## CI Integration Policy

- **On PR:** Skip E2E tests (unit tests only for fast feedback)
- **On merge to main:** Run E2E suite (post-merge validation)
- **Nightly:** Run E2E + extended scenarios (cost-optimized)

This balances CI speed with comprehensive validation while managing Cosmos DB costs.

## Troubleshooting

### Tests skip with "⊘ Skipping E2E tests"
- Ensure `PERSISTENCE_MODE=cosmos` is set
- Check environment variables for Cosmos endpoints

### Authentication failures
- Run `az login` (local development)
- Verify Azure AD identity has Cosmos DB Data Contributor role
- Check Managed Identity configuration (CI/Azure environments)

### Performance targets exceeded
- Check Cosmos DB RU/s provisioning
- Verify network latency to Cosmos endpoint
- Review Application Insights for throttling events (429)

### Test data not cleaned up
- Check console output for logged entity IDs
- Manually remove via Azure Portal or scripts
- Consider using separate test database for easier cleanup

## Related

- Issue: piquet-h/the-shifting-atlas#170
- ADR-002: Graph Partition Strategy
- Documentation: `docs/developer-workflow/local-dev-setup.md`
