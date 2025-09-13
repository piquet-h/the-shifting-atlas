# Backend (Azure Functions) – Placeholder

This directory currently holds only the scaffolding (`host.json`, `local.settings.json`, `package.json`). No actual Functions are implemented yet.

Planned structure (mirrors design docs / persistent world model):

```
backend/
	HttpPlayerActions/    # HTTP-triggered functions handling player commands (move, look, interact)
	QueueWorldLogic/      # Queue-triggered functions processing NPC ticks, world events
	shared/               # Reusable utilities: Cosmos graph client (Gremlin), validation, constants
```

## Scripts (package.json)

Current scripts reference non-existent subfolders and will fail until those folders exist:

- `npm run start` – starts Functions host at repo root (no functions yet)
- `npm run start:http` – expects `./http-app` (to be replaced with `HttpPlayerActions`)
- `npm run start:worker` – expects `./worker-app` (to be replaced with `QueueWorldLogic`)

These will be updated once the actual directories are created.

## Local Development (Future)

1. Add Functions (e.g. `HttpMovePlayer/index.js`).
2. Install deps: `npm install` (shared modules may be plain JS initially; later a workspace setup / build step could appear).
3. Start host: `npm start` or run individually via `func start --script-root <folder>`.

## Environment & Settings

`local.settings.json` is currently minimal. Future keys:

- `COSMOS_ENDPOINT`, `COSMOS_KEY` (or managed identity + database/graph names)
- `SERVICE_BUS_CONNECTION` (or identity + namespace)
- Feature flags for modules (economy, traversal experimentation)

## Roadmap

- Add first HTTP action: health / echo to validate pipeline.
- Implement player movement with optimistic validation.
- Introduce queue event for NPC patrol tick.
- Add tests (Node `--test`) for shared utility modules.

## Notes

Until real Functions are added, deployment templates will create essentially empty Function Apps.
