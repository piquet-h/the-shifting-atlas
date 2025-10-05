# Stage 2 Sub-Issues: Quick Reference

## What Was Created

This task created **comprehensive planning documentation** for Stage 2 of the roadmap automation system. All files are in `docs/planning/stage2-subissues/`.

### 📦 Deliverables Summary

- **7 sub-issue specifications** (~100KB total)
- **Implementation sequence** with dependencies
- **Batch creation script** for GitHub issues
- **Complete technical specs** for all components
- **Testing strategies** and acceptance criteria
- **Rollback procedures** for each component

## 🚀 How to Use These Files

### Step 1: Review the Sub-Issues

```bash
cd docs/planning/stage2-subissues

# Read the overview first
cat README.md

# Review the summary with dependency graph
cat 00-SUMMARY.md

# Browse individual sub-issues
ls -1 *.md
```

### Step 2: Create GitHub Issues

**Option A: Automated Batch Creation (Recommended)**

```bash
cd docs/planning/stage2-subissues

# Make sure you have GitHub CLI installed and authenticated
gh auth status

# Run the batch creation script
./create-stage2-issues.sh
```

**Option B: Manual Creation**

Follow the instructions in `CREATE-ISSUES.md`:

```bash
cat CREATE-ISSUES.md
```

Then run individual `gh issue create` commands for each sub-issue.

### Step 3: Link to Parent Issue

After creating the issues, link them to parent issue #83:

```bash
# Replace XXX with actual issue numbers
gh issue comment 83 --repo piquet-h/the-shifting-atlas --body "
## Sub-Issues Created

Stage 2 implementation broken into 7 sub-issues:

**Phase 1 - Foundation:**
- [ ] #XXX - Duration Estimation Module
- [ ] #XXX - Provisional Storage Schema

**Phase 2 - Features:**
- [ ] #XXX - Provisional Comment Format
- [ ] #XXX - Variance Calculation

**Phase 3 - Observability:**
- [ ] #XXX - Diagnostic Alert Logic
- [ ] #XXX - Telemetry Integration

**Phase 4 - Documentation:**
- [ ] #XXX - Documentation Updates

See \`docs/planning/stage2-subissues/\` for full specifications.
"
```

### Step 4: Assign Implementation Order

Use the existing automation:

```bash
# Assign order to each sub-issue
for issue in XXX XXX XXX XXX XXX XXX XXX; do
    GITHUB_TOKEN=$YOUR_TOKEN npm run assign:impl-order -- \
        --issue $issue \
        --strategy scope-block \
        --apply
done
```

### Step 5: Begin Implementation

**Week 1 - Phase 1 (Parallel):**

- Start sub-issue #1 (Duration Estimation)
- Start sub-issue #3 (Storage Schema) in parallel

**Week 2 - Phase 2 (Sequential):**

- Complete sub-issue #2 (Comment Format) - depends on #1
- Start sub-issue #4 (Variance Calculation) - depends on #1, #3

**Week 3 - Phase 3 (Parallel):**

- Complete sub-issue #5 (Alert Logic) - depends on #4
- Complete sub-issue #6 (Telemetry) - depends on #1, #3

**Week 3-4 - Phase 4:**

- Complete sub-issue #7 (Documentation) - depends on all

## 📋 Sub-Issue Overview

| #   | Title                      | Labels              | Duration | Dependencies |
| --- | -------------------------- | ------------------- | -------- | ------------ |
| 1   | Duration Estimation Module | devx, refactor      | 3d       | -            |
| 2   | Provisional Comment Format | docs, enhancement   | 2d       | #1           |
| 3   | Provisional Storage Schema | docs, devx          | 3d       | #1           |
| 4   | Variance Calculation       | devx, enhancement   | 4d       | #1, #3       |
| 5   | Alert Logic                | devx, observability | 3d       | #4           |
| 6   | Telemetry Integration      | observability       | 2d       | #1, #3       |
| 7   | Documentation Updates      | docs                | 3d       | All          |

## 🎯 Key Specifications

### Duration Estimation

