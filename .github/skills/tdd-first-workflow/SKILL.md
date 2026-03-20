---
name: tdd-first-workflow
description: Test-Driven Development workflow (Red → Green → Refactor cycle). Enforces mandatory TDD for all features, bug fixes, and API changes. Use when implementing runtime code changes.
---

# Test-Driven Development (TDD) First Workflow

**BLOCKING REQUIREMENT**: This skill applies to ALL coding changes that touch runtime behavior. Load this skill BEFORE writing implementation code for features, bug fixes, API changes, or refactors.

Exceptions (test-after acceptable):

- Pure documentation changes
- Configuration files with no runtime logic
- Exploratory spikes (never merge without tests)

---

## TDD Ceremony: Red → Green → Refactor

**Non-negotiable sequence for every acceptance criterion:**

### 1. RED: Write Failing Tests First

Write test(s) that express the acceptance criterion **before implementation**. Tests must fail initially.

**Checklist:**

- [ ] Define acceptance criterion in plain language
- [ ] Write test(s) expressing the criterion (Given/When/Then)
- [ ] Add test to appropriate layer (unit/integration/e2e) using decision matrix below
- [ ] Run tests → **CONFIRM FAILURE** (proves test is valid)

**Example:**

```typescript
// test/integration/movePlayer.test.ts
describe('HttpMovePlayer', () => {
    test('returns 400 when player has no current location', async () => {
        const fixture = new IntegrationTestFixture('memory')
        await fixture.setup()

        const handler = fixture.getHandler(HttpMovePlayer)
        const result = await handler.invoke({
            playerId: 'test-player',
            direction: 'north'
        })

        assert.equal(result.statusCode, 400)
        assert.ok(result.body.includes('no starting location'))
    })
})
```

### 2. GREEN: Write Minimal Code to Pass

Write the smallest possible implementation that makes the test(s) pass. No over-engineering.

**Checklist:**

