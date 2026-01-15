---
name: shared-release-workflow
description: Enforces the two-stage shared→backend workflow (publish shared first, then consume from registry). Use when changing both shared/ and backend/ or when shared package versioning/publishing is involved.
---

# Shared release workflow

Use this skill when you are asked to:

- Add new exports to `shared/` and use them in `backend/`.
- Bump `@piquet-h/shared` and ensure backend installs from the registry.
- Prevent “combined PR touches shared + backend and breaks CI” situations.

## Rules

1. Never change backend to depend on `file:../shared`.
2. If behavior requires new shared exports, split into two PRs:
    - PR 1: `shared/` only (bump version, publish)
    - PR 2: backend integrates the published version

## Helper script

- `scripts/detect-cross-package.mjs` — detects when the current diff touches both `shared/` and `backend/`.

Use this script as an early warning. It is not a replacement for code review.

---

Last reviewed: 2026-01-15
