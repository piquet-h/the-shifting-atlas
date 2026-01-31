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

- Too many E2E tests = slow CI, flaky tests, hard to debug
- Too few unit tests = missed edge cases, hard to refactor

**Healthy Pyramid** (✅ GOOD):

- Fast feedback on logic errors (unit tests catch 70% of bugs)
- Medium feedback on integration issues (integration tests catch 25%)
- Slow feedback on production readiness (E2E tests validate 5%)

---

## Layer 1: Unit Tests

### Purpose

Test **pure logic** in isolation with all dependencies mocked.

### When to Write Unit Tests

✅ **DO write unit tests for:**

- Pure functions (input → output, no side effects)
- Business logic (calculation, validation, transformation)
- Edge case handling (null, empty, boundary conditions)
- Error formatting and response structure
- Data model validation
- Helper utilities

❌ **DON'T write unit tests for:**

- Database queries (use integration tests)
- HTTP request handling (use integration tests)
- External API calls (use integration tests)
- File I/O operations (use integration tests)

### Example: Good Unit Test

Avoid embedding unit test examples here—prefer the real tests as the source of truth:

- `backend/test/unit/**.test.ts` (pure logic, validation, formatting)
- Fixture patterns: `backend/test/TEST_FIXTURE_GUIDE.md`

### Fixture Pattern

Fixture usage and conventions live in `backend/test/TEST_FIXTURE_GUIDE.md`.

### Characteristics

- ⚡ **Speed:** <50ms per test
- 🎯 **Scope:** Single function or class
- 🔧 **Mocking:** All dependencies mocked
- 📊 **Coverage:** 70-80% of total tests

---

## Layer 2: Integration Tests

### Purpose

Test **service layer integration** with in-memory repositories and mocked external dependencies.

### When to Write Integration Tests

✅ **DO write integration tests for:**

- Service orchestration (multiple components working together)
- Repository contracts (interface compliance)
- HTTP request/response flows (envelope structure)
- Telemetry emission (event tracking)
- DI container setup (dependency resolution)
- Complex business workflows (multi-step processes)
- Database-like operations (using in-memory implementations)

❌ **DON'T write integration tests for:**

- Real database performance (use E2E)
- Real database concurrency (use E2E)
- External API calls (mock them)
- Pure logic (use unit tests)

### Example: Good Integration Test

Prefer real integration tests over embedded examples:

- Integration fixture: `backend/test/helpers/IntegrationTestFixture.ts`
- Representative integration tests live in `backend/test/integration/**.test.ts`

### Fixture Modes

Fixture modes and the “why” behind them are documented in `backend/test/TEST_FIXTURE_GUIDE.md`.

### Characteristics

- ⚡ **Speed:** <100ms per test
- 🎯 **Scope:** Multiple components, service layer
- 🔧 **Mocking:** External dependencies mocked, in-memory persistence
- 📊 **Coverage:** 15-25% of total tests

---

## Layer 3: E2E Tests

### Purpose

Test **critical user journeys** with real database and production-like infrastructure.

### When to Write E2E Tests

✅ **DO write E2E tests for:**

- Critical user journeys (golden path: move → look → interact)
- Real database behavior (Cosmos DB latency, throttling, consistency)
- Production readiness validation (can it handle real traffic?)
- Performance benchmarking (p95 latency targets)
- Cross-service integration (multiple services working together)
- Database concurrency (race conditions, locking)
- Infrastructure validation (partition keys, connection pooling)

❌ **DON'T write E2E tests for:**

- Input validation (use unit or integration tests)
- Error handling (use unit or integration tests)
- Edge cases (use unit tests)
- Business logic permutations (use unit tests)
- Telemetry emission (use integration tests)

### Example: Good E2E Test

Prefer real E2E tests over embedded examples:

- E2E fixture: `backend/test/e2e/E2ETestFixture.ts`
- Representative E2E tests: `backend/test/e2e/**.test.ts` (for example `backend/test/e2e/cosmos.e2e.test.ts`)

### Fixture Setup

E2E setup details belong with the fixture and E2E README:

