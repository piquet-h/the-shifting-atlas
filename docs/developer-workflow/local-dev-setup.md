# Local Development Setup

This guide shows how to run the frontend SPA and the unified backend Azure Functions app.

## Prerequisites

-   Node.js >= 22 (Functions runtime currently supports 22.x; 24.x not yet available)
-   (Optional) Azure Functions Core Tools v4 (the SWA CLI will auto‑install if missing)

## Install Dependencies (npm Workspaces)

`shared/`, `backend/`, and `frontend/` are managed as **npm workspaces** from the repository root with a single `package-lock.json`. No GitHub Packages token or registry authentication is required.

Install once from the repository root and build `@piquet-h/shared` (types + prompt bundle):

```bash
npm ci
npm run build:shared
```

## Run Frontend & Backend (Recommended)

From the repository root, use either the combined in-memory dev script or two terminals:

```bash
# Single command (in-memory backend + SWA frontend emulator)
npm run dev:fullstack:memory

# Or separate terminals from repository root:
npm run dev:frontend   # Vite dev server → http://localhost:5173
npm run dev:backend    # Functions host → http://localhost:7071
```

Test an API route (implemented `ping`):

```bash
curl http://localhost:7071/api/ping
```

## Health Check Endpoints

The backend provides health check endpoints for monitoring service and persistence status:

### Backend Health

```bash
curl http://localhost:7071/api/backend/health
```

Returns general backend service health with latency metrics.

### Gremlin Health

```bash
curl http://localhost:7071/api/backend/health/gremlin
```

Returns Gremlin (Cosmos DB graph) persistence health:

**Response format:**

```json
{
    "success": true,
    "data": {
        "mode": "memory",
        "canQuery": true,
        "latencyMs": 0,
        "strictFallback": false
    },
    "correlationId": "..."
}
```

**Response fields:**

-   `mode`: Current persistence mode (`memory` or `cosmos`)
-   `canQuery`: Whether Gremlin queries can be executed successfully
-   `latencyMs`: Query latency in milliseconds (0 for memory mode)
-   `strictFallback`: Whether strict mode is enabled (`PERSISTENCE_STRICT=true`)
-   `reason`: (Optional) Failure reason if `canQuery` is false

**HTTP Status:**

-   `200 OK`: Health check succeeded (even if `canQuery=false` in non-strict mode)
-   `503 Service Unavailable`: Strict mode is enabled and Gremlin is unavailable

**Usage:**

-   Kubernetes readiness/liveness probes
-   Load balancer health checks
-   CI/CD deployment gates
-   Local development troubleshooting

If you require same‑origin local auth flows, configure a Vite proxy that forwards `/api` → `http://localhost:7071` instead of relying on the SWA emulator.

## Type Checking, Linting & Builds

Run workspace gates from the repository root:

```bash
npm run build        # shared (with prompt bundle) -> backend -> frontend
npm run lint         # ESLint + runtime invariants across all workspaces
npm run typecheck    # tsc --noEmit across all workspaces
npm test             # shared + backend + frontend unit/integration suites
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

-   Workspace dependencies installed (`npm ci` and `npm run build:shared` at repository root)
-   For Cosmos mode: Azure CLI authentication (`az login`) and appropriate Cosmos DB environment variables configured in `local.settings.json`
-   `PERSISTENCE_MODE=cosmos` must be set (or use `npm run use:cosmos` to switch)

### Idempotency

The script uses the `seedWorld` function which provides idempotency through:

-   `locationRepository.upsert()` - Creates or updates location vertices without duplicates
-   `locationRepository.ensureExit()` - Creates exits only if they don't already exist

Re-running the script will:

-   Update existing location metadata if content hash changed
-   Skip creating exits that already exist
-   Not create duplicate vertices or edges

See [Mosswell Bootstrap Script](./mosswell-bootstrap-script.md) for complete documentation including:

-   Detailed usage examples
-   Troubleshooting guide
-   Performance considerations
-   Integration with CI/CD

## Common Troubleshooting

| Symptom                                        | Fix                                                             |
| ---------------------------------------------- | --------------------------------------------------------------- |
| Port 5173 in use                               | Close previous Vite instance or set a custom port via `--port`. |
| Functions host fails to start                  | Reinstall dependencies or ensure Node 22+.                      |
| 404 on `/api/...` while using plain `vite dev` | Configure Vite proxy to backend (see `vite.config.ts`).         |

## Related Documentation

-   [Mosswell Bootstrap Script](./mosswell-bootstrap-script.md) – Detailed world seeding guide
-   [Mosswell Repository Interfaces](./mosswell-repository-interfaces.md) – Persistence contracts & patterns
-   [Mosswell Migration Workflow](./mosswell-migration-workflow.md) – Evolving world data safely
-   [Player Bootstrap Flow](./player-bootstrap-flow.md) – Player onboarding sequence
-   [Architecture Overview](../architecture/overview.md) – High-level system architecture

## E2E Integration Tests (Cosmos DB)

End-to-end integration tests validate full traversal and persistence flows against real Cosmos DB (Gremlin + SQL API).

### Running E2E Tests

```bash
cd backend

