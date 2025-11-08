# Backend (Azure Functions – unified game API)

This project now hosts ALL HTTP endpoints (player bootstrap, player CRUD/link, movement, location lookups, health) and will expand with queue‑triggered world simulation and NPC/economy processors.

Rationale for unification:

- Consistent deployment & telemetry surface (no split between SWA managed API and standalone Functions).
- Enables introduction of non‑HTTP triggers (Service Bus, Timer) without architectural migration later.
- Simplifies local development (single Functions host for domain logic).

Planned additional structure (as async systems land):

```
backend/
  src/functions/         # All HTTP + future trigger handlers
  src/world/              # (Future) world event composition helpers
  src/graph/              # (Future) Gremlin / SQL persistence adapters
  shared/                 # Reusable validation & telemetry helpers
```

## API Endpoints

API contracts are defined in TypeScript interfaces (`shared/src/apiContracts.ts`). Route patterns are declared in `src/functions/*.ts`. Request/response validation and behavior is documented through handler code and integration tests (`test/integration/restfulEndpoints.test.ts`).

## Adding New Functions

Add a function when it:

1. Implements a new domain action (HTTP) with clear validation + telemetry, or
2. Consumes a queue/event (Service Bus / Timer) to evolve world state, or
3. Provides infrastructure/health/meta endpoints required by ops.

Design constraints:

- Must be stateless; all state persisted to Cosmos (Gremlin / SQL) or emitted as events.
- Telemetry event names use the shared enumeration; do not inline literal strings.
- Direction / movement validation must reuse shared validators (no ad‑hoc lists).

## Minimal Dev Loop

```
npm install
npm start   # builds then starts the Functions host
```

## Running Tests

Tests support both in-memory and Cosmos DB persistence modes:

```bash
# Run tests (defaults to memory mode)
npm test

# Explicitly use memory mode (fast, no external dependencies)
npm run test:memory

# Use Cosmos DB mode (requires valid Azure credentials)
npm run test:cosmos
```

**Important:** The test runner automatically loads configuration from `local.settings.json`. If this file doesn't exist, tests will default to memory mode.

### Why Tests Might Run Slowly

If your tests are running slowly when you expect memory mode:

1. Check if `local.settings.json` exists:

    ```bash
    cat local.settings.json
    ```

2. If it shows `"PERSISTENCE_MODE": "cosmos"`, switch to memory mode:

    ```bash
    npm run use:memory
    ```

3. Verify tests are using memory mode by checking the test output:
    ```
    ✓ Loaded local.settings.json: PERSISTENCE_MODE=memory
    ```

The `local.settings.json` file is created by:

- `npm run use:memory` - copies `local.settings.memory.json` to `local.settings.json`
- `npm run use:cosmos` - copies `local.settings.cosmos.json` to `local.settings.json`
- `func start` (Azure Functions CLI) - may create it based on your environment

**Tip:** Run `npm run use:memory` before running tests to ensure fast execution.

## Deployment

Deployment details live exclusively in the workflow YAML under `.github/workflows/backend-functions-deploy.yml`. Read that file for triggers, required permissions, and steps. Required Azure resources are provisioned via Bicep in `infrastructure/`. No duplicated narrative here to avoid drift.

## Roadmap Snapshot (High Level)

| Area                 | Status      | Notes                                                                  |
| -------------------- | ----------- | ---------------------------------------------------------------------- |
| HTTP player/actions  | Implemented | Unified here (migrated from SWA API)                                   |
| Queue world events   | Pending     | Introduce Service Bus & processors                                     |
| Cosmos integration   | Pending     | Graph (Gremlin) + SQL repositories                                     |
| Telemetry enrichment | Ongoing     | Add world event emission instrumentation + span enrichment (Epic #310) |
| Auth propagation     | Pending     | Enforce claims / roles on sensitive ops                                |

## Notes

Until one of the above lands this package deploys an almost empty artifact (negligible cost / risk). Keeping the scaffold explicit avoids surprise architectural shifts later.
Refer to `.github/copilot-instructions.md` Section 12.1 for dependency policy: never use `file:` references to `@piquet-h/shared`; always consume registry version (validated by `scripts/validate-package-refs.mjs`).
