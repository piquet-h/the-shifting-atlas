# E2E Integration Tests

End-to-end integration tests running against real Cosmos DB (Gremlin + SQL API) to validate full traversal and persistence flows.

## Architecture

- **Test Graph**: `world-test` (dedicated Gremlin graph container, separate from production `world`)
- **Test Partition**: `test` (within the test graph, set via `NODE_ENV=test`)
- **Database**: `game` (same account, but isolated graph container)
- **Isolation Strategy**: Dedicated test graph + partition key separation for complete data isolation

## Running E2E Tests

```bash
cd backend

# Ensure Cosmos configuration is set (test-specific variables preferred)
export PERSISTENCE_MODE=cosmos
export NODE_ENV=test
export GREMLIN_ENDPOINT_TEST=https://your-cosmos.documents.azure.com:443/
export GREMLIN_DATABASE_TEST=game
export GREMLIN_GRAPH_TEST=world-test
export COSMOS_SQL_ENDPOINT_TEST=https://your-cosmos.documents.azure.com:443/

# Run E2E tests
npm run test:e2e
```

**Note**: If `*_TEST` variables are not set, tests will fall back to production variables (`GREMLIN_ENDPOINT`, etc.) but still use the `test` partition for isolation.

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
NODE_ENV=test  # Routes to 'test' partition
```

Test-specific (recommended):

```bash
GREMLIN_ENDPOINT_TEST=https://your-cosmos.documents.azure.com:443/
GREMLIN_DATABASE_TEST=game
GREMLIN_GRAPH_TEST=world-test  # Dedicated test graph
COSMOS_SQL_ENDPOINT_TEST=https://your-cosmos.documents.azure.com:443/
```

Fallback (if test-specific not set):

```bash
GREMLIN_ENDPOINT=https://your-cosmos.documents.azure.com:443/
GREMLIN_DATABASE=game
GREMLIN_GRAPH=world  # Will still use 'test' partition for isolation
COSMOS_SQL_ENDPOINT=https://your-cosmos.documents.azure.com:443/
```

SQL API containers (defaults work for standard setup):

```bash
COSMOS_SQL_DATABASE=game
COSMOS_SQL_CONTAINER_PLAYERS=players
COSMOS_SQL_CONTAINER_INVENTORY=inventory
COSMOS_SQL_CONTAINER_LAYERS=descriptionLayers
COSMOS_SQL_CONTAINER_EVENTS=worldEvents
```

## Test Data Cleanup

Current implementation logs test entity IDs for monitoring/manual cleanup.

**Strategy**: Test data is isolated in the `world-test` graph using the `test` partition, making it completely separate from production data.

**Manual Cleanup** (if needed):

1. Review console output for test entity IDs (prefixed with `e2e-`)
2. Option A: Delete via Azure Portal → Cosmos DB → world-test graph
3. Option B: Wipe entire test graph and recreate (safest for clean state)

**Future Enhancement**:

- Automated cleanup when repository delete methods are available
- TTL policy on test partition for automatic expiration
- Scheduled cleanup script in CI

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

E2E tests run in a **dedicated workflow** (`.github/workflows/e2e-integration.yml`) separate from the main CI pipeline.

**CI Configuration**:

```yaml
env:
    GREMLIN_ENDPOINT_TEST: ${{ secrets.COSMOS_GREMLIN_ENDPOINT }}
    GREMLIN_DATABASE_TEST: game
    GREMLIN_GRAPH_TEST: world-test # Uses dedicated test graph
    PERSISTENCE_MODE: cosmos
    NODE_ENV: test
```

**Required GitHub Secrets**:

- `COSMOS_GREMLIN_ENDPOINT`: Cosmos DB Gremlin endpoint URL

**When Tests Run**:

- ✅ Pull requests affecting `backend/**` or `shared/**`
- ✅ Pushes to main branch
- ✅ Manual workflow dispatch
- ⏭️ Skipped for frontend-only changes

**Test Output Visibility**:

- Failed tests appear as **error annotations** on the workflow
- Test summary and failure details shown **inline** in the job summary (no download needed)
- Full test log available as downloadable artifact for deep debugging
- Each failed test creates a GitHub error annotation pointing to the test file

This approach provides immediate visibility into failures without requiring artifact downloads.

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
