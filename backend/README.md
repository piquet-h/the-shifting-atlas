# Backend (Azure Functions – scaffolding)

This workspace is reserved for the future separated Functions app (world events, queue processors, richer HTTP endpoints). Today it contains:

- Minimal example handlers (`BackendHealth`, `BackendPing`) in `src/index.ts`.
- A provisional onboarding endpoint `playerBootstrap` (`GET /api/player/bootstrap`) that allocates or confirms a guest `playerGuid` (in‑memory store for PR1; will be replaced by Cosmos graph persistence). See `src/functions/playerBootstrap.ts`.

Why keep it now?

- Enforces separation point once queue + world logic move out of `frontend/api`.
- Lets CI / infra evolve without a large refactor later.

Planned structure (aligned with domain docs):

```
backend/
  HttpPlayerActions/   # HTTP player commands (move, look, interact)
  QueueWorldLogic/     # Queue-triggered world / NPC / economy events
  shared/              # Reusable helpers (Gremlin client, validation, constants)
```

## Scripts (package.json)

Scripts:

- `npm run build` – compile TS (`src` -> `dist`)
- `npm start` – build then run Functions host

## Local Development

When actual logic is added:

1. `npm install`
2. `npm run start` (build + Functions host)

During early phase prefer the SWA co‑located API in `frontend/api` for simple endpoints. Only add code here when a concern clearly doesn’t belong in the website API (e.g., long‑running queue processing).

Adding a temporary HTTP function (for experimentation): extend `src/index.ts` or add a new file under `src/functions/` with an `app.http(...)` registration. Delete or migrate experimental handlers promptly.

### Onboarding Bootstrap (MVP Notes)

`GET /api/player/bootstrap`

Response:

```jsonc
{"playerGuid": "<guid>", "created": true}
```

- Client may send header `x-player-guid: <guid>` to attempt idempotent reuse.
- If header value unknown, a new in-memory record is created (treated as created=true).
- Emits telemetry event `Onboarding.GuestGuidCreated` (Application Insights) when a new GUID is allocated.
- This is a **temporary** implementation; persistence will move to Cosmos DB (Gremlin) in a follow-up PR.

## Environment & Settings

`local.settings.json` is intentionally sparse. Expected future additions:

- Cosmos (prefer managed identity over keys once runtime integration exists)
- Service Bus connection / namespace
- Feature flags (enable experimental modules)

Identity (future): Microsoft Entra External Identities for player auth. Plan: validate ID tokens in HTTP Functions (claims-based authorization), then issue gameplay session tokens if needed.

## Roadmap

Status / roadmap snapshot:

- DONE: Basic health + echo
- NEXT: Player command handler → enqueue event (once queue infra added)
- Queue world processor (NPC patrols / environmental shifts)
- Cosmos graph helpers (`shared/graph.ts`)
- Tests (Node `--test`) for graph + movement logic

## Notes

Until logic lands here, infrastructure deploys an essentially empty artifact (low cost footprint).
