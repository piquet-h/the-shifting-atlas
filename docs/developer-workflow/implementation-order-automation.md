# Implementation Order Automation

This document describes the automated implementation order assignment system for new GitHub issues.

## Overview

Historically ordering used a local JSON snapshot + heuristic scripts. These have been fully retired. All automation now works directly against the Project v2 numeric field `Implementation order`.

When a new issue is created or significantly updated (labels, milestones), the system (human + on-demand tooling) may:

1. Inspect issue labels / milestone.
2. Optionally run the assignment helper script (see New Assignment Tool) in dry‑run.
3. Apply updated contiguous ordering to the Project field.
4. Regenerate `docs/roadmap.md` via `npm run sync:impl-order:apply`.

There is no background priority auto-writer at the moment; the previous JSON-based priority analyzer & applier are deprecated and stubbed.

## How It Works

### Automatic Triggers

The automation runs on these GitHub events:

- `issues.opened` - New issues are automatically assigned implementation order
- `issues.labeled` - Label changes may affect priority
- `issues.unlabeled` - Label removal may affect priority
- `issues.milestoned` - Milestone assignment affects priority
- `issues.demilestoned` - Milestone removal affects priority

### Priority Model (Current - Stage 1)

**Stage 1 Implementation**: The system now supports confidence-based automatic ordering with the `assign-impl-order.mjs` script enhanced for automation.

Current workflow:

1. **Automatic Analysis**: On issue creation/update, the workflow runs `assign-impl-order.mjs` which:
    - Pulls all Project items & existing `Implementation order` values
    - Scores issues using a lightweight heuristic (scope > type > milestone)
    - Calculates confidence level based on metadata completeness
    - Generates an ordering decision artifact with detailed rationale

2. **Confidence-Based Action**:
    - **High confidence** (scope + milestone + type): Automatically applies ordering changes, commits, pushes
    - **Medium/Low confidence**: Posts issue comment with recommendation and rationale, requires manual review

3. **Transparency**: All decisions generate an artifact (`ordering-decision.json`) uploaded to workflow artifacts for audit and troubleshooting.

This approach balances automation efficiency with safety, ensuring well-specified issues are processed immediately while flagging incomplete issues for human review.

**Deprecated Scripts**: The legacy `analyze-issue-priority.mjs` and `apply-impl-order-assignment.mjs` scripts have been removed. All functionality is now consolidated in `assign-impl-order.mjs`.

#### Legacy Scoring (Reference Only)

For context, the former model considered these factors (retained here only as historical reference):

**Scope Labels** (primary factor):

- `scope:core` - Highest priority (foundation work)
- `scope:world` - High priority (core game mechanics)
- `scope:traversal` - Medium-high priority
- `scope:security` - Medium-high priority
- `scope:ai` - Medium priority
- `scope:mcp` - Medium-low priority
- `scope:systems` - Lower priority
- `scope:observability` - Lower priority
- `scope:devx` - Lowest priority

**Roadmap Path Dependencies** (legacy weighted factor):

- **Navigation Phase 1**: Core traversal foundation (locations, exits, graph) - Highest weight
- **World Foundation**: World rules, lore, biomes, player identity - Very high weight
- **Navigation Phase 2**: Normalization, direction handling, caching - High weight
- **AI Stages M3-M4**: MCP read-only tools integration - Medium-high weight
- **AI Stage M5+**: MCP mutation tools, advanced AI - Medium weight
- **Navigation Phase 3**: AI-driven exit generation - Medium weight
- **Infrastructure**: Telemetry, observability, testing, DevX - Lower weight

Legacy logic parsed issue bodies for keywords to infer phase. The new helper script does NOT perform deep content/keyword matching (future enhancement candidate).

**Type Labels**:

- `feature` - Standard feature work
- `infra` - Infrastructure changes
- `enhancement` - Improvements to existing features
- `refactor` - Code quality improvements
- `spike` - Research/investigation work
- `test` - Testing improvements
- `docs` - Documentation updates (lowest priority)

**Milestones**:

- `M0` - Foundation (highest priority)
- `M1` - Core Systems
- `M2` - World Building
- `M3` - Traversal
- `M4` - AI Integration
- `M5` - Systems Polish (lowest priority)

**Content Keywords**:

- High priority: "foundation", "bootstrap", "persistence", "core", "essential", "database", "security"
- Medium priority: "command", "api", "utility", "feature", "enhancement"
- Low priority: "documentation", "polish", "cleanup", "maintenance"

