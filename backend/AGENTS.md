# AGENTS.md (Backend)

This file provides **backend-specific** guidance for AI coding agents.

It is intended to apply when editing anything under `backend/`.

## Scope

- This package is the Azure Functions backend (HTTP player actions + queue-triggered world processing).
- Follow the detailed backend delta rules in `../.github/instructions/backend/.instructions.md` (authoritative).
- Prefer minimal, test-driven changes.

## Fast orientation

- Backend overview and local workflow: `backend/README.md`
- Detailed backend implementation conventions: `../.github/instructions/backend/.instructions.md`
- Cross-cutting rules (telemetry, shared package policy, etc.): `../.github/copilot-instructions.md`

## Local dev (preferred)

- Install deps from `backend/`: `npm install`
- Start watch/dev loop: `npm run watch` (or `npm start` if that is the current canonical script)
- Run Functions host locally: `func host start` (or `npm start` if the script wraps it)

If you need to choose persistence mode for tests/dev, use the provided scripts:

- `npm run use:memory` (fast, no external dependencies)
- `npm run use:cosmos` (requires Azure AD credentials)

## Backend configuration quick reference

Authoritative source of truth for what the backend reads:

- `backend/src/persistenceConfig.ts`
- `backend/local.settings*.json`

### Persistence mode

- `PERSISTENCE_MODE`: `memory` (default) or `cosmos`

### Cosmos DB (SQL API)

Required (Cosmos mode):

- `COSMOS_SQL_ENDPOINT`
- `COSMOS_SQL_DATABASE`
- `COSMOS_SQL_CONTAINER_PLAYERS`
- `COSMOS_SQL_CONTAINER_INVENTORY`
- `COSMOS_SQL_CONTAINER_LAYERS`
- `COSMOS_SQL_CONTAINER_EVENTS`

Common additional containers (may have defaults in code, but set explicitly in `local.settings*.json` when available):

- `COSMOS_SQL_CONTAINER_PROCESSED_EVENTS`
- `COSMOS_SQL_CONTAINER_DEADLETTERS`
- `COSMOS_SQL_CONTAINER_EXIT_HINT_DEBOUNCE`
- `COSMOS_SQL_CONTAINER_TEMPORAL_LEDGER`
- `COSMOS_SQL_CONTAINER_WORLD_CLOCK`
- `COSMOS_SQL_CONTAINER_LOCATION_CLOCKS`
- `COSMOS_SQL_CONTAINER_LORE_FACTS`

### Cosmos DB (Gremlin)

When Gremlin is used, the backend accepts any of these endpoint variables:

- `COSMOS_GREMLIN_ENDPOINT` (preferred)
- `COSMOS_ENDPOINT` (legacy fallback)
- `GREMLIN_ENDPOINT` (legacy fallback)

### Azure Service Bus (queue triggers)

Queue-triggered functions bind using `connection: 'ServiceBusAtlas'`.

Configure Service Bus via:

- `ServiceBusAtlas__fullyQualifiedNamespace`

## Testing expectations

- Backend changes should have tests (TDD for runtime logic changes).
- Respect the test layering guidance (unit vs integration) described in `../.github/copilot-instructions.md` and backend test fixtures.

## High-signal guardrails

- Do not block HTTP handlers on long-running work; enqueue async events instead.
- Do not create Cosmos/Service Bus clients per invocation; reuse module-scope singletons.
- Never switch backend dependency `@piquet-h/shared` to a `file:` reference.
- Avoid adding new long-running timers unless they are `.unref()`’d (tests must exit cleanly).