# Run E2E tests against Cosmos DB
PERSISTENCE_MODE=cosmos npm run test:e2e
```

### Environment Setup for E2E Tests

E2E tests require Cosmos DB connection configuration. The infrastructure uses a single `game` database with dedicated test isolation.

**Environment Variables:**

```bash
# Test-specific Cosmos endpoints
GREMLIN_ENDPOINT_TEST=https://your-cosmos.documents.azure.com:443/
COSMOS_SQL_ENDPOINT_TEST=https://your-cosmos.documents.azure.com:443/

# Database configuration (same database, different graph for tests)
GREMLIN_DATABASE_TEST=game         # Same database as production
GREMLIN_GRAPH_TEST=world-test      # Dedicated test graph container
COSMOS_SQL_DATABASE=game           # Same database as production (isolation via partition keys)

# Required for all Cosmos operations
PERSISTENCE_MODE=cosmos
NODE_ENV=test                      # Routes to 'test' partition
```

**Authentication:**

-   Local: `az login` (uses your Azure AD identity)
-   CI: Managed Identity or Service Principal with Cosmos DB Data Contributor role

### Test Database Strategy

**Architecture:** The infrastructure provisions:

-   Single `game` database in Gremlin account with `world` (prod) and `world-test` (test) graphs
-   Single `game` database in SQL account with shared containers (test data isolated by partition keys)

**Test Isolation:**

-   Dedicated `world-test` graph container for Gremlin test data
-   `NODE_ENV=test` routes to `test` partition
-   Test entity IDs prefixed with `e2e-` for easy identification

**Test Data Cleanup:**

-   Test graph (`world-test`) can be wiped independently from production
-   Manual cleanup via Azure Portal or scripts using logged entity IDs
-   Future enhancement: automated cleanup when repository delete methods are available

### Performance Targets (p95)

E2E tests track performance metrics against acceptance criteria:

-   Full suite: <90s
-   Single move operation: <500ms
-   LOOK query: <200ms

**Note:** Performance may vary based on Cosmos DB provisioning (RU/s) and network latency.

### CI Integration Policy

Per issue #170 acceptance criteria:

-   **On PR:** Run unit tests only (fast feedback)
-   **On merge to main:** Run E2E suite (post-merge validation)
-   **Nightly:** Run E2E + extended scenarios (cost-optimized)

This policy balances CI speed with comprehensive validation while managing Cosmos DB costs.

### Test Coverage

E2E tests validate:

-   ✓ World seeding (≥5 locations with exits)
-   ✓ Player bootstrap → location lookup → first LOOK (cold start)
-   ✓ Multi-hop traversal (move 3+ times, verify location updates)
-   ✓ Exit validation (missing exits return errors)
-   ✓ Concurrent operations (2+ players moving simultaneously)
-   ✓ Telemetry emission (Application Insights integration)
-   ✓ Cosmos throttling tolerance (429 retry handling)
-   ✓ Partition key strategy (per ADR-002)

---

_Last updated: 2026-11-14 (aligned with root npm workspaces and zero-auth public setup)_
