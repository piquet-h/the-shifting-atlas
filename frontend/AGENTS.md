# AGENTS.md (Frontend)

This file provides **frontend-specific** guidance for AI coding agents.

It is intended to apply when editing anything under `frontend/`.

## Scope

- This package is the player-facing SPA (Vite + React + Tailwind).
- Follow the detailed frontend delta rules in `.github/instructions/frontend/.instructions.md` (authoritative).
- Prefer minimal, test-driven changes.

## Fast orientation

- Frontend architecture + component catalog: `frontend/README.md`
- Frontend delta instructions: `.github/instructions/frontend/.instructions.md`
- Cross-cutting rules (telemetry, shared package policy, etc.): `.github/copilot-instructions.md`

## Local dev (preferred)

From `frontend/`:

- Install deps: `npm install`
- Dev server (Vite): `npm run dev`
- SWA local integration (if needed): `npm run swa`

From repo root (useful in CI-style validation):

- `npm run build:frontend`
- `npm run test:frontend`
- `npm run lint:frontend`
- `npm run typecheck:frontend`

## Testing expectations

- Unit tests: `npm run test` (Vitest)
- E2E tests: `npm run test:e2e` (Playwright)
- Accessibility checks: `npm run a11y` (axe scan)

## High-signal guardrails

- Keep UI components small and accessible (WCAG AA; avoid div-soup).
- Prefer type safety (explicit types, no implicit `any`).
- Avoid duplicating backend logic in the client; treat backend as authoritative.
- Don’t inline telemetry event names; use the shared telemetry module.
- Don’t modify backend/shared/infrastructure unless explicitly requested.
