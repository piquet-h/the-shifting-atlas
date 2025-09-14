# Frontend (Vite + React + Tailwind + TypeScript)

Mobile‑first client prototype for The Shifting Atlas. Includes a minimal health check call, simple navigation, and Tailwind‑styled entry experience. This package provides the player-facing SPA and is written in **TypeScript** (strict) – see `tsconfig.json`.

## Scripts

| Script               | Purpose                                                                   |
| -------------------- | ------------------------------------------------------------------------- |
| `npm run dev`        | Start Vite dev server (React Fast Refresh).                               |
| `npm run typecheck`  | Run `tsc --noEmit` for full type safety.                                  |
| `npm run build`      | Create production build (Vite).                                           |
| `npm run preview`    | Preview production build locally.                                         |
| `npm run swa`        | Start SWA CLI from this workspace (frontend + co-located Functions).      |
| `npm run swa` (root) | Preferred: from repo root, launches unified emulator (alias `swa start`). |

## TypeScript Conventions

- Module resolution uses `Bundler` to avoid file extension noise in imports.
- React components are typed with explicit `React.ReactElement` returns for clarity.
- Environment variables follow `import.meta.env.*`; extend types via a `env.d.ts` if custom keys are added.
- Service calls live in `src/services/` (see `api.ts`).

## API Integration

TypeScript Azure Functions co-located under `api/` expose routes like `/website/health` and `/website/player/actions` (surfaced under `/api/*` by SWA). The SPA calls them through `/api` (or `VITE_API_BASE` override). During `npm run dev` (pure Vite) these Functions are not proxied; use `npm run swa` (root) for the integrated environment.

## Styling

Tailwind + custom color palette (see `tailwind.config.js`). `EntryPage.tailwind.tsx` is the canonical landing component; legacy plain styles have been deprecated.

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
- `src/components/EntryPage.tailwind.tsx` – Landing UI
- `src/components/Nav.tsx` – Navigation bar
- `src/pages/About.tsx` – Example informational page
- `src/pages/DemoForm.tsx` – Example interactive form
- `src/services/api.ts` – Minimal API wrapper (health check; extend for player actions)
- `tailwind.config.js` – Tailwind configuration

## Co-Located API (`api/`)

Co-located Azure Functions (health + player action stubs). Served when using SWA CLI. For deeper debugging you can start the Functions host inside `api/`, but typically the root `npm run swa` is sufficient early on.

## Styling

Tailwind CSS with the Typography and Forms plugins enabled. Global styles live in `src/tailwind.css` and `src/styles.css`.

## Roadmap

- Add stateful player session handling (local stub + remote integration).
- Introduce UI components for room traversal and NPC interactions.
- Implement API error surface + loading skeletons.

## Notes

Frontend remains intentionally lean; domain/world logic will move into dedicated Functions + queued processors. Keep UI free of game rules beyond minimal validation.
