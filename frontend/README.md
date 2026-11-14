# Frontend (`the-shifting-atlas-frontend`)

Player-facing Single Page Application hosted on Azure Static Web Apps (`Vite 8 + React 18 + React Router 7 + TanStack Query 5 + Tailwind CSS 3`).

## Authoritative Architecture & UX References

To avoid duplicating architecture across layers, component specs, contracts, and accessibility rules live in `docs/`:

- **Component Tree, State Patterns & Style Guide**: [`../docs/architecture/frontend-components.md`](../docs/architecture/frontend-components.md)
- **Frontend ↔ Backend API Contract & Envelope**: [`../docs/architecture/frontend-api-contract.md`](../docs/architecture/frontend-api-contract.md)
- **WCAG 2.2 AA Accessibility Guidelines**: [`../docs/ux/accessibility-guidelines.md`](../docs/ux/accessibility-guidelines.md)
- **Entra ID / SWA EasyAuth Configuration**: [`../docs/ux/azure-auth-notes.md`](../docs/ux/azure-auth-notes.md)

## Quick Start

Dependencies are managed via **npm workspaces** at the repository root (zero registry authentication required):

```bash
# From repository root
npm ci
npm run build:shared
npm run dev:frontend   # http://localhost:5173
```

To test Static Web Apps authentication emulation locally (`/.auth/me`), run from `frontend/`:

```bash
npm run swa            # http://localhost:4280
```

## Environment Variables (`VITE_*`)

| Variable                             | Required | Default     | Source Reference                | Purpose                                                       |
| ------------------------------------ | -------- | ----------- | ------------------------------- | ------------------------------------------------------------- |
| `VITE_APPINSIGHTS_CONNECTION_STRING` | No       | `undefined` | `src/services/telemetry.ts`     | Application Insights browser telemetry (no-op when unset)     |
| `VITE_API_BASE`                      | No       | `/api`      | `src/services/ping.ts`          | Backend API base path (proxied via Vite locally / SWA in prod)|
| `VITE_PERSISTENCE_MODE`              | No       | `undefined` | `src/services/telemetry.ts`     | Optional persistence-mode dimension attached to UI telemetry  |

## Scripts

| Command (`frontend/`)   | Root Equivalent            | Purpose                                                      |
| ----------------------- | -------------------------- | ------------------------------------------------------------ |
| `npm run dev`           | `npm run dev:frontend`     | Start Vite HMR dev server (`http://localhost:5173`)          |
| `npm run build`         | `npm run build:frontend`   | Production Vite bundle → `frontend/dist/`                    |
| `npm run typecheck`     | `npm run typecheck:frontend`| TypeScript check (`tsc --noEmit`)                            |
| `npm run lint`          | `npm run lint:frontend`    | ESLint (including `jsx-a11y`, `react-hooks`, Prettier rules) |
| `npm run format`        | `npm run format:frontend`  | Prettier auto-format across `src/` and `test/`               |
| `npm test`              | `npm run test:frontend`    | Vitest unit & component tests                                |
| `npm run a11y`          | —                          | Start server + run `@axe-core/cli` scan (`scripts/run-axe.mjs`)|
| `npm run test:e2e`      | —                          | Playwright end-to-end browser suite (`e2e/`)                 |

## Key Directories

- `src/components/` — Accessible UI and game components (`GameView`, `CommandInterface`, `NavigationUI`, `WorldMap`, `LiveAnnouncer`)
- `src/pages/` — Routed views (`Game`, `Profile`, `Settings`, `Help`, `About`, `LearnMore`, `NotFound`)
- `src/hooks/` — Auth (`useAuth`), guest GUID bootstrap (`usePlayerGuid`), guest linking (`useLinkGuestOnAuth`), media queries
- `src/services/` & `src/utils/` — API client, envelope unwrapping, correlation headers (`x-correlation-id`), and telemetry adapter
- `public/staticwebapp.config.json` — SWA routing, headers, and Entra OpenID configuration
- `test/` & `e2e/` — Vitest unit/component tests and Playwright E2E specs

---

_Last updated: 2026-11-14_
