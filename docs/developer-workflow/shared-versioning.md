# Shared Package Versioning & Cross-Package PR Policy

This document reinforces (and adds an automated guard for) the rules already summarized in the Copilot Operating Guide (Section 12.2) about changing the `@piquet-h/shared` package.

## Core Principle

Two-stage lifecycle whenever backend needs new exports:

1. Stage 1 (Shared Only): Add / modify code inside `shared/`.
    - Do NOT touch `backend/` (except maybe tests that import existing published APIs).
    - Let the publish workflow bump & publish the new version (patch/minor) automatically.
2. Stage 2 (Backend Integration): After the version is visible in the GitHub Packages registry, update `backend/package.json` semver range if required and consume the new exports.

## Why This Matters

-   Prevents CI failures (backend attempting to install a version that is not yet published).
-   Keeps dependency graph reproducible in ephemeral build environments.
-   Preserves a clear audit trail: every new shared version = a self‑contained PR.

## Explicit “DO NOT” Rules

-   Do NOT bump `shared/package.json` version manually in the same PR that edits backend code.
-   Do NOT introduce new backend imports from an unpublished shared symbol.
-   Do NOT create a single PR that changes both `shared/` APIs **and** backend consumption unless the shared change is a trivial non-version-worthy tweak (typo, comment) AND no version bump occurs.

## Automated Guard

A new script: `npm run verify:crosspkg`

It fails if ALL of the following are true in the diff against the base branch:

-   `shared/package.json` changed (version bump)
-   Files under `shared/src/` changed
-   Files under `backend/src/` changed
-   `backend/package.json` did NOT change

Rationale: indicates an attempted simultaneous shared version bump plus backend code edits without explicitly updating backend dependency (i.e. unsplit cross-package PR).

### How to Use

Add to CI (example GitHub Actions step before build):

```yaml
- name: Cross-package guard
  run: npm run verify:crosspkg
```

### Limitations

-   It does not validate that the new version actually exists in the registry (that is left to the publish + install step).
-   It allows shared changes without version bumps (acceptable for purely internal refactors or test additions). If the publish workflow requires a bump, it will apply one.

## Recovering From an Accidental Combined PR

1. Revert the manual version bump in `shared/package.json`.
2. Either:
    - (Preferred) Split into two PRs: shared-only first, then backend integration.
    - Or (if change was trivial) keep combined PR but **remove** the version bump.
3. Re-run `npm run verify:crosspkg` locally to confirm clean.

## Checklist (Add to PR Template?)

-   [ ] Shared changes isolated (or version bump omitted if trivial)
-   [ ] Backend only imports published shared symbols
-   [ ] No manual shared version bump alongside backend src edits
-   [ ] Cross-package guard script passes

## Future Enhancements (Optional)

-   Extend guard to assert that if backend/package.json increases the shared semver range, the referenced version exists in the registry (using `npm view`).
-   Integrate with a release notes generator to tag new shared exports automatically.

---

Stable contract: Follow the two-stage flow; let automation own version numbers; keep PRs atomic.
