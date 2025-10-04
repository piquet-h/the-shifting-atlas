# Stage 2: Predictive Scheduling - User Guide

## Overview

Stage 2 of the roadmap automation system provides **provisional scheduling** at ordering time, giving early visibility into expected Start/Finish dates before the daily scheduler runs. This reduces scheduler churn and improves planning.

## How It Works

### 1. Provisional Schedule Calculation

When a new issue receives an implementation order (via auto-assignment or manual assignment), the system automatically:

1. **Estimates duration** using historical data from completed issues with similar scope and type labels
2. **Projects start/finish dates** based on the issue's position in the queue
3. **Stores provisional data** in GitHub Projects v2 custom fields
4. **Posts a comment** on the issue (for high/medium confidence estimates only)

### 2. Daily Scheduler Integration

The daily scheduler (runs at 00:00 UTC):

- Uses provisional estimates as starting points for scheduling
- Adjusts dates based on status transitions and upstream changes
- Emits variance telemetry comparing provisional vs actual schedules

### 3. Variance Monitoring

The variance calculator (runs at 00:30 UTC):

- Compares provisional schedules to actual schedules
- Calculates aggregate variance over a 30-day rolling window
- Creates alert issues when variance exceeds 25%

## Custom Fields

Stage 2 adds four new custom fields to Project #3:

| Field Name                 | Type          | Purpose                                    |
| -------------------------- | ------------- | ------------------------------------------ |
| **Provisional Start**      | Date          | Estimated start date from ordering time    |
| **Provisional Finish**     | Date          | Estimated finish date from ordering time   |
| **Provisional Confidence** | Single Select | Confidence level (High/Medium/Low)         |
| **Estimation Basis**       | Text          | Description of how estimate was calculated |

### Setting Up Custom Fields

**Note:** These fields must be created manually in the GitHub Project.

