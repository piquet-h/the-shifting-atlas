# Test Strategy Guide

**Purpose:** Define when to use each test layer and provide guidelines for maintaining a healthy test pyramid.

**Audience:** Backend developers, test engineers, code reviewers

**Last Updated:** 2025-10-29

---

## Quick Reference

| Test Layer      | % of Tests | Speed      | Use For                                        | Don't Use For                |
| --------------- | ---------- | ---------- | ---------------------------------------------- | ---------------------------- |
| **Unit**        | 70-80%     | <5s total  | Pure logic, validation, transformations        | I/O, HTTP, DB operations     |
| **Integration** | 15-25%     | <10s total | Service layer, DI, repositories, HTTP handlers | Real database, external APIs |
| **E2E**         | 5-10%      | <90s total | Critical user journeys, real DB, performance   | Input validation, unit logic |

---

## The Test Pyramid

```
    /\
   /E2\      ← Few, slow, expensive (5-10%)
  /____\
 /      \
/  INT   \   ← Medium count, medium speed (15-25%)
/_________\
/          \
/   UNIT    \ ← Many, fast, cheap (70-80%)
/____________\
```

### Why This Matters

**Inverted Pyramid Anti-Pattern** (❌ BAD):

-   Too many E2E tests = slow CI, flaky tests, hard to debug
-   Too few unit tests = missed edge cases, hard to refactor

**Healthy Pyramid** (✅ GOOD):

-   Fast feedback on logic errors (unit tests catch 70% of bugs)
-   Medium feedback on integration issues (integration tests catch 25%)
-   Slow feedback on production readiness (E2E tests validate 5%)

---

## Layer 1: Unit Tests

### Purpose

Test **pure logic** in isolation with all dependencies mocked.

### When to Write Unit Tests

✅ **DO write unit tests for:**

-   Pure functions (input → output, no side effects)
-   Business logic (calculation, validation, transformation)
-   Edge case handling (null, empty, boundary conditions)
-   Error formatting and response structure
-   Data model validation
-   Helper utilities

❌ **DON'T write unit tests for:**

-   Database queries (use integration tests)
-   HTTP request handling (use integration tests)
-   External API calls (use integration tests)
-   File I/O operations (use integration tests)

### Example: Good Unit Test

```typescript
// Unit test: Pure validation logic
import assert from 'node:assert'
import { test } from 'node:test'
import { validateDirection } from '../src/utils/directionValidator.js'

test('validateDirection returns error for invalid direction', () => {
    const result = validateDirection('zzz')
    assert.equal(result.valid, false)
    assert.ok(result.error)
    assert.ok(result.error.includes('Invalid direction'))
})

test('validateDirection accepts all cardinal directions', () => {
    const directions = ['north', 'south', 'east', 'west', 'up', 'down', 'in', 'out']
    for (const dir of directions) {
        const result = validateDirection(dir)
        assert.equal(result.valid, true, `${dir} should be valid`)
    }
})
```

### Fixture Pattern

```typescript
import { UnitTestFixture } from '../helpers/UnitTestFixture.js'

describe('My Module', () => {
    let fixture: UnitTestFixture

    beforeEach(async () => {
        fixture = new UnitTestFixture()
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    test('example', async () => {
        const telemetry = await fixture.getTelemetryClient()
        // telemetry is MockTelemetryClient - check telemetry.events array
    })
})
```

### Characteristics

-   ⚡ **Speed:** <50ms per test
-   🎯 **Scope:** Single function or class
-   🔧 **Mocking:** All dependencies mocked
-   📊 **Coverage:** 70-80% of total tests

---

## Layer 2: Integration Tests

### Purpose

Test **service layer integration** with in-memory repositories and mocked external dependencies.

### When to Write Integration Tests

✅ **DO write integration tests for:**

-   Service orchestration (multiple components working together)
-   Repository contracts (interface compliance)
-   HTTP request/response flows (envelope structure)
-   Telemetry emission (event tracking)
-   DI container setup (dependency resolution)
-   Complex business workflows (multi-step processes)
-   Database-like operations (using in-memory implementations)

