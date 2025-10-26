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
- `'cosmos'` - Real Cosmos DB (not typically used in tests)

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
