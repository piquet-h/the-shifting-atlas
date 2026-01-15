# AGENTS.md (Shared)

This file provides **shared package** guidance for AI coding agents.

It is intended to apply when editing anything under `shared/`.

## Scope

- `shared/` publishes `@piquet-h/shared` to GitHub Packages.
- This package is the **domain/core** layer used by backend, frontend, and tooling.
- Prefer minimal changes and keep the public surface stable.

## Fast orientation

- Package contract, exports, and boundary rules: `shared/README.md` (authoritative)
- Public API surface: `shared/package.json` `exports`
- Entrypoints: `shared/src/` → builds to `shared/dist/`

## Build / test / typecheck

From `shared/`:

- Install deps: `npm install`
- Build: `npm run build`
- Tests: `npm test`
- Typecheck: `npm run typecheck`

Publishing is guarded by `prepublishOnly` (build + test).

## Boundary rules (high-signal)

Do not violate the shared package contract from `shared/README.md`. In particular:

- ✅ Allowed: pure domain types, Zod schemas, constants/enums, pure utilities, interface abstractions.
- ❌ Forbidden: direct Azure SDK imports, Functions bindings, `process.env` access, concrete persistence implementations, direct secret access.

If you need Azure dependencies or runtime behavior, it belongs in `backend/` (or tooling), not `shared/`.

## Versioning + cross-package workflow

- If you change `shared` exports or behavior consumed by `backend/` or `frontend/`, bump `shared/package.json` version.
- Backend/frontend must depend on published versions from GitHub Packages (never `file:` references).
- If a change requires coordinated backend/frontend updates, follow the repo’s “split into sequential PRs” rule (shared PR first, then backend/frontend once the package publishes).

(See `../.github/copilot-instructions.md` for the cross-package PR split policy.)
