# Frontend (Vite + React + Tailwind)

Player‑facing SPA prototype. Minimal health check call, simple navigation, Tailwind styling. TypeScript is strict (see `tsconfig.json`). Keep UI free of world/game logic.

## Scripts

| Script               | Purpose                                                              |
| -------------------- | -------------------------------------------------------------------- |
| `npm run dev`        | Start Vite dev server (React Fast Refresh).                          |
| `npm run typecheck`  | Run `tsc --noEmit` for full type safety.                             |
| `npm run build`      | Create production build (Vite).                                      |
| `npm run preview`    | Preview production build locally.                                    |
| `npm run swa`        | Start SWA CLI (frontend + co‑located Functions) from this workspace. |
| `npm run swa` (root) | Preferred unified emulator (alias defined at repo root).             |

## TypeScript Conventions

- Module resolution uses `Bundler` to avoid file extension noise in imports.
- React components are typed with explicit `React.ReactElement` returns for clarity.
- Environment variables follow `import.meta.env.*`; extend types via a `env.d.ts` if custom keys are added.
- Service calls live in `src/services/` (see `api.ts`).

## API Integration

Co‑located Azure Functions in `api/` expose routes like `/website/health` (available at `/api/website/health`) and `/website/player/actions`. During plain `npm run dev` they are not available; use `npm run swa` for integrated mode.

## Styling

Tailwind + basic palette (`tailwind.config.js`).

## Adding New Components

1. Create a `.tsx` file under `src/components/` or `src/pages/`.
2. Keep components small and typed; prefer explicit prop interfaces when props grow beyond a few primitives.

## Quick Start

From this directory:

```bash
npm install
npm run dev
```

Build production bundle:

```bash
npm run build
```

Preview production build locally:

```bash
npm run preview
```

## Notable Files

- `index.html` – Vite entry
- `src/main.tsx` – React bootstrap (TypeScript)
- `src/App.tsx` – Root component + Router outlet
- `src/components/Homepage.tsx` – Landing UI (renamed from EntryPage)
- `src/components/Nav.tsx` – Navigation bar
- `src/pages/About.tsx` – Example informational page
- `src/pages/DemoForm.tsx` – Example interactive form
- `src/services/api.ts` – Minimal API wrapper (health check; extend for player actions)
- `tailwind.config.js` – Tailwind configuration

## Co-Located API (`api/`)

Co-located Azure Functions (health + player action stubs). Served when using SWA CLI. For deeper debugging you can start the Functions host inside `api/`, but typically the root `npm run swa` is sufficient early on.

Global styles: `src/tailwind.css` (single source). Typography + Forms plugins enabled.

## Roadmap

- Add stateful player session handling (local stub + remote integration).
- Introduce UI components for room traversal and NPC interactions.
- Implement API error surface + loading skeletons.

## Authentication & Sign Out (MVP Stub)

This frontend now includes a minimal client-only hook `useAuth` that queries Azure Static Web Apps' built-in endpoint `/.auth/me` to determine whether a user is authenticated. If a user is present the nav menu shows a "Sign Out" action.

Sign-out behavior:

1. Clicking "Sign Out" triggers a redirect to `/.auth/logout?post_logout_redirect_uri=/`.
2. SWA clears the auth session (and upstream provider cookie where applicable) and then returns to the homepage.
3. The hook re-runs on load and the menu reverts to the anonymous state.

Notes:

- Sign-in links still display placeholder buttons. When providers are configured you can replace these with direct links like `/.auth/login/github` or a custom login page.
- For local development without SWA auth configured the hook simply treats the visitor as anonymous (no errors thrown).
- Future enhancements: global AuthContext, silent refresh, provider selection UI, role-based gating of navigation.

## Notes

Remain intentionally lean; world rules will live in Functions + queued processors. Keep components presentation‑focused.
