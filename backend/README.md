# Backend (Azure Functions – future async world services)

This project is an intentionally thin placeholder. Only trivial health/echo handlers exist in `src/index.ts`. Player onboarding & traversal currently live in the co‑located Static Web Apps API under `frontend/api/`.

Why keep this now?

- Establishes the separation point for when queue‑triggered world simulation and heavier domain logic outgrow the SWA managed API.
- Lets infra (deploy, IaC, observability) evolve without a disruptive split later.

Planned structure (activated once first queue/world feature lands):

```
backend/
  HttpPlayerActions/   # Direct HTTP verbs that truly need isolation
  QueueWorldLogic/     # Queue-triggered world / NPC / economy events
  shared/              # Gremlin client, validation, constants
```

## When To Add Code Here

Add a function ONLY if it:

1. Requires a trigger type not supported in SWA (e.g. Service Bus Queue / Timer), or
2. Performs work whose cold start / execution profile should not impact player‑facing latency, or
3. Needs independent deployment cadence.

Otherwise keep HTTP endpoints inside `frontend/api` to minimize cognitive & deployment overhead during MVP.

## Minimal Dev Loop

```
npm install
npm start   # builds then starts the Functions host
```

No additional docs for examples—refer to `src/index.ts` or copy patterns from the SWA API. Avoid adding provisional onboarding examples here (they were removed to prevent drift).

## Roadmap Snapshot (High Level)

| Area                 | Status  | First Addition in This App |
| -------------------- | ------- | -------------------------- |
| Queue world events   | Pending | NPC tick / movement queue  |
| Cosmos integration   | Pending | Graph write helper module  |
| Telemetry enrichment | Pending | Custom world event events  |
| Auth propagation     | Pending | Principal claim validation |

## Notes

Until one of the above lands this package deploys an almost empty artifact (negligible cost / risk). Keeping the scaffold explicit avoids surprise architectural shifts later.