- **Sample thresholds:** 5 (scope|type), 3 (scope), 10 (global)
- **Confidence:** High/Medium/Low based on sample size
- **Fallback:** DEFAULT_DURATION_DAYS = 2

### Provisional Storage

- **Location:** GitHub Projects v2 custom fields
    - Provisional Start (Date)
    - Provisional Finish (Date)
    - Provisional Confidence (Single select: High/Medium/Low)
    - Estimation Basis (Text)
- **Decision:** Native custom fields (officially supported by GitHub)
- **Access:** GraphQL API

### Variance Formula

```javascript
overallVariance = abs(finishDelta) / provisionalDuration
```

### Alert Thresholds

- 🟢 **Green:** <10% (target)
- 🟡 **Yellow:** 10-25% (warning)
- 🔴 **Red:** >25% (create alert issue)

### Comment Marker

```html
<!-- PROVISIONAL_SCHEDULE:v1 -->
```

### Telemetry Separation

- **Build telemetry:** `scripts/shared/build-telemetry.mjs` (CI/automation)
- **Game telemetry:** `shared/src/telemetry.ts` (game events only)
- **Event prefix:** `build.` for automation events
- **Custom dimension:** `telemetrySource: 'build-automation'`
- **CRITICAL RULE:** The `shared/` folder is exclusively for game domain code

## 🔗 Dependency Chain

```
Duration Estimation (#1) is FOUNDATIONAL
    ├──> Comment Format (#2)
    ├──> Storage Schema (#3) ──> Variance (#4) ──> Alerts (#5)
    └──> Telemetry (#6)

ALL ──> Documentation (#7) MUST BE LAST
```

## ✅ Acceptance Criteria (Stage 2)

From parent issue #83:

- Median provisional variance <10%
- Scheduler re-run requests ↓ ≥70%
- Variance alerts <1 per month

## 🔄 Rollback Trigger

**Exit Criteria:** Variance >25% for 3 consecutive weeks

**Procedure:**

1. Disable provisional comments (workflow edit)
2. Stop variance calculations
3. Archive provisional-schedules.json
4. Document issues and plan fixes

## 📚 File Reference

### Main Documents

- `README.md` - This guide's source + quick start
- `00-SUMMARY.md` - Overview with dependency graph (7.7KB)

### Sub-Issue Specs

- `01-duration-estimation-module.md` (6.5KB)
- `02-provisional-comment-format.md` (9.6KB)
- `03-provisional-storage-schema.md` (13.5KB)
- `04-variance-calculation.md` (14KB)
- `05-diagnostic-alert-logic.md` (16KB)
- `06-telemetry-integration.md` (15.8KB)
- `07-documentation-updates.md` (17KB)

### Utilities

- `CREATE-ISSUES.md` - GitHub CLI commands (7.3KB)
- `create-stage2-issues.sh` - Batch creation script (executable)

## 💡 Tips

**Before Creating Issues:**

1. Review all specs with team
2. Confirm labels exist in repository
3. Verify milestone "M0" exists
4. Have GITHUB_TOKEN ready

**During Implementation:**

1. Follow dependency order strictly
2. Don't skip tests (≥90% coverage target)
3. Update docs inline with code
4. Use rollback procedures if issues arise

**After Each Sub-Issue:**

1. Run full test suite
2. Update parent issue #83 checklist
3. Document any spec deviations
4. Prepare for next phase

## 🆘 Troubleshooting

**Issue creation fails:**

- Check `gh auth status`
- Verify labels exist: `gh label list`
- Confirm milestone exists: `gh api repos/:owner/:repo/milestones`

**Dependency confusion:**

- Refer to dependency graph in `00-SUMMARY.md`
- #1 must complete before most others
- #7 must be last

**Specs need changes:**

- Update markdown files
- Commit changes
- Regenerate issues if already created

## 📞 Contact

Questions? Refer to:

- Parent issue #83 for discussion
- `docs/developer-workflow/implementation-order-automation.md` for context
- `.github/copilot-instructions.md` for automation guidelines

---

_Generated for The Shifting Atlas - Stage 2 Predictive Scheduling_