- [ ] Implement only what the test requires
- [ ] Use existing patterns/utilities (don't reinvent)
- [ ] Run tests → **CONFIRM PASSING** (all tests GREEN)
- [ ] Run lint/typecheck → **CONFIRM CLEAN**

**Example:**

```typescript
// src/handlers/HttpMovePlayer.ts
export class HttpMovePlayer extends HttpHandler {
    protected async execute(@inject('IPlayerRepository') playerRepo: IPlayerRepository, request: HttpRequest): Promise<HttpResponse> {
        const player = await playerRepo.get(request.playerId)

        if (!player.currentLocationId) {
            return this.badRequest('Player has no starting location')
        }

        // ... rest of move logic
    }
}
```

### 3. REFACTOR: Clean Up While Tests Stay GREEN

Improve code quality, remove duplication, optimize—but keep all tests passing the entire time.

**Checklist:**

- [ ] Identify code quality issues (duplication, clarity, performance)
- [ ] Apply refactoring
- [ ] Run tests → **CONFIRM STILL GREEN** (no behavior change)
- [ ] Run lint/typecheck
- [ ] If tests fail → revert refactoring, debug, try again

---

## Test Layer Decision Matrix

Choose the right layer for each test. Use [TEST_FIXTURE_GUIDE.md](../../backend/test/TEST_FIXTURE_GUIDE.md) for detailed anti-patterns.

| What You're Testing                       | Fixture                  | Directory           | Persistence      | When to Use                        |
| ----------------------------------------- | ------------------------ | ------------------- | ---------------- | ---------------------------------- |
| Pure logic (sorting, parsing, validation) | `UnitTestFixture`        | `test/unit/`        | None             | Logic functions with no I/O        |
| Interface contracts (method signatures)   | `UnitTestFixture`        | `test/unit/`        | None             | Checking API shapes                |
| Repository behavior (one repo)            | `IntegrationTestFixture` | `test/integration/` | Memory or Cosmos | Repository methods, CRUD ops       |
| HTTP handlers                             | `IntegrationTestFixture` | `test/integration/` | Memory or Cosmos | Handler logic + side-effects       |
| Cross-repository workflows                | `IntegrationTestFixture` | `test/integration/` | Memory or Cosmos | Multiple repos interacting         |
| Full system with world seeding            | `E2ETestFixture`         | `test/e2e/`         | Cosmos only      | Production readiness, perf targets |
| Performance benchmarks                    | `E2ETestFixture`         | `test/e2e/`         | Cosmos only      | Load testing, latency validation   |

**Quick heuristic:**

- No storage? → Unit test
- Repository methods? → Integration test with `describeForBothModes()`
- Handler code? → Integration test
- Production perf? → E2E test (post-merge only)

---

## Happy Path + Edge Cases Requirement

For each acceptance criterion, provide at least:

1. **Happy path test**: Normal, expected behavior
2. **Edge case test**: Boundary conditions, invalid input, empty states

**Example pair:**

```typescript
describe('HttpMovePlayer direction validation', () => {
    // Happy path
    test('moves player north when direction is valid', async () => {
        const fixture = new IntegrationTestFixture('memory')
        await fixture.setup()

        const result = await fixture.invokeHandler(HttpMovePlayer, {
            playerId: 'player-1',
            direction: 'north'
        })

        assert.equal(result.statusCode, 200)
    })

    // Edge case: invalid direction
    test('returns 400 when direction is invalid', async () => {
        const fixture = new IntegrationTestFixture('memory')
        await fixture.setup()

        const result = await fixture.invokeHandler(HttpMovePlayer, {
            playerId: 'player-1',
            direction: 'diagonal' // Invalid
        })

        assert.equal(result.statusCode, 400)
    })
})
```

---

## TDD Workflow for Agents (Step-by-Step)

Apply this when implementing a feature or bug fix:

1. **Understand requirement** → extract acceptance criteria (bulleted list)

2. **For each criterion:**
    - Write failing test(s) expressing the criterion
    - Run test → confirm RED (failure)
    - Implement minimal code → run test → confirm GREEN (passing)
    - Refactor if needed → confirm GREEN still
    - Repeat for next criterion

3. **Validation checklist:**
    - [ ] All tests GREEN
    - [ ] Lint clean (`npm run lint`)
    - [ ] Typecheck clean (`npm run typecheck`)
    - [ ] Happy path tested
    - [ ] ≥1 edge case tested per criterion
    - [ ] No skipped/pending tests

4. **Before committing:**
    - [ ] Run full suite locally or CI
    - [ ] No functionality skipped to "next PR"
    - [ ] Assumptions logged (if any)

---

## Anti‑Patterns to Avoid

### ❌ Writing Implementation Before Tests

**Wrong:**

```
Write feature code → then retrofit tests → tests always pass
```

**Right:**

```
Write test (RED) → implementation (GREEN) → refactor → commit
```

### ❌ Tests That Pass Immediately

If a new test passes without implementation, the test is not testing anything. Rewrite it.

**Wrong:**

```typescript
test('handler returns response', async () => {
    const result = await handler.invoke({ id: '123' })
    // No assertions → test passes automatically ❌
})
```

**Right:**

```typescript
test('handler returns 200 on valid player', async () => {
    const result = await handler.invoke({ playerId: 'player-123' })
    assert.equal(result.statusCode, 200) // ✅ Assertion required
})
```

### ❌ Skipping the RED Phase

Don't assume you know the test will fail. Run it.

**Wrong:**

```
"I'll implement the feature, then run tests later"
```

**Right:**

```
Run test immediately after writing → confirm RED → implement
```

### ❌ Testing Implementation Details Instead of Behavior

**Wrong:**

```typescript
test('private method calls helper', async () => {
    const spy = sinon.spy(handler, 'privateHelper')
    await handler.execute()
    assert(spy.called) // ❌ Testing internal wiring
})
```

**Right:**

```typescript
test('handler correctly processes input', async () => {
    const result = await handler.execute({ input: 'data' })
    assert.equal(result.output, 'expected') // ✅ Testing behavior
})
```

---

## Self QA Checklist (Before Committing)

```
Self QA: Build <PASS/FAIL> | Lint <PASS/FAIL> | Typecheck <PASS/FAIL> | Tests <X passed / Y run> | Edge Cases Covered <yes/no> | Assumptions Logged <yes/no>
```

Example:

```
Self QA: Build PASS | Lint PASS | Typecheck PASS | Tests 8/8 passed | Edge Cases Covered yes | Assumptions Logged yes
```

---

## References

- [TEST_FIXTURE_GUIDE.md](../../backend/test/TEST_FIXTURE_GUIDE.md) — Decision matrix, fixture anti-patterns
- [copilot-instructions.md](../../.github/copilot-instructions.md) Section 10.1 — TDD-First Development (mandatory)
- [backend/AGENTS.md](../../backend/AGENTS.md) — Backend-specific patterns

---

Last reviewed: 2026-03-20
