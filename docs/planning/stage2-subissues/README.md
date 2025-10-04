# Stage 2 Sub-Issues Documentation

This directory contains detailed specifications for all sub-issues required to implement **Automation Stage 2: Predictive Scheduling Integration** (parent issue #83).

## Contents

| File | Description |
|------|-------------|
| `00-SUMMARY.md` | Overview of all sub-issues with dependency graph and implementation sequence |
| `01-duration-estimation-module.md` | Extract historical duration estimation into reusable module |
| `02-provisional-comment-format.md` | Define canonical format for provisional schedule comments |
| `03-provisional-storage-schema.md` | Specify JSON schema and storage location for provisional data |
| `04-variance-calculation.md` | Implement variance metrics and rolling window aggregation |
| `05-diagnostic-alert-logic.md` | Create automated alert issues for high variance |
| `06-telemetry-integration.md` | Extend scheduler to emit observability events |
| `07-documentation-updates.md` | Update all affected documentation |
| `CREATE-ISSUES.md` | GitHub CLI commands to create all issues |
| `README.md` | This file |

## Quick Start

1. **Review Summary:**
   ```bash
   cat 00-SUMMARY.md
   ```

2. **Review Individual Sub-Issues:**
   Each markdown file is a complete issue specification with:
   - Context and requirements
   - Technical specifications
   - Acceptance criteria
   - Testing strategy
   - Documentation impact
   - Rollback procedure

3. **Create GitHub Issues:**
   ```bash
   # Follow instructions in CREATE-ISSUES.md
   cat CREATE-ISSUES.md
   
   # Run batch creation script
   ./create-stage2-issues.sh
   ```

## Implementation Approach

### Recommended Sequence

**Week 1 - Foundation:**
- Sub-issue #1: Duration Estimation Module (3 days)
- Sub-issue #3: Provisional Storage Schema (3 days) [parallel]

**Week 2 - Features:**
- Sub-issue #2: Comment Format (2 days)
- Sub-issue #4: Variance Calculation (4 days)

**Week 3 - Observability:**
- Sub-issue #5: Alert Logic (3 days)
- Sub-issue #6: Telemetry (2 days) [parallel]

**Week 3-4 - Documentation:**
- Sub-issue #7: Documentation Updates (3 days)

**Total:** ~20 days sequential, 3-4 weeks with parallelization

### Dependency Rules

```
#1 (Duration Estimation) → MUST complete first (foundational)
  ├─> #2 (Comment Format)
  ├─> #3 (Storage Schema) [can draft in parallel]
  ├─> #4 (Variance) → #5 (Alerts)
  └─> #6 (Telemetry)

All → #7 (Documentation) MUST be last
```

## Key Design Decisions

### Storage
- **Primary:** GitHub Projects v2 custom fields
  - Provisional Start (Date)
  - Provisional Finish (Date) 
  - Provisional Confidence (Single select: High/Medium/Low)
  - Estimation Basis (Text)
- **Fallback:** `roadmap/provisional-schedules.json` if custom fields insufficient
- **Rationale:** Native, queryable via GraphQL, no file conflicts
- **Access:** [GitHub Projects custom fields documentation](https://docs.github.com/en/issues/planning-and-tracking-with-projects/understanding-fields)

### Variance Formula
- **Method:** Finish-weighted (abs(finishDelta) / provisionalDuration)
- **Rationale:** Finish date most important for planning
- **Threshold:** 10% target, 25% alert, 40% critical

### Alert Cadence
- **Period:** Weekly (ISO week)
- **Aggregation:** One issue per period (not per variance item)
- **Rationale:** Balances noise vs responsiveness

### Confidence Levels
- **High:** ≥5 samples for scope|type combination
- **Medium:** ≥3 samples for scope OR ≥10 globally
- **Low:** Fallback to default (2 days)

### Comment Strategy
- **Marker:** `<!-- PROVISIONAL_SCHEDULE:v1 -->`
- **Idempotent:** Update same comment (no duplicates)
- **Visibility:** Only post high-confidence estimates

### Telemetry Separation
- **Build telemetry:** `scripts/shared/build-telemetry.mjs`
  - Purpose: CI/automation events (scheduler, ordering, variance)
  - Event prefix: `build.` (e.g., `build.schedule_variance`)
  - Custom dimension: `telemetrySource: 'build-automation'`
- **Game telemetry:** `shared/src/telemetry.ts`
  - Purpose: Game domain events only (player, world, navigation)
  - Event format: `Domain.Subject.Action`
  - Part of game code in `shared/`
- **Rationale:** Keep shared folder for game code only; prevents pollution of game telemetry with build noise

## Testing Strategy

Each sub-issue includes:
- **Unit tests:** ≥90% coverage target for new modules
- **Integration tests:** Workflow end-to-end validation
- **Manual tests:** Real project data scenarios

## Success Metrics

**Stage 2 Exit Criteria:**
- Median provisional variance <10%
- Scheduler re-run requests ↓ ≥70%

**Operational Metrics:**
- Variance alerts: <1 per month
- High-confidence estimates: ≥80% of issues
- Estimation accuracy improving over time

## Rollback Plan

**Trigger:** Median variance >25% for 3 consecutive weeks

**Procedure:**
1. Disable provisional comments (workflow change)
2. Stop variance calculations (keep data collection)
3. Archive provisional-schedules.json
4. Analyze root causes
5. Plan fixes and re-attempt

**Impact:** Core automation unaffected (ordering, daily scheduling continue)

## FAQ

**Q: Can we implement sub-issues out of order?**
A: No. Dependency graph must be respected. #1 is foundational; others depend on it.

**Q: Can sub-issues be split further?**
A: Yes, if needed. Each sub-issue includes acceptance criteria that can be broken into smaller tasks.

**Q: What if we discover issues during implementation?**
A: Update parent issue #83 and relevant sub-issue. Document decisions in issue comments.

**Q: How do we handle scope creep?**
A: Stage 2 scope is fixed. New ideas go to Stage 3 (#84) or future stages.

**Q: Can we skip telemetry (sub-issue #6)?**
A: Not recommended. Telemetry is critical for measuring Stage 2 success and detecting issues early.

**Q: What if variance is consistently high?**
A: Follow rollback plan. Don't force Stage 2 if estimates are consistently inaccurate.

## Related Documentation

- **Parent Issue:** #83 - Automation Stage 2: Predictive Scheduling Integration
- **Stage 1:** #82 - MVP Full Automation (completed)
- **Stage 3:** #84 - Parallel Stream Awareness (planned)
- **Automation Docs:** [docs/developer-workflow/implementation-order-automation.md](../../docs/developer-workflow/implementation-order-automation.md)
- **Scheduling Docs:** [docs/developer-workflow/roadmap-scheduling.md](../../docs/developer-workflow/roadmap-scheduling.md)

## Contributing

When implementing sub-issues:
1. Read full sub-issue specification
2. Review acceptance criteria
3. Write tests first (TDD approach)
4. Implement minimal changes
5. Update documentation inline with code
6. Run full test suite before PR
7. Request review with sub-issue number in PR title

## Notes

- All sub-issues are scoped for M0 milestone
- Estimated durations are conservative; adjust as needed
- Each sub-issue is self-contained with full context
- Cross-references between sub-issues are documented
- Rollback procedures included in each sub-issue

---

*Generated for The Shifting Atlas - Automation Stage 2 Planning*