1. Navigate to [Project #3](https://github.com/users/piquet-h/projects/3)
2. Click the **⚙️ Settings** icon (top right)
3. Under "Custom fields", click **+ New field** for each:

    **Provisional Start:**
    - Name: `Provisional Start`
    - Type: `Date`
    - Click **Save**

    **Provisional Finish:**
    - Name: `Provisional Finish`
    - Type: `Date`
    - Click **Save**

    **Provisional Confidence:**
    - Name: `Provisional Confidence`
    - Type: `Single select`
    - Options: `High`, `Medium`, `Low`
    - Click **Save**

    **Estimation Basis:**
    - Name: `Estimation Basis`
    - Type: `Text`
    - Click **Save**

## Confidence Levels

Provisional schedules have three confidence levels based on available historical data:

### High Confidence ✅

- **Criteria:** ≥5 completed issues with same scope+type labels
- **Accuracy:** Most accurate, uses exact match
- **Comment posted:** Yes

### Medium Confidence 🟡

- **Criteria:** ≥3 completed issues with same scope OR ≥10 global samples
- **Accuracy:** Good, uses broader category
- **Comment posted:** Yes

### Low Confidence 🔴

- **Criteria:** Insufficient historical data
- **Accuracy:** Uses default estimate (2 days)
- **Comment posted:** No (to avoid noise)

## Provisional Comment Format

High and medium confidence estimates get a comment on the issue:

```markdown
<!-- PROVISIONAL_SCHEDULE:v1 -->

## 📅 Provisional Schedule (Automated)

**Estimated Start:** 2025-01-15  
**Estimated Finish:** 2025-01-18  
**Duration:** 4 days  
**Implementation Order:** #42

### Estimation Basis

- **Confidence:** High (High / Medium / Low)
- **Sample Size:** 7 similar issues
- **Basis:** Median of 7 scope:core+feature issues (4 days)

<details>
<summary>How this estimate was calculated</summary>

This provisional schedule is automatically calculated when implementation order is assigned...

</details>
```

### Comment Updates

- Comments are **idempotent** - the same comment is updated if order changes
- Updates are identified by the hidden marker `<!-- PROVISIONAL_SCHEDULE:v1 -->`
- Updates preserve comment history and minimize notification noise

## Variance Tracking

### Individual Issue Variance

For each issue, variance is calculated as:

```
overallVariance = |actualFinish - provisionalFinish| / provisionalDuration
```

This **finish-weighted** formula focuses on the metric that matters most for dependencies.

### Aggregate Variance

The system tracks median variance over a 30-day rolling window:

- **Target:** <10% median variance
- **Alert threshold:** 25% median variance
- **Critical:** 40% median variance

### Variance Alerts

When aggregate variance exceeds 25%:

1. A **variance alert issue** is automatically created
2. The alert includes:
    - Median variance percentage
    - Number of issues analyzed
    - Top variance contributors
    - Recommended actions
3. The alert **auto-closes** when variance drops below 25% for 7 consecutive days

## Workflows

### Auto-Assign Implementation Order

- **Trigger:** Issue opened, edited, labeled, milestoned
- **File:** `.github/workflows/auto-assign-impl-order.yml`
- **New behavior:** After assigning order, calculates and posts provisional schedule

### Roadmap Scheduler

- **Trigger:** Daily at 00:00 UTC
- **File:** `.github/workflows/roadmap-scheduler.yml`
- **New behavior:** Emits variance telemetry comparing provisional to actual

### Calculate Variance

- **Trigger:** Daily at 00:30 UTC (or manual dispatch)
- **File:** `.github/workflows/calculate-variance.yml`
- **Behavior:** Calculates aggregate variance and creates/updates alerts

## Scripts

### `post-provisional-schedule.mjs`

Calculate and post provisional schedule for an issue.

```bash
# Dry-run (show what would be done)
node scripts/post-provisional-schedule.mjs --issue 123

# Apply (actually post schedule)
node scripts/post-provisional-schedule.mjs --issue 123 --apply
```

### `calculate-variance.mjs`

Calculate schedule variance for all issues in rolling window.

```bash
# Default 30-day window
node scripts/calculate-variance.mjs

# Custom window size
node scripts/calculate-variance.mjs --window-days=45
```

### `create-variance-alert.mjs`

Create or update variance alert issue.

```bash
# Variance 32%, 12 issues, week 2025-W02
node scripts/create-variance-alert.mjs 0.32 12 2025-W02
```

## Telemetry

Stage 2 telemetry is separate from game telemetry to avoid mixing infrastructure and domain concerns.

### Build Telemetry Module

- **Location:** `scripts/shared/build-telemetry.mjs`
- **Event prefix:** `build.` (e.g., `build.schedule_variance`)
- **Custom dimension:** `telemetrySource: 'build-automation'`
- **Backend:** Application Insights

### Events Tracked

1. **`build.provisional_schedule_created`** - When provisional schedule is calculated
2. **`build.schedule_variance`** - When scheduler compares provisional to actual
3. **`build.variance_alert`** - When variance alert is created/updated/closed

### Environment Variables

- `APPLICATIONINSIGHTS_CONNECTION_STRING` - Application Insights connection string
- If not set, telemetry falls back to console logging

## Best Practices

### For Contributors

1. **Add scope and type labels** to issues - this improves estimation confidence
2. **Set milestones** early - this helps with ordering priority
3. **Don't manually edit provisional custom fields** - they're managed by automation
4. **Review provisional comments** when planning work

### For Maintainers

1. **Monitor variance alerts** - high variance indicates estimation issues
2. **Review variance trends** in Application Insights
3. **Adjust DEFAULT_DURATION_DAYS** if global estimates are consistently off
4. **Create custom fields** before enabling provisional scheduling

## Troubleshooting

### Provisional schedule not posted

**Possible causes:**

- Issue doesn't have implementation order
- Confidence is low (no comment posted for low confidence)
- Custom fields don't exist in project
- Issue is closed

**Solution:** Check implementation order and labels, verify custom fields exist

### Variance alert created

**Expected behavior:** System automatically alerts when estimates are off

**Actions:**

1. Review high-variance issues in the alert
2. Check if estimation model needs adjustment
3. Verify if external factors (scope changes, blockers) caused variance
4. Alert will auto-close when variance improves

### Custom fields not updating

**Possible causes:**

- Fields don't exist in project
- Token lacks project permissions

**Solution:**

1. Verify fields exist with exact names (case-sensitive)
2. Check workflow logs for permission errors
3. Ensure PROJECTS_TOKEN has project write access

## Rollback Procedure

If Stage 2 causes issues:

1. **Disable provisional comment posting:**
    - Remove the "Calculate & Post Provisional Schedule" step from `auto-assign-impl-order.yml`

2. **Stop variance calculations:**
    - Disable the `calculate-variance.yml` workflow

3. **Preserve telemetry data:**
    - Historical variance data remains in Application Insights

4. **Ordering automation continues:**
    - Core ordering functionality is unaffected

## Related Documentation

- [Roadmap Scheduling](./roadmap-scheduling.md) - Main scheduling documentation
- [Implementation Order Automation](./implementation-order-automation.md) - Ordering system
- [Stage 2 Sub-Issues](../../planning/stage2-subissues/) - Technical specifications

## Success Metrics

Stage 2 is successful when:

- ✅ Median provisional variance <10%
- ✅ Scheduler re-run requests ↓ ≥70%
- ✅ Variance alerts <1 per month

---

_Last updated: 2025-01-08 for Stage 2 implementation_