❌ **DON'T write integration tests for:**

-   Real database performance (use E2E)
-   Real database concurrency (use E2E)
-   External API calls (mock them)
-   Pure logic (use unit tests)

### Example: Good Integration Test

```typescript
// Integration test: Service layer with in-memory repositories
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'
import { seedTestWorld } from '../helpers/seedTestWorld.js'

describe('Move Validation', () => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    test('missing exit returns error', async () => {
        const locationRepo = await fixture.getLocationRepository()
        const playerRepo = await fixture.getPlayerRepository()

        // Seed test world
        const { locations } = await seedTestWorld({
            locationRepository: locationRepo,
            playerRepository: playerRepo
        })

        // Try to move in direction with no exit
        const northLocation = locations.find((l) => l.name.includes('North'))
        const result = await locationRepo.move(northLocation!.id, 'north')

        // Assert error response
        assert.equal(result.status, 'error')
        assert.ok(result.reason.includes('No exit'))
    })
})
```

### Fixture Modes

```typescript
// Mode 1: Memory (in-memory repositories)
fixture = new IntegrationTestFixture('memory')

// Mode 2: Mock (all mocked, like unit tests)
fixture = new IntegrationTestFixture('mock')

// Don't use 'cosmos' in integration tests - that's for E2E
```

### Characteristics

-   ⚡ **Speed:** <100ms per test
-   🎯 **Scope:** Multiple components, service layer
-   🔧 **Mocking:** External dependencies mocked, in-memory persistence
-   📊 **Coverage:** 15-25% of total tests

---

## Layer 3: E2E Tests

### Purpose

Test **critical user journeys** with real database and production-like infrastructure.

### When to Write E2E Tests

✅ **DO write E2E tests for:**

-   Critical user journeys (golden path: move → look → interact)
-   Real database behavior (Cosmos DB latency, throttling, consistency)
-   Production readiness validation (can it handle real traffic?)
-   Performance benchmarking (p95 latency targets)
-   Cross-service integration (multiple services working together)
-   Database concurrency (race conditions, locking)
-   Infrastructure validation (partition keys, connection pooling)

❌ **DON'T write E2E tests for:**

-   Input validation (use unit or integration tests)
-   Error handling (use unit or integration tests)
-   Edge cases (use unit tests)
-   Business logic permutations (use unit tests)
-   Telemetry emission (use integration tests)

### Example: Good E2E Test

```typescript
// E2E test: Real Cosmos DB with performance validation
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { E2ETestFixture } from './E2ETestFixture.js'

describe('E2E Integration Tests - Cosmos DB', () => {
    let fixture: E2ETestFixture

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
            await fixture.teardown()
        }
    })

    test('multi-hop traversal with performance validation', async () => {
        if (process.env.PERSISTENCE_MODE !== 'cosmos') return

        const { locations } = await fixture.seedTestWorld()
        const locationRepo = await fixture.getLocationRepository()

        // Move 1: Hub → North
        const start1 = Date.now()
        const move1 = await locationRepo.move(locations[0].id, 'north')
        fixture.trackPerformance('move-operation', Date.now() - start1)

        assert.equal(move1.status, 'ok')

        // Move 2: North → South (back to hub)
        const start2 = Date.now()
        const move2 = await locationRepo.move(move1.location!.id, 'south')
        fixture.trackPerformance('move-operation', Date.now() - start2)

        assert.equal(move2.status, 'ok')
        assert.equal(move2.location!.id, locations[0].id)

        // Validate performance target
        const p95 = fixture.getP95Latency('move-operation')
        assert.ok(p95! < 500, `Move p95 latency ${p95}ms exceeds 500ms target`)
    })
})
```

### Fixture Setup

