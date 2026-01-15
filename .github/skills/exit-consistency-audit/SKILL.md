---
name: exit-consistency-audit
description: Runs and interprets exit graph consistency scans (dangling exits, orphan locations, missing reciprocal exits). Use when exits/navigation look wrong or when changing location graph data.
---

# Exit consistency audit

Use this skill when you are asked to:

- Debug traversal anomalies (players can’t return, one-way exits, broken navigation).
- Validate exit graph integrity after seeding or migration.
- Produce a JSON report of exit consistency.

## What this skill uses

Primary scanner:

- Repo script: `scripts/scan-exits-consistency.mjs`

Convenience wrapper (recommended):

- `scripts/run.mjs`

## Preconditions

The exit scan runs against **Gremlin/Cosmos** and relies on built artifacts:

- `backend/dist/**` (for Gremlin client + persistence config)
- `shared/dist/**` (for direction utilities)

If those outputs are missing, either:

- run `npm run build:backend` and `npm run build:shared`, or
- run the wrapper with `--build`.

## Workflow

1. Ensure build artifacts exist (or use `--build`).
2. Run the scan.
3. Interpret results:
    - **Dangling exits**: must be fixed (exit points to non-existent location)
    - **Missing reciprocal exits**: must be fixed (A→B without B→A in the opposite direction)
    - **Orphan locations**: warning only (may be intentional; verify design intent)
4. If needed, generate a JSON report via `--output=<file>`.

## Examples

- Scan and print JSON to stdout.
- Scan and write report to a file.
- Scan with extra seed locations using `--seed-locations=loc1,loc2`.

## Output contract

The scanner prints:

- JSON results on stdout
- A human-readable summary on stderr

Exit codes:

- `0`: pass (no dangling exits / missing reciprocals)
- `1`: fail (dangling exits or missing reciprocals present)

---

Last reviewed: 2026-01-15
