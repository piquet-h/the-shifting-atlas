# Test Fixture Guide

This guide explains how to use the test fixture system for writing tests in The Shifting Atlas backend.

## Overview

The test fixture system provides:
- **Consistent setup/teardown lifecycle** with beforeEach/afterEach hooks
- **Centralized mock creation** to eliminate duplication
- **Automatic resource cleanup** to prevent test pollution
- **Application Insights mocking** for all tests (unit and integration)
- **Base classes for inheritance** to share common test patterns

## Fixture Types

### BaseTestFixture

Base class providing lifecycle hooks and cleanup tracking. All other fixtures inherit from this.

**Methods:**
- `setup()` - Override for custom setup logic
- `teardown()` - Automatically runs registered cleanup tasks
- `registerCleanup(task)` - Register a cleanup function to run during teardown

### UnitTestFixture

For unit tests with mocked dependencies. Extends `BaseTestFixture`.

**Features:**
- Mock telemetry client creation
- Mock invocation context creation
- Mock HTTP request creation
- Container creation with custom bindings

**Example:**
```typescript
import { afterEach, beforeEach, describe, test } from 'node:test'
import { UnitTestFixture } from '../helpers/UnitTestFixture.js'

describe('My Unit Tests', () => {
    let fixture: UnitTestFixture

    beforeEach(async () => {
        fixture = new UnitTestFixture()
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    test('example test', () => {
        const telemetryMock = fixture.getTelemetryMock()
        const ctx = fixture.getInvocationContext()
        const req = fixture.createHttpRequest({
            method: 'GET',
            url: 'http://localhost/api/test',
            query: { id: '123' }
        })
        
        // ... test logic ...
        
        const events = telemetryMock.getEvents()
        // ... assertions ...
    })
})
```

### IntegrationTestFixture

For integration tests with real container/repository access. Extends `BaseTestFixture`.

**Features:**
- Container setup with persistence mode selection (memory/cosmos/mock)
- Repository access (Location, Player, Description)
- Telemetry mocking for integration tests
- Automatic cleanup

**Example:**
```typescript
import { afterEach, beforeEach, describe, test } from 'node:test'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

describe('My Integration Tests', () => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    test('example test', async () => {
        const repo = await fixture.getLocationRepository()
        const telemetryMock = fixture.setupTelemetryMock()
        
        // ... test logic ...
        
        const events = telemetryMock.getEvents()
        // ... assertions ...
    })
})
```

## TestMocks Factory

Centralized factory for creating common mocks. Use these instead of creating mocks manually.

### Methods

#### `TestMocks.createTelemetryClient()`

Creates a mock Application Insights TelemetryClient that captures events and exceptions.

**Returns:**
```typescript
{
    client: TelemetryClient,
    getEvents: () => Array<{ name: string; properties?: Record<string, unknown> }>,
    getExceptions: () => Array<{ exception: Error; properties?: Record<string, unknown> }>
}
```

**Example:**
```typescript
const telemetryMock = TestMocks.createTelemetryClient()
telemetryMock.client.trackEvent({ name: 'Test.Event', properties: { foo: 'bar' } })

const events = telemetryMock.getEvents()
assert.equal(events.length, 1)
assert.equal(events[0].name, 'Test.Event')
```

#### `TestMocks.createInvocationContext(overrides?)`

Creates a mock Azure Functions InvocationContext with log/error tracking.

**Example:**
```typescript
const ctx = TestMocks.createInvocationContext({ functionName: 'MyFunction' })
ctx.log('test message')

const logs = ctx.getLogs()
assert.equal(logs.length, 1)
```

#### `TestMocks.createHttpRequest(options)`

Creates a mock Azure Functions HttpRequest.

**Options:**
- `method` - HTTP method (default: 'GET')
- `url` - Request URL (default: 'http://localhost/api/test')
- `query` - Query parameters as object
- `headers` - Headers as object
- `body` - Request body

**Example:**
```typescript
const req = TestMocks.createHttpRequest({
    method: 'POST',
    url: 'http://localhost/api/player/move',
    query: { dir: 'north' },
    headers: { 'x-player-guid': '123' },
    body: { action: 'move' }
})
```

## Migration Guide

### From Old Pattern

**Old (pre-fixtures):**
```typescript
import { test } from 'node:test'
import { mockInvocationContext } from '../helpers/testUtils.js'

test('my test', async () => {
    const ctx = mockInvocationContext()
    // ... test logic ...
})
```

**New (with fixtures):**
```typescript
import { afterEach, beforeEach, describe, test } from 'node:test'
import { UnitTestFixture } from '../helpers/UnitTestFixture.js'

describe('My Tests', () => {
    let fixture: UnitTestFixture

    beforeEach(async () => {
        fixture = new UnitTestFixture()
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    test('my test', async () => {
        const ctx = fixture.getInvocationContext()
        // ... test logic ...
    })
})
```

### From Manual Mocks

**Old:**
```typescript
async function makeMockContext(): Promise<InvocationContext> {
    const container = await getTestContainer('memory')
    return {
        invocationId: 'test-invocation',
        functionName: 'test-function',
        extraInputs: new Map([['container', container]]),
        log: () => {},
        error: () => {},
        warn: () => {},
        info: () => {},
        debug: () => {},
        trace: () => {}
    } as unknown as InvocationContext
}
```

**New:**
```typescript
async function createMockContext(fixture: IntegrationTestFixture): Promise<InvocationContext> {
    const container = await fixture.getContainer()
    return {
        invocationId: 'test-invocation',
        functionName: 'test-function',
        extraInputs: new Map([['container', container]]),
        log: () => {},
        error: () => {},
        warn: () => {},
        info: () => {},
        debug: () => {},
        trace: () => {}
    } as unknown as InvocationContext
}
```

Or even better, create a reusable helper in your test file.

## Best Practices

1. **Always use beforeEach/afterEach** - Ensures test isolation and proper cleanup
2. **One fixture per test suite** - Create fixture in beforeEach, destroy in afterEach
3. **Use describe blocks** - Group related tests together
4. **Mock App Insights everywhere** - Even in integration tests
5. **Prefer fixture methods over manual mocks** - Use `fixture.createHttpRequest()` instead of manual object construction
6. **Register cleanup tasks** - If creating resources outside fixtures, use `fixture.registerCleanup()`

## Examples

See these test files for complete examples:
- Unit: `test/unit/telemetryCorrelation.test.ts`
- Unit: `test/unit/worldEventProcessor.test.ts`
- Integration: `test/integration/performMove.telemetry.test.ts`
- Integration: `test/integration/look.test.ts`

## Backwards Compatibility

The old test utilities in `testUtils.ts` are still available with deprecation notices:
- `mockInvocationContext()` - Use `TestMocks.createInvocationContext()` instead
- `mockTelemetry()` - Use `IntegrationTestFixture.setupTelemetryMock()` instead
- `makeHttpRequest()` - Use `TestMocks.createHttpRequest()` instead

These will be removed in a future cleanup pass once all tests are migrated.
