# Roadmap Folder

## Files

- `implementation-order.json` – Canonical, human-curated ordering list (single source of truth for execution order). Edited intentionally when resequencing, appending new issues, or correcting titles. Automation reads this file but does **not** overwrite it arbitrarily.
- Generated artifacts (do **not** hand-edit):
  - `docs/roadmap.md` – Rendered table + statuses (scheduled workflow + sync scripts).

## Edit Policy

1. Prefer appending new issues at the end; resequence only for narrative clarity.
2. Keep `order` values contiguous starting at 1.
3. Update issue titles here only if the GitHub issue title has already been updated (this file mirrors, not leads, authoritative titles).
4. Do **not** manually change statuses here (statuses are not stored in this file); statuses live on GitHub issues and flow into the generated doc.

## When NOT to Edit

If you only need to change an issue's status or labels, do it on GitHub. Let the scheduled workflow regenerate `docs/roadmap.md`.

## Automation Touchpoints

Scripts referencing this file (examples):
- `scripts/sync-implementation-order.mjs` – Renders `docs/roadmap.md`.
- `scripts/ensure-all-issues-in-order.mjs` – Validates all open issues appear here.
- `scripts/auto-resequence-from-drift.mjs` – Can propose/perform resequencing; requires deliberate invocation.

These scripts treat `implementation-order.json` as input, not an ephemeral artifact.

## Rationale

Separating the authoritative ordering (this file) from the rendered markdown prevents merge churn on large tables and makes automated validation deterministic.