```typescript
import { E2ETestFixture } from './E2ETestFixture.js'

// E2ETestFixture automatically uses 'cosmos' mode
fixture = new E2ETestFixture()
await fixture.setup()

// Seed test world (creates locations with exits)
const { locations } = await fixture.seedTestWorld()

// Player creation is now explicit (no automatic demo player on seed)
// Example (if needed for a test path):
// const playerRepository = await fixture.getPlayerRepository()
// const { record: player } = await playerRepository.getOrCreate()

// Track performance metrics
fixture.trackPerformance('operation-name', durationMs)
const p95 = fixture.getP95Latency('operation-name')
```

### Characteristics

-   ⚡ **Speed:** 500ms-5s per test
-   🎯 **Scope:** Full stack, real infrastructure
-   🔧 **Mocking:** Nothing mocked (uses real Cosmos DB)
-   📊 **Coverage:** 5-10% of total tests
-   💰 **Cost:** Azure Cosmos DB RU consumption

---

## Decision Tree: Which Test Layer?

```
┌─────────────────────────────────────────┐
│ What are you testing?                   │
└────────────┬────────────────────────────┘
             │
    ┌────────▼────────┐
    │ Pure logic?     │
    │ (no I/O)        │
    └─┬──────────┬────┘
      │ YES      │ NO
      ▼          ▼
   UNIT       ┌──────────────────┐
   TEST       │ Needs real DB?   │
              │ (concurrency,    │
              │ performance,     │
              │ Cosmos-specific) │
              └─┬─────────────┬──┘
                │ YES         │ NO
                ▼             ▼
              E2E         INTEGRATION
              TEST          TEST
```

### Examples

**Scenario: Validate direction input**

-   Decision: Pure logic validation
-   **Answer: Unit Test** ✅

**Scenario: Test move handler response structure**

-   Decision: HTTP envelope structure, no real DB needed
-   **Answer: Integration Test** ✅

**Scenario: Test multi-player concurrent moves**

-   Decision: Requires real database concurrency
-   **Answer: E2E Test** ✅

**Scenario: Test telemetry event emission**

-   Decision: Can use MockTelemetryClient, no real App Insights needed
-   **Answer: Integration Test** ✅

**Scenario: Test Cosmos DB throttling (429) retry**

-   Decision: Requires real Cosmos DB SDK behavior
-   **Answer: E2E Test** ✅

---

## Common Pitfalls

### ❌ Anti-Pattern #1: Unit Testing I/O

```typescript
// BAD: Unit test trying to test database operations
test('should save player to database', async () => {
    const player = { id: '123', name: 'Test' }
    await database.savePlayer(player) // ← Real database call in unit test!
    const saved = await database.getPlayer('123')
    assert.equal(saved.name, 'Test')
})
```

**Fix:** Move to integration test with in-memory repository or E2E test with real database.

### ❌ Anti-Pattern #2: E2E Testing Edge Cases

```typescript
// BAD: E2E test for edge case validation
test('should reject empty player name', async () => {
    const result = await createPlayer({ name: '' }) // ← This is input validation!
    assert.equal(result.error, 'Name is required')
})
```

**Fix:** Move to unit test for validation logic or integration test for HTTP envelope.

### ❌ Anti-Pattern #3: Integration Testing Without Mocks

```typescript
// BAD: Integration test hitting real external API
test('should fetch weather data', async () => {
    const weather = await weatherAPI.fetch('Seattle') // ← Real API call!
    assert.ok(weather.temperature)
})
```

**Fix:** Mock external API in integration test or move to E2E with recorded fixtures.

---

## Test Coverage Guidelines

### What to Measure

✅ **DO measure:**

-   Line coverage (goal: >80%)
-   Branch coverage (goal: >75%)
-   Function coverage (goal: >90%)
-   Critical path coverage (goal: 100%)

❌ **DON'T obsess over:**

-   100% coverage (diminishing returns)
-   Coverage of trivial getters/setters
-   Coverage of third-party libraries

### Coverage Targets by Layer

