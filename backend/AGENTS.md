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
- All `COSMOS_SQL_CONTAINER_*` variables — see `backend/src/persistenceConfig.ts` for the authoritative list (do not duplicate here)

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
- Keep `@piquet-h/shared` on published registry versions, not `file:` references (warned by `verify:invariants`).
- Long-lived retained timers should call `.unref()`; lint now warns via `timer-unref-required`.
