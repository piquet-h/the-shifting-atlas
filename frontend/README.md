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

Tailwind + basic palette (`tailwind.config.ts`).

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
  | `src/components/Homepage.tsx` – Landing UI (auth‑aware hero + personalized return state)
  | `src/components/Nav.tsx` – Navigation bar (sign in/out menu)
- `src/services/api.ts` – Minimal API wrapper (health check; extend for player actions)
- `tailwind.config.ts` – Tailwind configuration (typed)

## Co-Located API (`api/`)

Co-located Azure Functions (health + player action stubs). Served when using SWA CLI. For deeper debugging you can start the Functions host inside `api/`, but typically the root `npm run swa` is sufficient early on.

Global styles: `src/tailwind.css` (single source). Typography + Forms plugins enabled.

## Roadmap

- Add stateful player session handling (local stub + remote integration).
- Introduce UI components for room traversal and NPC interactions.
- Implement API error surface + loading skeletons.

## Authentication (MVP Implemented)

Client-only hook `useAuth` queries `/.auth/me` (Azure Static Web Apps) to derive auth state:

States:

- Loading: spinner on homepage until identity resolved.
- Unauthenticated: marketing hero + CTA that calls `signIn('msa')` (redirect to provider).
- Authenticated: personalized welcome panel; nav menu shows Sign Out.

Sign in / out:

- Sign in → `/.auth/login/<provider>?post_login_redirect_uri=/` (currently using `msa` provider alias).
- Sign out → `/.auth/logout?post_logout_redirect_uri=/` (broadcasts refresh to other tabs via localStorage event).

Behavior when auth unavailable locally: hook returns `isAuthenticated=false` without throwing errors.

Planned enhancements: role/claim helpers, ProtectedRoute component, server-side authorization checks in Functions using `x-ms-client-principal`.

### Azure AD (Entra ID) Integration (Single‑Tenant)

The app is currently configured for a single Azure AD tenant; the `openIdIssuer` in `staticwebapp.config.json` is hard‑coded to that tenant's v2.0 endpoint. SWA app settings still provide runtime values for:

- `AAD_CLIENT_ID` (GitHub secret `AZURE_CLIENT_ID`)
- `AAD_TENANT_ID` (GitHub secret `AZURE_TENANT_ID`, mainly informational now)
- `AAD_CLIENT_SECRET` (optional; only if confidential flow required)

If multi‑tenant or environment‑specific tenant substitution is needed later, reintroduce a `<TENANT_ID>` placeholder and a replacement step inside the deploy workflow.

Local auth emulator:

- The SWA CLI provides a lightweight built‑in auth simulation; real AAD issuer redirects require a dev redirect URI added to the app registration (`http://localhost:4280/.auth/login/aad/callback`).

Secret Handling Guidelines:

- Rotate the client secret in Entra ID, then update the GitHub secret; no code change required.
- Avoid logging values—only presence/absence.
- If reverting to dynamic tenant substitution, remove the hard‑coded issuer and restore a placeholder prior to commit.

## Notes

Remain intentionally lean; world rules will live in Functions + queued processors. Keep components presentation‑focused.

## Accessibility (A11y)

Landmarks:

- Single global `<main id="main">` defined in `App.tsx`; routed pages (e.g. `Homepage`) must NOT introduce additional `<main>` elements.
- `<nav>` (primary navigation) sits above main; footer content is inside the main landmark to guarantee all meaningful content is enclosed by landmarks (axe "region" rule).
- Decorative wrappers (e.g. `.app-root`) are left un‑labeled to avoid creating anonymous landmarks.

Focus Management:

- `RouteFocusManager` moves focus to the first `<h1>` (or `main` if none) after route changes for screen reader context.
- Skip link (`Skip to main content`) becomes visible on focus and targets `#main`.

Live Regions:

- `LiveAnnouncer` lives inside `<main>` so announcements are within landmark scope.
- Command output uses a polite live region to announce results or failures.

Color & Contrast:

- Reduced use of low‑contrast `text-slate-500` on dark surfaces; replaced with `text-slate-300/400` where needed.
- Inline `<code>` tokens styled with a darker background and lighter foreground for ≥ 4.5:1 ratio.

ARIA Usage:

- Avoid redundant `aria-label` when native semantics suffice (removed wrapper label that triggered region warning).
- Status dot in nav is `aria-hidden` with a sibling `role="status"` textual element for SR clarity.

Automation:

- `npm run a11y` launches a Vite server then executes a custom wrapper (`scripts/run-axe.mjs`) around `@axe-core/cli`.
- Wrapper normalizes a phantom secondary URL scan issue and fails the build ONLY when real violations exist (parses JSON reports under `frontend/axe-report`).

Guidelines for New Components:

1. Place core page content _inside_ the existing `<main>` via composition—do not add new top-level landmarks.
2. Prefer semantic elements (`section`, `ul`, `button`) over divs + ARIA.
3. Only add `aria-live` for dynamically inserted messaging not otherwise announced (errors, async results).
4. Validate with `npm run a11y` before merging; keep violations at 0 for MVP scope.

Future Enhancements:

- Add keyboard trap tests for any future modal/dialog patterns.
- Provide reduced‑motion alternatives for forthcoming animations.
- Introduce end‑to‑end tests that assert presence & order of landmarks.

## Progressive Enhancement (Desktop)

Mobile remains the baseline (single column, minimal decoration). Larger screens and capable inputs unlock additional presentation without changing underlying semantics:

Enhancements Added:

- Constrained centered layout (Tailwind `container` + `max-w-7xl`).
- Sticky, translucent nav bar with backdrop blur and border.
- Multi-column homepage (12‑column CSS grid) on `lg+` with a right side panel displaying prototype feeds (static placeholders for future world + player activity).
- Decorative radial background layer behind main content on large screens.
- Utility hooks (`useMediaQuery`, `usePointerFine`, `usePrefersReducedMotion`) to gate future enhancements (hover tooltips, animations) by capability.
- Heading size clamp utility `.heading-clamp` (not yet applied broadly; reserved for future hero typography refinements).
- Reduced footer prominence on large screens (smaller text baseline, subtle color shift).

Philosophy:

1. No critical information is desktop‑only.
2. Enhancements are additive, never required for navigation.
3. Visual effects avoid motion when `prefers-reduced-motion: reduce` is present (future animations should read the hook before animating).

Future Opportunities:

- Convert static feed sidebars into live components (websocket or polling → likely Service Bus event fan‑out + Function HTTP endpoint aggregator).
- Introduce keyboard shortcut hints panel (only when a physical keyboard is detected).
- Apply per‑section entrance transitions (gated by reduced‑motion preference).

Testing Recommendations:

1. Narrow viewport ≤ 640px: ensure single column with no sidebars.
2. Expand to ≥ 1024px: verify side panel appears and layout stays centered.
3. Toggle prefers-reduced-motion in OS and confirm absence of new motion (currently none programmatic).
4. Inspect accessibility tree to confirm no duplicate landmark roles added by layout wrapper.