| Layer       | Target Coverage | Priority                           |
| ----------- | --------------- | ---------------------------------- |
| Unit        | 80-90%          | High - catch logic bugs early      |
| Integration | 60-70%          | Medium - verify service contracts  |
| E2E         | 30-40%          | Low - validate critical paths only |

**Total Coverage:** Aim for 70-80% overall

---

## Performance Targets

### Unit Tests

-   **Per test:** <50ms
-   **Total suite:** <5 seconds
-   **Failure impact:** Block PR if failing

### Integration Tests

-   **Per test:** <100ms
-   **Total suite:** <10 seconds
-   **Failure impact:** Block PR if failing

### E2E Tests

-   **Per test:** 500ms-5s
-   **Total suite:** <90 seconds
-   **Failure impact:** Block merge to main if failing

### Performance Degradation Detection

```typescript
// Track performance in E2E tests
fixture.trackPerformance('operation-name', durationMs)

// Validate against targets
const p95 = fixture.getP95Latency('operation-name')
assert.ok(p95 < TARGET_MS, `p95 latency ${p95}ms exceeds target`)
```

---

## CI/CD Integration

### PR Checks (Fast Feedback)

-   Lint & Typecheck
-   Unit Tests
-   Integration Tests
-   **Total: <2 minutes**

### E2E Checks (Comprehensive Validation)

-   Run on: PR + merge to main
-   Execution Time: <90 seconds
-   Cost: Minimal (dedicated test database)

### Nightly Checks (Future)

-   Extended E2E scenarios
-   Load testing
-   Performance regression detection

---

## Code Review Checklist

When reviewing test PRs, check:

-   [ ] Is the test at the right layer? (Unit/Integration/E2E)
-   [ ] Does it test one thing? (Single responsibility)
-   [ ] Is it deterministic? (No flakiness)
-   [ ] Does it have clear assertions? (Not just "doesn't throw")
-   [ ] Is setup/teardown handled properly? (Fixtures)
-   [ ] Are mocks used appropriately? (Not in E2E)
-   [ ] Is performance tracked? (E2E tests only)
-   [ ] Is it documented? (Clear test names, comments for complex logic)

---

## Migration Guide

### Moving Tests Between Layers

**From E2E → Integration:**

1. Change fixture from `E2ETestFixture` to `IntegrationTestFixture('memory')`
2. Remove performance tracking (unless needed)
3. Remove Cosmos DB specific assertions
4. Keep same test logic and assertions
5. Verify test still passes with in-memory repositories

**From Integration → Unit:**

1. Change fixture from `IntegrationTestFixture` to `UnitTestFixture`
2. Extract pure logic into standalone function
3. Remove repository/service dependencies
4. Test function directly with example inputs
5. Mock any remaining dependencies

**From Unit → Integration:**

1. Identify I/O or multi-component interaction
2. Add `IntegrationTestFixture` setup
3. Use in-memory repositories for persistence
4. Keep logic tests separate (don't merge)

---

## Troubleshooting

### "My test is too slow"

-   **If unit test:** You're probably doing I/O → move to integration
-   **If integration test:** Check if you're hitting real database → use in-memory
-   **If E2E test:** This is expected; ensure it tests something unique

### "My test is flaky"

-   **Random failures:** Check for shared state between tests
-   **Timing issues:** Remove `sleep()`, use proper async/await
-   **Database issues:** Ensure cleanup in teardown, use unique test IDs

### "Not sure which layer to use"

-   **Ask:** Can this be tested without I/O? → Unit
-   **Ask:** Does it need real database behavior? → E2E
-   **Otherwise:** Integration

---

## Further Reading

-   `backend/test/TEST_FIXTURE_GUIDE.md` - Detailed fixture usage
-   `backend/test/e2e/README.md` - E2E test setup and configuration
-   `docs/testing/test-inventory-analysis.md` - Complete test inventory

---

**Remember:** A healthy test pyramid is not about the absolute numbers, but about the right tests at the right layer. When in doubt, start with a unit test and move up only if needed.
