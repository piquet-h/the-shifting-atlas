# Stage 2 Implementation - Quick Start Guide

This document provides a quick overview of what was implemented and how to enable Stage 2 features.

## What Was Delivered

Stage 2 provides **provisional scheduling** - automatic calculation and posting of estimated Start/Finish dates when issues receive implementation orders.

### Components Implemented

✅ **7 Shared Modules** (`scripts/shared/`)

- duration-estimation.mjs
- provisional-comment.mjs
- provisional-storage.mjs
- build-telemetry.mjs
- (Plus 3 main scripts: calculate-variance, create-variance-alert, post-provisional-schedule)

✅ **3 Workflows**

- Auto-assign order → calculate provisional schedule (updated)
- Daily scheduler → emit variance telemetry (updated)
- Calculate variance → create alerts (new)

✅ **Complete Documentation**

- Stage 2 User Guide
- Shared Modules README
- Updated Roadmap Scheduling docs

## Quick Start (5 Steps)

### Step 1: Create Custom Fields (5 minutes)

Navigate to [Project #3](https://github.com/users/piquet-h/projects/3) and add 4 custom fields:

1. **Provisional Start** - Type: Date
2. **Provisional Finish** - Type: Date
3. **Provisional Confidence** - Type: Single select (options: High, Medium, Low)
4. **Estimation Basis** - Type: Text

**Detailed instructions:** See [Stage 2 User Guide - Setting Up Custom Fields](../developer-workflow/stage2-user-guide.md#setting-up-custom-fields)

### Step 2: Verify Permissions

Existing tokens should work, but verify:

- `PROJECTS_TOKEN` has project write access
- `GITHUB_TOKEN` has issues:write and contents:write

### Step 3: Optional - Configure Telemetry

Set repository secret (recommended but optional):

- `APPLICATIONINSIGHTS_CONNECTION_STRING` - Application Insights connection string

If not set, telemetry logs to console instead (non-blocking).

### Step 4: Test with a New Issue

Create a test issue with:

- Scope label (e.g., `scope:devx`)
- Type label (e.g., `enhancement`)
- Milestone (e.g., `M0`)

The auto-assign workflow should:

1. Assign implementation order
2. Calculate provisional schedule
3. Post a comment with estimated dates (if high/medium confidence)

### Step 5: Monitor Variance

After a few days:

- Check Application Insights for `build.schedule_variance` events
- Review variance alerts (if created)
- Adjust thresholds if needed

## How It Works

### When You Open an Issue

1. **Auto-assignment runs** (if labels + milestone present)
2. **Provisional schedule calculated** using historical data
3. **Comment posted** on issue (high/medium confidence only)
4. **Custom fields set** in project

### Daily Scheduler (00:00 UTC)

1. **Sets actual Start/Finish dates**
2. **Compares to provisional** (if exists)
3. **Emits variance telemetry** to Application Insights

### Variance Calculation (00:30 UTC)

1. **Calculates 30-day rolling window variance**
2. **Creates alert issue** if variance >25%
3. **Auto-closes alert** when variance improves

## Key Concepts

### Confidence Levels

| Level  | Criteria                                  | Result         |
| ------ | ----------------------------------------- | -------------- |
| High   | ≥5 completed issues (scope+type)          | Comment posted |
| Medium | ≥3 completed issues (scope) OR ≥10 global | Comment posted |
| Low    | Insufficient data (default 2 days)        | No comment     |

### Variance Formula

```
overallVariance = |actualFinish - provisionalFinish| / provisionalDuration
```

Focus on finish date (most important for dependencies).

### Thresholds

- **Target:** <10% median variance
- **Alert:** 25% median variance → creates issue
- **Critical:** 40% median variance → consider rollback

## Troubleshooting

### Provisional schedule not posted

**Check:**

1. Does issue have implementation order? (Check project field)
2. Are there enough historical samples for high/medium confidence?
3. Do custom fields exist in project?
4. Is issue still open?

**Solution:** Add more labels to improve confidence, or wait for more completed issues.

### Custom fields not updating

**Check:**

1. Do fields exist with exact names (case-sensitive)?
2. Does workflow log show permission errors?

**Solution:** Create fields manually, verify token permissions.

### Variance alerts created

**This is expected behavior!** System alerts when estimates are off.

**Actions:**

1. Review high-variance issues in alert
2. Check if external factors caused delays
3. Alert auto-closes when variance improves
4. Adjust DEFAULT_DURATION_DAYS if consistently off

## Scripts Reference

All scripts support dry-run by default. Add `--apply` to execute.

### Calculate provisional schedule

```bash
node scripts/post-provisional-schedule.mjs --issue 123        # dry-run
node scripts/post-provisional-schedule.mjs --issue 123 --apply
```

### Calculate variance

```bash
node scripts/calculate-variance.mjs                           # 30-day window
node scripts/calculate-variance.mjs --window-days=45          # custom window
```

### Create variance alert

```bash
node scripts/create-variance-alert.mjs 0.32 12 2025-W02      # 32%, 12 issues, week 2
```

## Documentation

**Primary docs:**

- [Stage 2 User Guide](../developer-workflow/stage2-user-guide.md) - Complete user documentation
- [Shared Modules README](../../scripts/shared/README.md) - Technical module docs
- [Roadmap Scheduling](../developer-workflow/roadmap-scheduling.md) - Scheduler integration

**Technical specs:**

- [Stage 2 Sub-Issues](../planning/stage2-subissues/) - Detailed specifications

## Rollback

If Stage 2 causes issues:

1. **Remove provisional schedule step** from `.github/workflows/auto-assign-impl-order.yml`
2. **Disable** `.github/workflows/calculate-variance.yml`
3. **Telemetry preserved** in Application Insights
4. **Core ordering unchanged** - system degrades gracefully

## Success Metrics

Monitor these after deployment:

- ✅ Median provisional variance <10%
- ✅ Scheduler re-run requests ↓ ≥70%
- ✅ Variance alerts <1 per month

## Need Help?

- **User issues:** See [Stage 2 User Guide - Troubleshooting](../developer-workflow/stage2-user-guide.md#troubleshooting)
- **Technical issues:** See [Shared Modules README](../../scripts/shared/README.md)
- **Architectural questions:** See [Stage 2 Sub-Issues](../planning/stage2-subissues/)

---

_Quick Start Guide for Stage 2 Predictive Scheduling_  
_Last updated: 2025-01-08_
