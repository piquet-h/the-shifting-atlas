# Scripts Directory

Automation scripts for The Shifting Atlas project.

## Telemetry & Metrics (Stage 1)

**CRITICAL**: Build automation scripts use `shared/build-telemetry.mjs` (NOT game telemetry).

### Implementation Order Automation

- **`assign-impl-order.mjs`** - Assign or recalculate implementation order for an issue

    ```bash
    npm run assign:impl-order -- --issue 123
    npm run assign:impl-order -- --issue 123 --apply
    ```

    - Emits telemetry: `build.ordering_applied`, `build.ordering_low_confidence`
    - Saves artifacts to `artifacts/ordering/`
    - Prunes old artifacts (keeps last 200)

- **`check-ordering-integrity.mjs`** - Validate contiguous ordering (1..N)

    ```bash
    npm run check:ordering-integrity
    ```

    - Exits non-zero on gaps/duplicates
    - Run in CI to prevent violations

- **`detect-ordering-overrides.mjs`** - Detect manual changes within 24h

    ```bash
    npm run detect:ordering-overrides
    ```

    - Emits telemetry: `build.ordering_overridden`
    - Compares artifacts to identify overrides

- **`weekly-ordering-metrics.mjs`** - Generate weekly metrics summary
    ```bash
    npm run metrics:weekly
    npm run metrics:weekly -- --days 14
    ```

    - Reads artifacts from `artifacts/ordering/`
    - Outputs: processed count, confidence breakdown, override rate

### Testing & Validation

- **`test-ordering-telemetry.mjs`** - Test ordering telemetry functionality

    ```bash
    npm run test:ordering
    ```

    - 4 test cases: telemetry emission, artifact pruning, metrics, constants

- **`validate-telemetry-separation.mjs`** - Validate telemetry separation rules
    ```bash
    npm run validate:telemetry-separation
    ```

    - Checks for violations (build events in game telemetry, etc.)
    - Runs in CI (lint-typecheck job)

## Project Management

- **`sync-implementation-order.mjs`** - Sync Project field to docs

    ```bash
    npm run sync:impl-order:validate
    npm run sync:impl-order:apply
    npm run sync:impl-order:next
    ```

- **`sync-labels.mjs`** - Sync labels across repository

    ```bash
    npm run sync:labels
    ```

- **`update-issue-status.mjs`** - Update issue status in Project
    ```bash
    npm run update:issue-status
    ```

## Scheduling (Stage 2)

- **`schedule-roadmap.mjs`** - Apply provisional schedules

    ```bash
    npm run schedule:roadmap
    ```

- **`post-provisional-schedule.mjs`** - Post provisional schedule to issue
- **`calculate-variance.mjs`** - Calculate schedule variance
- **`create-variance-alert.mjs`** - Create variance alert

## Documentation & Analysis

- **`analyze-doc-drift.mjs`** - Detect reprioritization signals from docs
- **`format-drift-comment.mjs`** - Format drift analysis for PR comments
- **`di-suitability.mjs`** - Analyze dependency injection suitability
    ```bash
    npm run analyze:di
    ```

## Build & Deploy

- **`clean.mjs`** - Clean build artifacts

    ```bash
    npm run clean
    ```

- **`verify-deployable.mjs`** - Verify deployment readiness

    ```bash
    npm run verify:deployable
    ```

- **`seed-world.mjs`** - Seed world data
    ```bash
    npm run seed:world
    ```

## Shared Modules

See [`shared/README.md`](./shared/README.md) for documentation on:

- `build-telemetry.mjs` - Build automation telemetry
- `duration-estimation.mjs` - Duration estimation
- `provisional-storage.mjs` - Provisional schedule storage
- `provisional-comment.mjs` - Provisional schedule comments
- `project-utils.mjs` - Project API utilities
- `pagination.mjs` - GraphQL pagination helpers

## Telemetry Separation Rules

**CRITICAL**: Never mix build and game telemetry.

- **Build telemetry**: `shared/build-telemetry.mjs`
    - Events: `build.*` (e.g., `build.ordering_applied`)
    - Destination: GitHub artifacts
    - Use in: `scripts/` folder only

- **Game telemetry**: `../../shared/src/telemetry.ts`
    - Events: `Domain.Subject.Action` (e.g., `Player.Get`)
    - Destination: Application Insights
    - Use in: `shared/src/` folder only

See [`../docs/developer-workflow/build-telemetry.md`](../docs/developer-workflow/build-telemetry.md) for details.

## Development

All scripts use ES modules (`.mjs` extension). Common patterns:

```javascript
import { parseArgs } from 'node:util'

const { values } = parseArgs({
    options: {
        issue: { type: 'string' },
        apply: { type: 'boolean', default: false }
    }
})
```

Environment variables:

- `GITHUB_TOKEN` / `GH_TOKEN` - Required for GitHub API access
- `PROJECT_OWNER` - Project owner (default: 'piquet-h')
- `PROJECT_NUMBER` - Project number (default: 3)
- `TELEMETRY_ARTIFACT` - Path to write telemetry artifact

## Testing

Run all tests:

```bash
npm test
```

Run specific tests:

```bash
npm run test:ordering
npm run test:issue-status
npm run test:build-telemetry-guard
```

Validate automation:

```bash
npm run validate:telemetry-separation
npm run check:ordering-integrity
```
