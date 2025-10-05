# Stage 2 Sub-Issues Summary

**Parent Issue:** #83 - Automation Stage 2: Predictive Scheduling Integration

This document provides an overview of all sub-issues created for Stage 2 implementation.

## Sub-Issues Overview

| #   | Title                                              | Labels                                                   | Est. Duration | Dependencies |
| --- | -------------------------------------------------- | -------------------------------------------------------- | ------------- | ------------ |
| 1   | Extract Duration Estimation as Shared Module       | `scope:devx`, `refactor`, `M0`                           | 3 days        | None         |
| 2   | Define Provisional Schedule Comment Format         | `docs`, `enhancement`, `M0`                              | 2 days        | #1           |
| 3   | Specify Provisional Data Storage Schema            | `docs`, `enhancement`, `scope:devx`, `M0`                | 3 days        | #1           |
| 4   | Implement Variance Calculation and Rolling Window  | `scope:devx`, `enhancement`, `M0`                        | 4 days        | #1, #3       |
| 5   | Add Diagnostic Alert Issue Logic for High Variance | `scope:devx`, `enhancement`, `scope:observability`, `M0` | 3 days        | #4           |
| 6   | Extend Scheduler to Emit Telemetry                 | `scope:observability`, `enhancement`, `M0`               | 2 days        | #1, #3       |
| 7   | Update Documentation for Stage 2                   | `docs`, `M0`                                             | 3 days        | All (1-6)    |

**Total Estimated Duration:** 20 days (with parallelization, ~3-4 weeks)

## Implementation Sequence

### Phase 1: Foundation (Week 1)

**Parallel tracks:**

- **Track A:** Sub-issue #1 (Duration Estimation Module) - 3 days
- **Track B:** Sub-issue #3 (Storage Schema) - 3 days (can draft in parallel, finalize after #1)

**Deliverables:**

- Reusable duration estimation module
- Provisional storage schema and CRUD operations

### Phase 2: Features (Week 2)

**Sequential:**

1. Sub-issue #2 (Comment Format) - 2 days (depends on #1)
2. Sub-issue #4 (Variance Calculation) - 4 days (depends on #1, #3)

**Deliverables:**

- Provisional comments posted to issues
- Variance calculation working

### Phase 3: Observability (Week 3)

**Parallel tracks:**

- **Track A:** Sub-issue #5 (Alert Logic) - 3 days (depends on #4)
- **Track B:** Sub-issue #6 (Telemetry) - 2 days (depends on #1, #3)

**Deliverables:**

- Variance alerts created automatically
- Telemetry emitted to Application Insights

### Phase 4: Documentation (Week 3-4)

**Sequential:**

- Sub-issue #7 (Documentation) - 3 days (depends on all)

**Deliverables:**

- Comprehensive documentation for Stage 2
- Updated automation guides

## Dependency Graph

```
    #1 (Duration Estimation)
    ├──> #2 (Comment Format)
    ├──> #3 (Storage Schema)
    ├──> #4 (Variance Calculation) ──> #5 (Alert Logic)
    └──> #6 (Telemetry)

    All ──> #7 (Documentation)
```

## Key Decisions Made

### 1. Duration Estimation

- **Calendar days** not working days (weekend handling deferred)
- **Minimum sample sizes:** 5 for scope|type, 3 for scope, 10 for global
- **Confidence levels:** High (≥5 scope|type), Medium (≥3 scope or ≥10 global), Low (fallback)

### 2. Provisional Comment Format

