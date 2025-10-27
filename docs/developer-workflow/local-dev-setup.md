# Local Development Setup

This guide shows how to run the frontend SPA and the unified backend Azure Functions app.

## Prerequisites

-   Node.js >= 20
-   (Optional) Azure Functions Core Tools v4 (the SWA CLI will auto‑install if missing)

## Install Dependencies (Per Package)

The repository previously used a single root workspaces install. That indirection has been removed to make dependency graphs explicit and speed up cold boot.

Install each package directly (order does not matter):

```bash
cd frontend && npm install
cd ../backend && npm install
```

Why: keeping installs scoped prevents stale transitive locks from masking missing peer deps and reduces accidental cross‑package coupling. The root `package.json` now only carries shared scripts/metadata (no aggregate install step required).

### Accessing Internal GitHub Packages

The project consumes the `@piquet-h/shared` package from GitHub Packages. The committed root `.npmrc` only declares registry mappings; **it does not include credentials**.

Authentication paths:

1. CI / GitHub Actions: `actions/setup-node` injects auth automatically via `NODE_AUTH_TOKEN` (no action required).
2. Local (recommended): create or update your user-level `~/.npmrc`:

    ```bash
    @piquet-h:registry=https://npm.pkg.github.com
    //npm.pkg.github.com/:_authToken=<YOUR_GH_PAT_WITH_read:packages>
    ```

3. Local (ephemeral): export an environment variable for this shell session:

    ```bash
    export NODE_AUTH_TOKEN=<YOUR_GH_PAT_WITH_read:packages>
    ```

PAT Scope Requirements: `read:packages` (and `write:packages` only if you intend to publish). Avoid committing any auth line to the repository `.npmrc`—it’s intentionally absent for security.

If you see `401 Unauthorized` while installing, verify the token scope and that you’re not behind a proxy stripping headers.

## Run Frontend & Backend (Recommended)

Use two terminals (after installing each package):

```bash
cd frontend && npm run dev        # Vite dev server → http://localhost:5173
cd backend  && npm start          # Functions host → http://localhost:7071
```

Test an API route (implemented `ping`):

```bash
curl http://localhost:7071/api/ping
```

If you require same‑origin local auth flows, configure a Vite proxy that forwards `/api` → `http://localhost:7071` instead of relying on the SWA emulator.

## Frontend Only

```bash
cd frontend
npm run dev
```

## Backend

Queue/world logic (Service Bus, timers) will incrementally land here; HTTP endpoints already reside in this package.

```bash
cd backend
npm install
npm run build
npm start
```

## Type Checking & Builds

Run type checks in each package:

```bash
cd frontend && npm run typecheck
cd backend && npm run typecheck
cd shared && npm run typecheck
```

Build production frontend bundle:

```bash
cd frontend
npm run build
```

## Code Style

Code formatting (indentation, quotes, commas, semicolons) is fully automated:

-   Run `npm run format` before committing to apply Prettier.
-   CI will fail if formatting drifts—no need to memorize specific style rules.
-   Configure your editor for “Format on Save” with Prettier + EditorConfig enabled.

## Cosmos (Gremlin + SQL) via Managed Identity

Cosmos DB access now uses Azure AD (Managed Identity in Azure; your developer identity locally). There is **no key mode**.

Local steps:

1. Ensure you have Azure CLI installed and run `az login` (once per dev session).
2. Set `PERSISTENCE_MODE=cosmos` and Gremlin/SQL endpoint + database env vars in `.env.development`.
3. Start the emulator / Functions as usual. The first Gremlin query will acquire an AAD token via `DefaultAzureCredential`.

If you see `Failed to acquire AAD token for Cosmos Gremlin.` re-run `az login` or verify your account has the Cosmos DB Data Contributor role in the target subscription.

## Seeding the World Graph

An idempotent seed script is provided for initializing anchor locations and exits in the world graph. The script is safe to re-run and will not create duplicate vertices or edges.

**For detailed usage, see [Mosswell Bootstrap Script](./mosswell-bootstrap-script.md).**

### Quick Start

```bash
# Seed to Cosmos DB (production)
cd backend
npm run seed:production

# Or using direct invocation
cd backend
npx tsx scripts/seed-production.ts
```

### Prerequisites

- Backend dependencies must be installed: `cd backend && npm install`
- For Cosmos mode: Azure CLI authentication (`az login`) and appropriate Cosmos DB environment variables configured in `local.settings.json`
- `PERSISTENCE_MODE=cosmos` must be set (or use `npm run use:cosmos` to switch)

### Idempotency

The script uses the `seedWorld` function which provides idempotency through:
- `locationRepository.upsert()` - Creates or updates location vertices without duplicates
- `locationRepository.ensureExit()` - Creates exits only if they don't already exist