- `backend/test/e2e/README.md`
- `backend/test/e2e/E2ETestFixture.ts`

### Characteristics

- ⚡ **Speed:** 500ms-5s per test
- 🎯 **Scope:** Full stack, real infrastructure
- 🔧 **Mocking:** Nothing mocked (uses real Cosmos DB)
- 📊 **Coverage:** 5-10% of total tests
- 💰 **Cost:** Azure Cosmos DB RU consumption

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

Keep the decision tree above as the primary guidance; concrete scenarios drift quickly—use existing tests as examples.

---

## Common Pitfalls

### ❌ Anti-Pattern #1: Unit Testing I/O

If a test touches I/O, it isn’t a unit test. Move it up a layer.

**Fix:** Move to integration test with in-memory repository or E2E test with real database.

### ❌ Anti-Pattern #2: E2E Testing Edge Cases

Avoid using E2E to validate basic input rules; those belong in unit/integration.

**Fix:** Move to unit test for validation logic or integration test for HTTP envelope.

### ❌ Anti-Pattern #3: Integration Testing Without Mocks

Integration tests should not depend on live external APIs.

**Fix:** Mock external API in integration test or move to E2E with recorded fixtures.

---

## Test Coverage Guidelines

### What to Measure

✅ **DO measure:**

- Line coverage (goal: >80%)
- Branch coverage (goal: >75%)
- Function coverage (goal: >90%)
- Critical path coverage (goal: 100%)

❌ **DON'T obsess over:**

- 100% coverage (diminishing returns)
- Coverage of trivial getters/setters
- Coverage of third-party libraries

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

- **Per test:** <50ms
- **Total suite:** <5 seconds
- **Failure impact:** Block PR if failing

### Integration Tests

- **Per test:** <100ms
- **Total suite:** <10 seconds
- **Failure impact:** Block PR if failing

### E2E Tests

- **Per test:** 500ms-5s
- **Total suite:** <90 seconds
- **Failure impact:** Block merge to main if failing

### Performance Degradation Detection

Performance tracking is implemented in the E2E fixture (`backend/test/e2e/E2ETestFixture.ts`).

---

## CI/CD Integration

### PR Checks (Fast Feedback)

- Lint & Typecheck
- Unit Tests
- Integration Tests
- **Total: <2 minutes**

### E2E Checks (Comprehensive Validation)

- Run on: PR + merge to main
- Execution Time: <90 seconds
- Cost: Minimal (dedicated test database)

### Nightly Checks (Future)

- Extended E2E scenarios
- Load testing
- Performance regression detection

---

## Code Review Checklist

When reviewing test PRs, check:

- [ ] Is the test at the right layer? (Unit/Integration/E2E)
- [ ] Does it test one thing? (Single responsibility)
- [ ] Is it deterministic? (No flakiness)
- [ ] Does it have clear assertions? (Not just "doesn't throw")
- [ ] Is setup/teardown handled properly? (Fixtures)
- [ ] Are mocks used appropriately? (Not in E2E)
- [ ] Is performance tracked? (E2E tests only)
- [ ] Is it documented? (Clear test names, comments for complex logic)

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

- **If unit test:** You're probably doing I/O → move to integration
- **If integration test:** Check if you're hitting real database → use in-memory
- **If E2E test:** This is expected; ensure it tests something unique

### "My test is flaky"

- **Random failures:** Check for shared state between tests
- **Timing issues:** Remove `sleep()`, use proper async/await
- **Database issues:** Ensure cleanup in teardown, use unique test IDs

### "Not sure which layer to use"

- **Ask:** Can this be tested without I/O? → Unit
- **Ask:** Does it need real database behavior? → E2E
- **Otherwise:** Integration

---

## Further Reading

- `backend/test/TEST_FIXTURE_GUIDE.md` - Detailed fixture usage
- `backend/test/e2e/README.md` - E2E test setup and configuration
- `docs/testing/test-inventory-analysis.md` - Complete test inventory

---

**Remember:** A healthy test pyramid is not about the absolute numbers, but about the right tests at the right layer. When in doubt, start with a unit test and move up only if needed.
