# AGENTS.md (Shared)

This file provides **shared package** guidance for AI coding agents.

It is intended to apply when editing anything under `shared/`.

## Scope

- `shared/` defines the internal `@piquet-h/shared` npm workspace package.
- This package is the **domain/core** layer used by backend, frontend, and tooling.
- Prefer minimal changes and keep the public surface stable.

## Fast orientation

- Package contract, exports, and boundary rules: `shared/README.md` (authoritative)
- Public API surface: `shared/package.json` `exports`
- Entrypoints: `shared/src/` → builds to `shared/dist/`

## Build / test / typecheck

From repo root:

- Install deps: `npm ci`
- Build (with prompt bundle): `npm run build:shared`
- Tests: `npm run test:shared`
- Typecheck: `npm run typecheck:shared`

## Boundary rules (high-signal)

Do not violate the shared package contract from `shared/README.md`. In particular:

- ✅ Allowed: pure domain types, Zod schemas, constants/enums, pure utilities, interface abstractions.
- ❌ Forbidden: direct Azure SDK imports, Functions bindings, `process.env` access, concrete persistence implementations, direct secret access.

If you need Azure dependencies or runtime behavior, it belongs in `backend/` (or tooling), not `shared/`.

## Cross-package workspace workflow

- `backend/` and `frontend/` consume `@piquet-h/shared` directly via npm workspaces (`"@piquet-h/shared": "*"`); `file:` references remain disallowed by `verify:invariants`.
- Cross-package changes (`shared/` + `backend/` + `frontend/`) can and should ship in a single atomic PR after running `npm run build:shared` and downstream tests.
- `npm run package:backend` (`scripts/package-backend-function.mjs`) bundles built `shared/dist` into `backend/.deploy` for standalone Azure Functions deployment.
