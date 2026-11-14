# Cross-Package Workspace & Standalone Packaging Policy

`shared/`, `backend/`, and `frontend/` are managed as **npm workspaces** from the root `package.json` with a single `package-lock.json`. `@piquet-h/shared` is resolved directly from the workspace tree without publishing to an external registry.

## Core Rules

1. **Single-PR vertical slices**: Changes spanning `shared/` and `backend/` or `frontend/` SHOULD ship together in **one atomic pull request**.
2. **Workspace range (`"*"`) — never `file:`**: Keep `"@piquet-h/shared": "*"` in `backend/package.json` and `frontend/package.json`. Local `file:../shared` paths are forbidden and enforced by `scripts/verify-runtime-invariants.mjs` (`npm run verify:invariants`) and `scripts/verify-deployable.mjs`.
3. **Build `shared` first**: Run `npm run build:shared` before compiling or testing downstream workspaces so generated barrels, `.d.ts` declarations, and `shared/dist/prompts/prompts.bundle.json` are up to date.
4. **Standalone Azure Functions packaging**: At deploy time, `npm run package:backend` (`scripts/package-backend-function.mjs`) stages `backend/.deploy` with production-only dependencies, replaces the workspace symlink with built `@piquet-h/shared/dist`, and asserts that compiled test output (`dist/test`) never enters the deployment archive.

## Verification Commands

```bash
npm run build:shared
npm run build
npm run lint
npm run typecheck
npm run package:backend
```

See `.github/copilot-instructions.md` Section 12.1 and `.github/skills/shared-release-workflow/SKILL.md` for agent execution guidance.

---

_Last updated: 2026-11-14_
