# E2E Tests

End-to-end tests for The Shifting Atlas using Playwright.

## Test Files

### critical-flows.spec.ts

Core user flows that must work for the game to be playable:
- Game page load with location display
- Navigation via button click
- Command input and processing
- Authentication flow

### frontier-arrival.spec.ts

Frontier arrival UX contract tests validating the "no retry loop" experience:

1. **Full Flow with Pending Exits**
   - Player moves to frontier location
   - Backend marks exits as `pending`
   - UI simulates auto-refresh behavior
   - Pending exits become `hard` without manual retry

2. **Forbidden Direction Handling**
   - Forbidden exits are included in response
   - UI remains stable (no auto-refresh for forbidden)
   - No retry CTA appears

3. **Bounded Refresh Attempts**
   - Auto-refresh is bounded (max ~10 attempts in 20 seconds)
   - Prevents unbounded request loops
   - System remains stable with slow generation

4. **Navigation During Refresh**
   - Player can navigate away during pending state
   - Timers are cleared (no memory leaks)
   - Page remains functional

**Note:** These tests validate the UX contract using mock responses. The actual UI implementation of auto-refresh and exit availability visual treatment is tracked in issues #806, #809, #810.

## Running Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run specific test file
npx playwright test critical-flows.spec.ts
npx playwright test frontier-arrival.spec.ts

# Run with UI (headed mode)
npx playwright test --headed

# Debug mode
npx playwright test --debug
```

## Test Strategy

### Mocking Approach

All tests use Playwright's `page.route()` to intercept and mock API calls:
- Consistent, deterministic responses
- Fast execution (no real backend needed)
- Full control over state transitions

### Contract Validation

Tests validate **contracts** rather than implementation details:
- Frontend receives correct data shapes
- User flows complete successfully
- Error states are handled gracefully

### Intentional Timeouts

Some tests use fixed timeouts deliberately:
- **Proving absence of behavior**: e.g., forbidden exits should NOT trigger auto-refresh
- **Validating bounded behavior**: e.g., refresh attempts should stop after reasonable time
- **Stability validation**: e.g., system remains stable during expected operation periods

These are marked with `// INTENTIONAL TIMEOUT:` comments explaining the rationale.

## Test Data

Mock responses are defined inline within test files for clarity and maintainability. Key mock data includes:

- **Starter Location**: Mosswell River Jetty (well-known starting point)
- **Frontier Location**: Location with pending exits to test generation flow
- **Exit States**: `hard`, `pending`, `forbidden` (from shared/src/exitAvailability.ts)

## CI Integration

E2E tests run in GitHub Actions:
- Static site build using `vite.e2e.config.ts`
- Chromium browser only (Firefox/Safari deferred)
- Screenshot on failure
- Trace collection on retry

See `.github/workflows/e2e-integration.yml` for CI configuration.

## Debugging Failed Tests

1. **View screenshots**: `test-results/` directory contains screenshots on failure
2. **View trace**: Use `npx playwright show-trace test-results/<test-name>/trace.zip`
3. **Run in headed mode**: `npx playwright test --headed` to see browser
4. **Use debug mode**: `npx playwright test --debug` for step-by-step execution

## Adding New Tests

1. Create new `.spec.ts` file in this directory
2. Import `test` and `expect` from `@playwright/test`
3. Define mock responses and helper functions
4. Write test scenarios using `test.describe()` and `test()`
5. Use semantic selectors (prefer `getByRole`, `getByText` over `getByTestId`)
6. Add documentation to this README

## Related Documentation

- Frontend Architecture: `../README.md`
- Playwright Config: `../playwright.config.ts`
- E2E Build Config: `../vite.e2e.config.ts`
- CI/CD Workflows: `../../docs/developer-workflow/ci-cd.md`