- **Marker:** `<!-- PROVISIONAL_SCHEDULE:v1 -->`
- **Idempotent:** Update same comment (don't duplicate)
- **Conditions:** Only post for high-confidence, non-closed issues

### 3. Provisional Storage

- **Location:** GitHub Projects v2 custom fields
- **Custom Fields:** Provisional Start (Date), Provisional Finish (Date), Provisional Confidence (Single select), Estimation Basis (Text)
- **Decision:** Native custom fields are the correct choice (officially supported by GitHub)
- **Access:** GraphQL API for reading/writing custom field values

### 4. Variance Calculation

- **Formula:** Finish-weighted (abs(finishDelta) / provisionalDuration)
- **Window:** 30-day rolling window
- **Thresholds:** 10% (target), 25% (alert), 40% (critical)
- **Aggregation:** Median (more robust than mean)

### 5. Alert Logic

- **Period:** Weekly (ISO week YYYY-Www)
- **Aggregation:** Single issue per period
- **Escalation:** 2 weeks → escalated label, 3 weeks → rollback warning
- **Auto-close:** When variance <25% for 7 consecutive days

### 6. Telemetry

- **Event name:** `build.schedule_variance` (build telemetry, NOT game telemetry)
- **Module:** `scripts/shared/build-telemetry.mjs` (MUST be separate from `shared/src/telemetry.ts`)
- **Backend:** Application Insights
- **Separation:** Build events use `build.` prefix and `telemetrySource: 'build-automation'`
- **Critical Rule:** The `shared/` folder is exclusively for game domain code
- **Fallback:** Console logging when AppInsights unavailable

## Success Metrics

**Stage 2 exit criteria (from parent issue):**

- Median provisional variance <10%
- Scheduler re-run requests ↓ ≥70%

**Additional metrics to track:**

- Variance alert frequency (target: <1 per month)
- Provisional schedule confidence distribution
- Duration estimation accuracy by scope/type
- Partial rebaseline frequency

## Risks and Mitigations

| Risk                                      | Likelihood       | Impact | Mitigation                                             |
| ----------------------------------------- | ---------------- | ------ | ------------------------------------------------------ |
| Provisional comments spam issues          | Medium           | Low    | Idempotent update, only high-confidence                |
| Storage file conflicts (concurrent edits) | Low              | Medium | Accept last-write-wins for now, consider DB in Stage 3 |
| High variance due to small dataset        | High (initially) | Medium | Clear confidence levels, bootstrap period tolerance    |
| Alert fatigue                             | Low              | Medium | Weekly aggregation, auto-close, pattern detection      |
| Telemetry performance impact              | Low              | Low    | Non-blocking, async, graceful degradation              |
| Complexity overwhelms users               | Medium           | High   | Comprehensive docs, examples, troubleshooting          |

## Rollback Plan

**Trigger:** Median variance >25% for 3 consecutive weeks

**Steps:**

1. Disable provisional comment posting (workflow change)
2. Stop variance calculations (keep manual dispatch)
3. Archive provisional-schedules.json
4. Document issues discovered
5. Plan fixes based on data analysis

**Preserved:**

- Historical variance data (Application Insights)
- Core ordering automation (unaffected)
- Daily scheduling (unaffected)

## Testing Strategy

### Per Sub-Issue

- Unit tests for new modules (≥90% coverage target)
- Integration tests for workflows
- Manual testing with real project data

### End-to-End

1. **Happy path:**
    - Assign order → provisional posted → scheduler runs → variance calculated → no alert (variance <10%)

2. **Alert path:**
    - Multiple issues with high variance → alert created → variance improves → alert auto-closed

3. **Rebaseline path:**
    - Issue status → "In progress" → downstream issues recalculated → comments updated

4. **Low data path:**
    - New scope/type → low confidence → fallback estimate → no comment posted

## FAQ

**Q: Why use GitHub Projects custom fields for storage?**
A: GitHub Projects v2 officially supports custom fields. This is the correct architectural choice - native integration, no file conflicts, queryable via GraphQL, and survives issue reorganization.

**Q: What about a repo file approach?**
A: Not needed. Custom fields are officially supported and sufficient for provisional schedule data.

**Q: Why weekly alerts instead of daily?**
A: Balance responsiveness vs noise. Daily alerts would be too frequent; weekly provides actionable cadence.

**Q: Why finish-weighted variance instead of average?**
A: Finish date matters most for dependencies and stakeholder expectations. Start date variance is less critical.

**Q: What if variance is consistently high?**
A: First investigate root causes (estimation model, sample quality, external factors). If persistent, rollback per exit criteria.

**Q: How do we separate build and game telemetry?**
A: **Critical architectural rule:** Use separate modules. `scripts/shared/build-telemetry.mjs` for CI/automation events (scheduler, ordering); `shared/src/telemetry.ts` for game events ONLY (player, world, navigation). Build events use `build.` prefix and custom dimension `telemetrySource: 'build-automation'`. The `shared/` folder is exclusively for game domain code - DO NOT mix them.

**Q: Can we skip low-confidence provisional schedules?**
A: Yes, low-confidence schedules are not posted as comments (to avoid noise). They may still be stored for variance tracking.

**Q: How do we improve estimation accuracy over time?**
A: As more issues close with accurate dates, historical sample size grows, improving confidence and accuracy naturally.

## Next Steps

1. **Review sub-issues with team**
2. **Prioritize any adjustments to specifications**
3. **Create GitHub issues from markdown files**
4. **Assign implementation order to sub-issues**
5. **Begin Phase 1 implementation**

## References

- Parent Issue: #83
- Stage 1 Issue: #82 (completed)
- Stage 3 Issue: #84 (planned)
- Implementation Order Automation Docs: [docs/developer-workflow/implementation-order-automation.md](../../docs/developer-workflow/implementation-order-automation.md)
- Roadmap Scheduling Docs: [docs/developer-workflow/roadmap-scheduling.md](../../docs/developer-workflow/roadmap-scheduling.md)
