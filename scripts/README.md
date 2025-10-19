# Scripts Directory

Automation scripts currently retained. All former predictive scheduling, ordering, provisional date, and variance tooling has been permanently removed (stubs kept only for historical provenance).

## Active Scripts

### Validation

- **`validate-telemetry-separation.mjs`** – Enforces build vs game telemetry boundary.

### Testing

- **`smoke-traversal.mjs`** - Smoke test for traversal movement loop

    Tests the basic game flow: bootstrap → look → move → look
    Verifies at least 2 distinct location IDs are reachable
    
    ```bash
    npm run smoke:traversal
    ```
    
    Exit codes:
    - 0: Success (all steps passed)
    - 1: Failure (any step failed)

### Build & Deploy

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

## Retired Automation (Historical)

Legacy modules (ordering assignment, provisional scheduling & variance, integrity / override detection, doc drift analysis, DI suitability, related telemetry helpers) are retired. They MUST NOT be reinstated without a new ADR explicitly approving a fresh design.

Rationale: Manual milestone + scope based prioritization proved simpler, clearer, and cheaper to maintain than predictive heuristics.

## Telemetry Separation Rules (Still Active)

**CRITICAL**: Never mix build and game telemetry.

- **Build telemetry**: `shared/build-telemetry.mjs` (minimal — no scheduling / ordering / variance events emitted)
    - Prefix reserved: `build.*` (introduce new events only after review; do NOT restore deprecated names)
    - Destination: GitHub artifacts
    - Scope: `scripts/` folder only

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

Validation:

```bash
npm run validate:telemetry-separation
```
