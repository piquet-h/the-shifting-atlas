# Local Development Setup

This guide shows how to run the frontend SPA and the unified backend Azure Functions app.

## Prerequisites

- Node.js >= 20
- (Optional) Azure Functions Core Tools v4 (the SWA CLI will auto‑install if missing)

## Install Dependencies (Monorepo)

From the repository root:

```bash
npm install --workspaces
```

This installs dependencies for `frontend` and `backend`.

## Run Frontend & Backend (Recommended)

Use two terminals:

```bash
npm run dev -w frontend       # Vite dev server → http://localhost:5173
npm start -w backend          # Functions host → http://localhost:7071
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

Queue/world logic (Service Bus, timers) will incrementally land here; HTTP endpoints already reside in this workspace.

```bash
cd backend
npm install
npm run build
npm start
```

## Type Checking & Builds

Run type checks across workspaces:

```bash
npm run typecheck
```

Build production frontend bundle:

```bash
npm run build -w frontend
```

## Code Style

Code formatting (indentation, quotes, commas, semicolons) is fully automated:

- Run `npm run format` before committing to apply Prettier.
- CI will fail if formatting drifts—no need to memorize specific style rules.
- Configure your editor for “Format on Save” with Prettier + EditorConfig enabled.

## Cosmos (Gremlin + SQL) via Managed Identity

Cosmos DB access now uses Azure AD (Managed Identity in Azure; your developer identity locally). There is **no key mode**.

Local steps:

1. Ensure you have Azure CLI installed and run `az login` (once per dev session).
2. Set `PERSISTENCE_MODE=cosmos` and Gremlin/SQL endpoint + database env vars in `.env.development`.
3. Start the emulator / Functions as usual. The first Gremlin query will acquire an AAD token via `DefaultAzureCredential`.

If you see `Failed to acquire AAD token for Cosmos Gremlin.` re-run `az login` or verify your account has the Cosmos DB Data Contributor role in the target subscription.

## Common Troubleshooting

| Symptom                                        | Fix                                                             |
| ---------------------------------------------- | --------------------------------------------------------------- |
| Port 5173 in use                               | Close previous Vite instance or set a custom port via `--port`. |
| Functions host fails to start                  | Reinstall dependencies or ensure Node 20+.                      |
| 404 on `/api/...` while using plain `vite dev` | Configure Vite proxy to backend (see `vite.config.ts`).         |

## Next Steps

- Add Service Bus + Cosmos integration (see architecture docs) once APIs are stable.
- Introduce GitHub Actions to automate build/typecheck + deployment.

See also: `branching-strategy.md` for workflow guidance.
