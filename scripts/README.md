# Scripts Directory

Automation scripts currently retained (legacy ordering / scheduling / variance / DI suitability tooling has been removed or stubbed).

## Active Scripts

### Validation

- **`validate-telemetry-separation.mjs`** – Enforces build vs game telemetry boundary.

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

## Deprecated (Historical) Modules

The following historical modules/scripts are deprecated and retained only as stubs for provenance: ordering assignment, integrity / override detection, scheduling (provisional, variance), doc drift analysis, DI suitability, and related telemetry helpers.

They MUST NOT be reactivated without an updated architectural decision and documentation refresh.

## Telemetry Separation Rules (Still Active)

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

Validation:

```bash
npm run validate:telemetry-separation
```