Re-running the script will:
- Update existing location metadata if content hash changed
- Skip creating exits that already exist
- Not create duplicate vertices or edges

See [Mosswell Bootstrap Script](./mosswell-bootstrap-script.md) for complete documentation including:
- Detailed usage examples
- Troubleshooting guide
- Performance considerations
- Integration with CI/CD

## Common Troubleshooting

| Symptom                                        | Fix                                                             |
| ---------------------------------------------- | --------------------------------------------------------------- |
| Port 5173 in use                               | Close previous Vite instance or set a custom port via `--port`. |
| Functions host fails to start                  | Reinstall dependencies or ensure Node 20+.                      |
| 404 on `/api/...` while using plain `vite dev` | Configure Vite proxy to backend (see `vite.config.ts`).         |

## Related Documentation

- [Mosswell Bootstrap Script](./mosswell-bootstrap-script.md) – Detailed world seeding guide
- [Mosswell Repository Interfaces](./mosswell-repository-interfaces.md) – Persistence contracts & patterns
- [Mosswell Migration Workflow](./mosswell-migration-workflow.md) – Evolving world data safely
- [Player Bootstrap Flow](./player-bootstrap-flow.md) – Player onboarding sequence
- [Architecture Overview](../architecture/overview.md) – High-level system architecture
## E2E Integration Tests (Cosmos DB)

End-to-end integration tests validate full traversal and persistence flows against real Cosmos DB (Gremlin + SQL API).

### Running E2E Tests

```bash
cd backend

# Run E2E tests against Cosmos DB
PERSISTENCE_MODE=cosmos npm run test:e2e
```

### Environment Setup for E2E Tests

E2E tests require Cosmos DB connection configuration. Recommended approach: use separate test database.

**Environment Variables:**

```bash
# Test-specific Cosmos endpoints (preferred)
COSMOS_GREMLIN_ENDPOINT_TEST=https://your-test-cosmos.documents.azure.com:443/
COSMOS_SQL_ENDPOINT_TEST=https://your-test-cosmos.documents.azure.com:443/
COSMOS_DATABASE_TEST=game-test
COSMOS_SQL_DATABASE_TEST=game-docs-test

# Or fallback to production endpoints (use with caution)
COSMOS_GREMLIN_ENDPOINT=https://cosmosgraph-atlas.documents.azure.com:443/
COSMOS_SQL_ENDPOINT=https://cosmossql-atlas.documents.azure.com:443/
COSMOS_GREMLIN_DATABASE=game
COSMOS_SQL_DATABASE=game-docs

# Required for all Cosmos operations
PERSISTENCE_MODE=cosmos
```

**Authentication:**
- Local: `az login` (uses your Azure AD identity)
- CI: Managed Identity or Service Principal with Cosmos DB Data Contributor role

### Test Database Strategy

**Recommended:** Use a dedicated test database (`game-test`, `game-docs-test`) that can be wiped between test runs.

**Test Data Cleanup:**
- Current implementation logs test entity IDs for monitoring
- Manual cleanup: use logged IDs to remove test data via Azure Portal or scripts
- Future enhancement: automated cleanup when repository delete methods are available

### Performance Targets (p95)

E2E tests track performance metrics against acceptance criteria:
- Full suite: <90s
- Single move operation: <500ms
- LOOK query: <200ms

**Note:** Performance may vary based on Cosmos DB provisioning (RU/s) and network latency.

### CI Integration Policy

Per issue #170 acceptance criteria:

- **On PR:** Run unit tests only (fast feedback)
- **On merge to main:** Run E2E suite (post-merge validation)
- **Nightly:** Run E2E + extended scenarios (cost-optimized)

This policy balances CI speed with comprehensive validation while managing Cosmos DB costs.

### Test Coverage

E2E tests validate:
- ✓ World seeding (≥5 locations with exits)
- ✓ Player bootstrap → location lookup → first LOOK (cold start)
- ✓ Multi-hop traversal (move 3+ times, verify location updates)
- ✓ Exit validation (missing exits return errors)
- ✓ Concurrent operations (2+ players moving simultaneously)
- ✓ Telemetry emission (Application Insights integration)
- ✓ Cosmos throttling tolerance (429 retry handling)
- ✓ Partition key strategy (per ADR-002)

## Next Steps

-   Add Service Bus + Cosmos integration (see architecture docs) once APIs are stable.
<!-- Removed forward-looking note about introducing GitHub Actions automation (workflows already exist; YAML is source of truth). -->

See also: `branching-strategy.md` for workflow guidance.

---

Changelog (doc only):

-   2025-10-19: Converted from root workspaces install to per‑package explicit installs; removed `--workspaces` examples; clarified rationale.
