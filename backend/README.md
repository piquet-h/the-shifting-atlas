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

No additional docs for examples—refer to `src/index.ts` or copy patterns from the SWA API. Avoid adding provisional onboarding examples here (they were removed to prevent drift).

## Roadmap Snapshot (High Level)

| Area                 | Status      | Notes                                    |
| -------------------- | ----------- | ---------------------------------------- |
| HTTP player/actions  | Implemented | Unified here (migrated from SWA API)     |
| Queue world events   | Pending     | Introduce Service Bus & processors       |
| Cosmos integration   | Pending     | Graph (Gremlin) + SQL repositories       |
| Telemetry enrichment | Ongoing     | Add world event emission instrumentation |
| Auth propagation     | Pending     | Enforce claims / roles on sensitive ops  |

## Notes

Until one of the above lands this package deploys an almost empty artifact (negligible cost / risk). Keeping the scaffold explicit avoids surprise architectural shifts later.
