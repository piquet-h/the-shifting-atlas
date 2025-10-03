# Roadmap Folder

## Canonical Source

The authoritative implementation order now lives **only** in the Project v2 numeric field `Implementation order`.

## Snapshot Artifact (Legacy)

- `implementation-order.json` – Optional exported snapshot (read‑only). Regenerate any time with `npm run export:impl-order:snapshot`. Do **not** hand‑edit; changes will be ignored and can be overwritten.
- Generated artifact (do **not** hand‑edit):
    - `docs/roadmap.md` – Rendered table + statuses (scheduled workflow + sync scripts) sourced from the Project field.

## How to Change Ordering

1. Open the Roadmap Project in GitHub.
2. Edit the `Implementation order` field (inline or bulk). Keep integers contiguous starting at 1; prefer appending new issues, resequence only for narrative clarity.
3. Allow automation to regenerate `docs/roadmap.md` (or run `npm run sync:impl-order:apply`).
4. (Optional) Refresh the snapshot JSON: `npm run export:impl-order:snapshot`.

## When NOT to Touch Anything

Status or scope/type changes: update labels or issue state directly in GitHub—automation will pick them up.

## Automation Touchpoints

- `scripts/sync-implementation-order.mjs` – Mirrors Project field to markdown (+ optional snapshot).
- `scripts/export-implementation-order-snapshot.mjs` – Writes the legacy JSON snapshot.
- `scripts/auto-resequence-from-drift.mjs` – (Future) may write directly to Project field (currently operates on snapshot if present).

## Rationale

Moving the canonical sequence into the Project eliminates merge churn, avoids conflicted JSON edits, and lets manual adjustments happen directly where status/context already live.
