## Roadmap Scheduling Automation

Daily GitHub Action (`.github/workflows/roadmap-scheduler.yml`) assigns / maintains project Start & Target dates for issues in the roadmap Project (Projects v2) based on historical execution durations and the canonical implementation order.

### Goals

- Provide an automatically updating timeline for the roadmap board (Gantt style)
- Keep manual effort minimal — ordering and labels drive everything
- Adapt as historical velocity changes (median durations recomputed daily)

### Inputs

| Source                               | Purpose                                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| Project field `Implementation order` | Ordered sequence of issue numbers (canonical)                                      |
| Project fields (`Start`, `Finish`)   | Scheduling outputs (date fields)                                                   |
| Issue metadata (labels, state)       | Determine scope (`scope:*`) & type (first non-scope label) + Done/Closed filtering |
| Historical closed issues             | Derive median durations per (scope,type) & fallbacks                               |

### Duration Heuristic

1. Gather closed issues present in the project.
2. Duration sample priority:
    1. If issue has both `Start` & `Finish` values: inclusive days between.
    2. Else: `closedAt - createdAt` (>=1 day).
3. Group durations:
    - Exact key: `scope|type` (e.g. `scope:core|feature`)
    - Scope-only (e.g. `scope:core`)
    - Global (all samples)
4. Use median (robust vs outliers) for each group.

### Assignment Algorithm

Iterate ordered issues (ascending `order`):

1. Skip if project status is `Done` or issue state is `CLOSED`.
2. If both dates already present:
    - If status is `In progress`: **Rebaseline** — set `Start = today` (UTC midnight) and `Finish = Start + originalDuration - 1`. This always reflects the remaining future window, even if original start was in the past or (erroneously) in the future. If the item is overdue (today > original `Finish`), the window is shifted forward preserving duration (`reason: rebaseline-overdue`).
    - Else keep them unless `RESEAT_EXISTING=true` and their start is earlier than the current cursor (prevents overlap after upstream duration shrink) in which case shift forward preserving duration (`reason: reseat`).
3. If missing (one or both):
    - Duration = median(scope|type) || median(scope) || global median || `DEFAULT_DURATION_DAYS` (2).
    - `Start` = cursor date (initial cursor = today, UTC, midnight)
    - `Finish` = start + duration - 1 day (inclusive range)
4. Advance cursor to (finish + 1 day).

### Rebaseline Behavior

The roadmap favors a forward-looking view over historical preservation:

- When an item is marked `In progress`, its planned window is re-centered to start today, maintaining the originally scheduled duration length.
- Historical slippage (difference between original and rebaselined dates) is not stored; only the new future window remains visible.
- Overdue items (current date past original Finish) are pushed forward intact so subsequent items cascade naturally.

Reasons emitted in dry-run/apply logs:

| Reason               | Meaning                                                        |
| -------------------- | -------------------------------------------------------------- |
| `rebaseline`         | In progress item shifted to today preserving duration          |
| `rebaseline-overdue` | In progress item whose original Finish was before today        |
| `reseat`             | Start shifted forward to remove overlap (RESEAT_EXISTING=true) |
| `new`                | Newly scheduled (no dates)                                     |
| `partial-fill`       | Had one date; filled the other                                 |

### Environment Variables

| Name                    | Default    | Description                                                |
| ----------------------- | ---------- | ---------------------------------------------------------- |
| `PROJECT_OWNER`         | repo owner | Project owner login                                        |
| `PROJECT_NUMBER`        | 3          | Project number                                             |
| `PROJECT_OWNER_TYPE`    | auto       | Force `user` or `org` detection path                       |
| `DEFAULT_DURATION_DAYS` | 2          | Fallback duration                                          |
| `RESEAT_EXISTING`       | false      | Shift existing dated items forward to remove gaps/overlaps |

### Script Usage

```
node scripts/schedule-roadmap.mjs            # dry-run (default)
node scripts/schedule-roadmap.mjs apply      # apply changes
```

Or via npm:

```
npm run schedule:roadmap -- apply
```

### GitHub Action

`roadmap-scheduler.yml` runs daily at 04:15 UTC and supports manual dispatch with optional dry-run.

Permissions used:

- `projects: write` — update date field values
- `issues: write` — (future extension; not currently mutating issue bodies)

### Extending / Tuning

- Add explicit size labels (e.g. `size:1d`, `size:3d`) — enhance algorithm to prefer explicit size before medians.
- Introduce capacity (parallel work streams) by allowing multiple active cursors (not currently needed for single‑track execution).
- Persist velocity snapshots to trend improvements (could store JSON under `project_snapshot.json`).

### Safety & Idempotency

- Dry-run default avoids accidental mutation.
- Deterministic given same historical set & ordering (apart from daily rebaseline of `In progress`).
- Rebaseline may move an item earlier (if it was mistakenly planned to start in the future yet marked In progress) or later (if already underway). This intentional mutation reflects current reality; history is not retained.
- Other existing dates are only shifted forward when reseating removes overlaps.

### Common Issues

| Symptom                           | Cause                                                  | Fix                                                                           |
| --------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| "Missing required date fields"    | Project lacks `Start` / `Finish`                       | Add both Date fields to project                                               |
| All durations default to 2        | Insufficient closed historical samples                 | As issues close, medians will refine                                          |
| Overlapping dates persist         | `RESEAT_EXISTING` not enabled                          | Set env `RESEAT_EXISTING=true` for one run                                    |
| GraphQL NOT_FOUND on Organization | Running older script version against a user-owned repo | Updated script auto-tries user → org → viewer and suppresses benign NOT_FOUND |
| Missing required date fields      | Project lacks `Start` / `Finish`                       | Create fields manually                                                        |

### Rationale

Chose medians (not mean) to resist occasional long spikes. Inclusive target date simplifies visual blocks on roadmap board. Algorithm prefers stability: existing explicitly scheduled items are preserved unless they would overlap after upstream changes.

---

## Stage 2: Predictive Scheduling (Provisional Schedules)

Stage 2 extends the roadmap automation with **provisional scheduling** that provides early visibility into expected dates before the daily scheduler runs.

### Overview

When an issue receives an implementation order (via auto-assignment), the system automatically:

1. **Estimates duration** using historical data (same algorithm as scheduler)
2. **Projects dates** based on queue position and cursor calculation
3. **Stores provisional data** in GitHub Projects v2 custom fields
4. **Posts a comment** on the issue (high/medium confidence only)

### Custom Fields

Four new custom fields in Project #3:

- **Provisional Start** (Date) - Estimated start date
- **Provisional Finish** (Date) - Estimated finish date
- **Provisional Confidence** (Single select: High/Medium/Low) - Confidence level
- **Estimation Basis** (Text) - How estimate was calculated

**Setup:** Fields must be created manually. See [Stage 2 User Guide](./stage2-user-guide.md#setting-up-custom-fields).

### Related Documentation

- **[Stage 2 User Guide](./stage2-user-guide.md)** - Complete user documentation
- **[Scripts README](../../scripts/shared/README.md)** - Module documentation
- **[Stage 2 Sub-Issues](../planning/stage2-subissues/)** - Technical specifications

---

_Last updated: 2025-01-08_
