# Local Development Setup

This guide shows how to run the full stack (frontend + co-located Functions API) and, when needed, the standalone backend workspace.

## Prerequisites

- Node.js >= 20
- (Optional) Azure Functions Core Tools v4 (the SWA CLI will auto‑install if missing)

## Install Dependencies (Monorepo)

From the repository root:

```bash
npm install --workspaces
```

This installs dependencies for `frontend`, `frontend/api`, and `backend`.

## Run Unified Emulator (Recommended)

```bash
npm run swa
```

What happens:

- Vite dev server (http://localhost:5173)
- Functions host for `frontend/api` (http://localhost:7071)
- SWA emulator proxy (http://localhost:4280) combining both + auth emulation

Auth emulation / local testing:

- The SWA emulator can emulate authentication flows for development. For realistic end-to-end tests with Microsoft Entra External Identities, configure a test Entra application and use the emulator's auth features to simulate sign-in. When running functions locally, validate tokens against the test tenant's OIDC metadata or use short-lived developer tokens for integration tests.
- The frontend `useAuth` hook simply fetches `/.auth/me`; in the emulator if no auth context is configured it resolves to anonymous without errors. To test transitions, manually trigger provider login via `/.auth/login/aad` in the browser.

Test an API route:

```bash
curl http://localhost:4280/api/website/health
```

Verbose mode:

```bash
npm run swa:start:verbose
```

## Frontend Only

```bash
cd frontend
npm run dev
```

## Standalone Backend (Experimental)

Used once queue/world logic migrates to `backend/`.

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

## Common Troubleshooting

| Symptom                                        | Fix                                                                        |
| ---------------------------------------------- | -------------------------------------------------------------------------- |
| Port 5173 in use                               | Close previous Vite instance or set a custom port via `--port`.            |
| Functions host fails to start                  | Remove `node_modules` in `frontend/api` and reinstall, or ensure Node 20+. |
| 404 on `/api/...` while using plain `vite dev` | Use `npm run swa` – plain Vite does not proxy Functions.                   |

## Next Steps

- Add Service Bus + Cosmos integration (see architecture docs) once APIs are stable.
- Introduce GitHub Actions to automate build/typecheck + deployment.

See also: `branching-strategy.md` for workflow guidance.
