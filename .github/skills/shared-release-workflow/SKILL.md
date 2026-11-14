---
name: shared-release-workflow
description: Guides cross-package changes across the shared, backend, and frontend npm workspaces and standalone Function packaging. Use when changing both shared/ and backend/ or frontend/.
---

# Shared workspace & packaging workflow

Use this skill when you are asked to:

- Add or modify exports in `shared/` and consume them in `backend/` or `frontend/`.
- Verify standalone Azure Functions packaging (`npm run package:backend`).

## Rules

1. Keep `"@piquet-h/shared": "*"` in `backend/package.json` and `frontend/package.json` (never `file:../shared`).
2. Build `shared` first (`npm run build:shared`) so generated barrels, `.d.ts` declarations, and `prompts.bundle.json` are fresh before building or testing `backend` and `frontend`.
3. Ship coordinated `shared/` + `backend/`/`frontend/` changes in **one atomic PR**.
4. When touching `backend/` or `shared/` dependencies, run `npm run package:backend` to verify the standalone Function archive builds cleanly without workspace symlinks.

## Helper script

- `scripts/detect-cross-package.mjs` — reports when the current diff touches multiple workspaces so you remember to run downstream workspace tests.

---

Last reviewed: 2026-11-14
