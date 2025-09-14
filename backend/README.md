# Backend (Azure Functions v4, TypeScript)

TypeScript Azure Functions backend. Initial HTTP functions live in `src/index.ts` (`BackendHealth`, `BackendPing`). Queue & world logic will follow in dedicated folders. During early development most player-facing endpoints are still co-located under `frontend/api` and served via the SWA emulator (`npm run swa`). This package exists to prepare for separation of concerns (world simulation, queues, graph access).

Planned structure (mirrors design docs / persistent world model):

```
backend/
	HttpPlayerActions/    # HTTP-triggered functions handling player commands (move, look, interact)
	QueueWorldLogic/      # Queue-triggered functions processing NPC ticks, world events
	shared/               # Reusable utilities: Cosmos graph client (Gremlin), validation, constants
```

## Scripts (package.json)

Scripts:

- `npm run build` – compile TS (`src` -> `dist`)
- `npm start` – build then run Functions host

## Local Development

Standalone (when adding or testing backend-only logic):

1. Install deps: `npm install`
2. Build: `npm run build`
3. Start: `npm start`

While the unified SWA workflow (`npm run swa` at repo root) is primary for front-end + co-located API, you can run both concurrently if exploring new backend endpoints not yet proxied by SWA.

Adding a new HTTP function: extend `src/index.ts` with another `app.http(...)` call or create an additional module imported from there; keep handlers small and stateless.

## Environment & Settings

`local.settings.json` is currently minimal. Future keys:

- `COSMOS_ENDPOINT`, `COSMOS_KEY` (or managed identity + database/graph names)
- `SERVICE_BUS_CONNECTION` (or identity + namespace)
- Feature flags for modules (economy, traversal experimentation)

## Roadmap

- DONE: Health / echo validation.
- Player movement endpoint → enqueue world event.
- Queue world processor (NPC patrol tick, environmental shifts).
- Cosmos graph integration helpers (shared/graph.ts).
- Tests (Node `--test`) for shared utilities + first movement logic.

## Notes

Until real Functions are added, deployment templates will create essentially empty Function Apps.
