## Roadmap Scheduling Automation

Daily GitHub Action (`.github/workflows/roadmap-scheduler.yml`) assigns / maintains project Start & Target dates for issues in the roadmap Project (Projects v2) based on historical execution durations and the canonical implementation order.

### Goals

- Provide an automatically updating timeline for the roadmap board (Gantt style)
- Keep manual effort minimal — ordering and labels drive everything
- Adapt as historical velocity changes (median durations recomputed daily)

### Inputs

| Source                                       | Purpose                                                                            |
| -------------------------------------------- | ---------------------------------------------------------------------------------- |
| `roadmap/implementation-order.json`          | Ordered sequence of issue numbers                                                  |
| Project fields (`Start date`, `Target date`) | Scheduling outputs (date fields)                                                   |
| Issue metadata (labels, state)               | Determine scope (`scope:*`) & type (first non-scope label) + Done/Closed filtering |
| Historical closed issues                     | Derive median durations per (scope,type) & fallbacks                               |

### Duration Heuristic

1. Gather closed issues present in the project.
2. Duration sample priority:
    1. If issue has both `Start date` & `Target date` values: inclusive days between.
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
    - Keep them unless `RESEAT_EXISTING=true` and their start is earlier than the current cursor (prevents overlap after upstream duration shrink).
3. If missing (one or both):
    - Duration = median(scope|type) || median(scope) || global median || `DEFAULT_DURATION_DAYS` (2).
    - `Start date` = cursor date (initial cursor = today, UTC, midnight)
    - `Target date` = start + duration - 1 day (inclusive range)
4. Advance cursor to (target + 1 day).

### Environment Variables

| Name                    | Default       | Description                                                |
| ----------------------- | ------------- | ---------------------------------------------------------- |
| `PROJECT_OWNER`         | repo owner    | Project owner login                                        |
| `PROJECT_NUMBER`        | 3             | Project number                                             |
| `PROJECT_OWNER_TYPE`    | auto          | Force `user` or `org` detection path                       |
| `START_FIELD_NAME`      | `Start date`  | Project date field (start)                                 |
| `TARGET_FIELD_NAME`     | `Target date` | Project date field (finish)                                |
| `DEFAULT_DURATION_DAYS` | 2             | Fallback duration                                          |
| `RESEAT_EXISTING`       | false         | Shift existing dated items forward to remove gaps/overlaps |

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
- Deterministic given same historical set & ordering.
- No deletion of existing dates unless reseating requires forward shift (never moves items earlier automatically).

### Common Issues

| Symptom                           | Cause                                                  | Fix                                                                           |
| --------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| "Missing required date fields"    | Project lacks `Start date` / `Target date`             | Add both Date fields to project                                               |
| All durations default to 2        | Insufficient closed historical samples                 | As issues close, medians will refine                                          |
| Overlapping dates persist         | `RESEAT_EXISTING` not enabled                          | Set env `RESEAT_EXISTING=true` for one run                                    |
| GraphQL NOT_FOUND on Organization | Running older script version against a user-owned repo | Updated script auto-tries user → org → viewer and suppresses benign NOT_FOUND |

### Rationale

Chose medians (not mean) to resist occasional long spikes. Inclusive target date simplifies visual blocks on roadmap board. Algorithm prefers stability: existing explicitly scheduled items are preserved unless they would overlap after upstream changes.