**Dependencies (Legacy)**: Blocking relationships nudged scores. This is currently omitted (low ROI vs complexity). Could be reinstated by enriching the helper.

### Decision Logic (Current)

The helper script supports three strategies:

| Strategy       | Flag `--strategy` | Behavior                                                                                                   |
| -------------- | ----------------- | ---------------------------------------------------------------------------------------------------------- |
| auto (default) | auto              | Re-scores all issues and outputs a full contiguous plan (score desc, tie by previous order, then issue #). |
| append         | append            | Places target issue at end (order = N+1) without touching existing items.                                  |
| scope-block    | scope-block       | Inserts after the last item sharing the same `scope:*` label (else appends).                               |

Apply mode mutates only rows whose numeric value changes (minimal drift footprint).

### Concurrency & Safety

Because ordering updates are now explicit (invoked on demand) the prior JSON file backup/restore logic is unnecessary. Safety characteristics now rely on:

- Project field being the single source of truth.
- The helper producing a dry-run JSON diff for review before `--apply`.
- `sync:impl-order:validate` ensuring contiguous integers (CI or local pre-check).

## Manual Overrides

Preferred flow:

1. Run helper in dry-run: `npm run assign:impl-order -- --issue <num>`.
2. Review JSON output (recommendedOrder + diff list).
3. If acceptable, apply: `GITHUB_TOKEN=... npm run assign:impl-order -- --issue <num> --apply`.
4. Regenerate docs: `npm run sync:impl-order:apply` (reads Project and rewrites `docs/roadmap.md`).
5. If only appending: use `--strategy append` to avoid touching earlier items.

## Audit Trail

Currently changes are Project-field edits (visible in Project history) plus regenerated `docs/roadmap.md` diffs. Optional future enhancement: helper can emit an issue comment summarizing alterations (not yet implemented).

## Edge Cases

### Insufficient Issue Detail

If an issue lacks sufficient information for analysis:

- It's assigned low priority and appended to the end
- A comment explains the assignment and requests more detail

### Multiple Simultaneous Issues

The concurrency control prevents race conditions, but issues may be processed sequentially rather than simultaneously.

### Manual vs Automatic Conflicts

The system detects and respects recent manual changes to prevent conflicts.

### Closed Issues

Closed issues are ignored unless explicitly forced via workflow dispatch.

## Monitoring and Troubleshooting

### Workflow Logs

Check the "Auto Assign Implementation Order" workflow for detailed logs of:

- Issue analysis results
- Priority calculations
- Assignment decisions
- Any errors or warnings

### Common Issues

**Issue not assigned order**:

- Check if issue is closed
- Verify labels are correctly formatted (`scope:core` not `core`)
- Look for workflow errors in Actions tab

**Wrong priority assigned**:

- Review the analysis rationale in workflow logs
- Consider if labels/milestone need adjustment
- Manual override if needed

**Race condition errors**:

- Retry the workflow dispatch manually
- Check for concurrent workflow runs

### Testing

Heuristic scoring currently resides inline in `scripts/assign-impl-order.mjs`. If stability becomes critical, extract pure scoring + ordering functions and add node:test coverage. Legacy JSON harness removed.

## Configuration

### Workflow Settings

Primary workflows:

| Purpose                                             | Workflow                     |
| --------------------------------------------------- | ---------------------------- |
| Per‑issue reactive assignment + doc drift heuristic | `auto-assign-impl-order.yml` |
| Consolidated sync / validation / batch finalize     | `impl-order-sync.yml`        |

`impl-order-sync.yml` merged prior `impl-order-sync.yml`, `impl-order-validate.yml`, and `auto-impl-order-finalize.yml`.

Jobs inside consolidated workflow:

| Job        | When It Runs                                                                                  | Actions                                                                                  |
| ---------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `sync`     | Push to ordering/scripts, PR touching ordering, manual apply/resequence (`workflow_dispatch`) | Validate → auto-fix drift → optional resequence → ensure labels → regenerate docs + JSON |
| `validate` | Daily schedule (05:23 UTC) or manual `mode=validate`                                          | Strict (canonical repo) vs lenient (fork) contiguous ordering validation                 |
| `finalize` | Issue events burst (opened / labeled / etc.) or manual `mode=finalize`                        | Debounced ensure all open issues appear in ordering, apply & regenerate docs             |

Tuning knobs:

- Debounce: `workflow_dispatch` input `debounce_seconds` (default 25s) controls batch window for finalize job.
- Manual modes: `mode=apply|resequence|validate|finalize` via dispatch.
- Label sync only occurs when an apply/resequence changed ordering.

To adjust triggers/timeouts edit the respective job section in `.github/workflows/impl-order-sync.yml`.

## Automation Maturity Stages

Automation will evolve through defined stages. Each stage has clear entry conditions, scoped changes, acceptance criteria, and rollback posture. Stage 0 (current) is committed; later stages tracked as separate issues.

| Stage | Name                    | Focus                                         | Key Additions                                                 | Exit / Acceptance                                 | Rollback Trigger                         |
| ----- | ----------------------- | --------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------- |
| 0     | Baseline Reactive       | Stable per-issue ordering + consolidated sync | Consolidated workflow, manual resequence, daily validate      | Zero gaps; manual adjustments ≤ defined tolerance | Ordering drift or excessive manual edits |
| 1     | MVP Full Automation     | Confidence-gated auto apply                   | Auto-apply high-confidence, append low-info, metrics artifact | ≥80% issues auto-applied w/out override           | Spike in overrides >20% weekly           |
| 2     | Predictive Scheduling   | Integrate provisional dates early             | Provisional Start/Finish comments, partial rebaseline         | Median variance <10% vs daily scheduler           | Variance >25% over 1 week                |
| 3     | Parallel Streams        | Capacity-aware planning                       | Multi-cursor scheduling, WIP limits                           | No resource contention alerts for 2 weeks         | Sustained contention alerts              |
| 4     | Adaptive Prioritization | Data-informed refinements                     | Historical feature extraction, optional model                 | Model suggestions accepted ≥60%                   | Precision <40% or high false positives   |
| 5     | No-Touch Mode           | Silent automation                             | Weekly digest only, anomaly alerts                            | <5% anomaly rate                                  | Anomalies >10% for 2 cycles              |

### Stage 0 (Baseline Reactive) – Implemented

Current state: Human-in-loop resequencing, deterministic scripts, consolidated workflow. Risk managed through daily validation.

### Stage 1 (MVP Full Automation) – Implemented

**Status**: Active (Current Stage)

**Implementation**:

The workflow now supports confidence-based auto-apply with the following features:

1. **Confidence Scoring**: Issues are automatically analyzed and assigned confidence levels:
    - **High**: Has scope label + milestone + type label → Auto-applies ordering changes without manual review
    - **Medium**: Has scope label + (milestone OR type label) → Requires manual review, posts comment
    - **Low**: Missing scope or both milestone and type → Requires manual review, posts comment with warning

2. **Auto-Apply Path**: When confidence is high and changes are required, the workflow automatically:
    - Applies ordering changes to the Project field
    - Syncs and regenerates roadmap documentation
    - Commits and pushes changes with clear commit messages
    - No issue comment is posted (silent success)

3. **Artifact Generation**: Every run generates `ordering-decision.json` containing:
    - Confidence level and priority score
    - Recommended order and changes required
    - Detailed rationale (scope, type, milestone)
    - Full diff and reordering plan
    - Timestamp and metadata

4. **Sparse Metadata Handling**: Issues with incomplete metadata are still processed using append strategy:
    - Assigned to the end of the implementation order
    - Marked with low confidence
    - Comment explains what metadata is missing

**Acceptance Criteria Progress**:

- ✅ High confidence path auto-applies without manual intervention
- ✅ Artifact generation for all processed issues
- ✅ Comment only on medium/low confidence
- ⏳ Weekly metrics summary (placeholder script created, full implementation pending)
- ⏳ Tracking override rate (requires historical data collection)
- ⏳ 80% auto-apply rate measurement (requires 7-day observation window)

**Usage**:

High confidence issues (scope + milestone + type) are automatically assigned and applied. Medium/low confidence issues receive a comment explaining the recommendation and requesting metadata improvements.

To manually apply a recommendation: `npm run assign:impl-order -- --issue <number> --apply`

**Weekly Metrics**: Run `node scripts/weekly-ordering-metrics.mjs` for current status (placeholder implementation).

### Stage 2 (Predictive Scheduling Integration)

Requirements:

- Auto-apply ordering when confidence = high.
- Auto-append for sparse metadata issues (no manual block).
- Artifact: `ordering-decision.json` (score, rationale, diff summary).
- Comment only on medium/low confidence or ambiguous label mismatches.
  Acceptance:
- ≥80% of issues enter without manual reorder.
- Zero contiguous gap regressions.
  Metrics:
- Track workflow outcomes and manual override rate.

### Stage 2 (Predictive Scheduling Integration)

Requirements:

- Inline provisional duration & dates on assignment.
- Scheduler compares provisional vs applied; annotate variance.
- Fast partial rebaseline when status flips to In progress.
  Acceptance:
- Median provisional vs final variance <10%.
- Manual scheduler reruns reduced ≥70%.

### Stage 3 (Parallel Stream Awareness)

Requirements:

- Configurable capacity (e.g. `roadmap/capacity.json`).
- N independent cursors; scope affinity optional.
- WIP limit alert when > capacity active.
  Acceptance:
- Zero overlapping allocation incidents (contention) for 2 weeks.

### Stage 4 (Adaptive / ML-Assisted Prioritization)

Requirements:

- Collect feature metrics (lines changed, review count, reopen count).
- Lightweight regression/classifier producing score adjustments (shadow mode first → compare to heuristic).
  Acceptance:
- ≥60% automated score suggestions accepted unchanged.

### Stage 5 (Full No-Touch Mode)

Requirements:

- High-confidence path: silent apply.
- Weekly digest summarizing: changes, forecast accuracy, anomalies.
- Anomaly rules: low confidence, variance > threshold, sudden capacity saturation.
  Acceptance:
- <5% anomalies.

### Rollback Strategy

Any stage can revert to previous by disabling its feature flag (future `automation-flags.json`) and removing added workflow steps; core Stage 0 scripts remain intact.

### Tracking

Each stage (1–5) has a dedicated GitHub issue capturing: scope, tasks, acceptance criteria, risk, rollback triggers.

### Priority Weights / Assignment Logic

Adjust weights or strategies by editing `scripts/assign-impl-order.mjs`:

- Scope ordering: `SCOPE_PRIORITY` and derived weights.
- Type weights: `TYPE_WEIGHT` map.
- Milestone influence: `milestoneWeight()` function.
- Ordering sort chain in the auto strategy (score -> original order -> issue #).

Add new strategy by extending `applyStrategy()`.

## Integration with Existing Workflows

Automation now operates solely against the Project field (no JSON layer). Sync workflows regenerate docs directly from live Project data.

## New Assignment Tool

Script: `scripts/assign-impl-order.mjs` (npm: `assign:impl-order`).

**Stage 1 Enhancements**: The script now supports confidence scoring, artifact generation, and telemetry emission.

Dry-run example:

```bash
GITHUB_TOKEN=ghp_xxx npm run assign:impl-order -- --issue 123
```

Apply with high confidence:

```bash
GITHUB_TOKEN=ghp_xxx npm run assign:impl-order -- --issue 123 --apply
```

Generate artifact:

```bash
GITHUB_TOKEN=ghp_xxx npm run assign:impl-order -- --issue 123 --artifact decision.json
```

Full options:

```bash
npm run assign:impl-order -- --issue 123 \
  --apply \
  --strategy auto \
  --artifact ordering-decision.json
```

Outputs JSON with confidence and metadata:

```json
{
	"strategy": "auto",
	"issue": 123,
	"recommendedOrder": 14,
	"confidence": "high",
	"score": 180,
	"rationale": "Issue #123: scope=scope:core, type=feature, milestone=M0, score=180. Strategy: auto. Changes required: 3.",
	"changes": 3,
	"diff": [{ "issue": 45, "from": 12, "to": 11 }, ...],
	"plan": [{ "issue": 17, "score": 210, "desiredOrder": 1 }, ...],
	"metadata": {
		"scope": "scope:core",
		"type": "feature",
		"milestone": "M0",
		"timestamp": "2025-01-15T10:30:00.000Z"
	}
}
}
```

**Confidence Levels**:

- **High**: Issue has scope label + milestone + type label
- **Medium**: Issue has scope label + (milestone OR type label)
- **Low**: Issue missing scope or both milestone and type

No changes (no-op) keeps ordering stable.

## Rollback / Removal

If the helper behaves unexpectedly:

1. Manually correct any order values in the Project UI (drag or edit field numbers).
2. Run `npm run sync:impl-order:apply` to regenerate docs.
3. Remove helper: delete `scripts/assign-impl-order.mjs` + its npm script entry.
4. (Optional) Reintroduce a simpler append-only practice until heuristics are revised.

## Future Enhancements

Potential roadmap:

- Dependency graph influence (blocked/by) reintroduction.
- Confidence scoring & optional issue comment output.
- Bulk re-balance mode (simulate before apply with risk scoring).
- ML-assisted classification (scope inference from text).
- Status-aware ordering (e.g., pin In Progress items against inadvertent repositioning).
