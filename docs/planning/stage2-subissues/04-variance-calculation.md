# Sub-Issue 4: Implement Variance Calculation and Rolling Window

**Parent Issue:** #83 - Automation Stage 2: Predictive Scheduling Integration  
**Labels:** `scope:devx`, `enhancement`, `M0`  
**Milestone:** M0 Foundation

## Context

Variance measures how accurately provisional schedules predicted actual schedules. This metric drives continuous improvement of estimation accuracy and triggers diagnostic alerts when variance exceeds thresholds.

## Requirements

### 1. Variance Metric Definition

**Goal:** Quantify the difference between provisional and actual schedules.

#### Individual Issue Variance

For a single issue with provisional schedule P and actual schedule A:

**Date Delta (Days):**
```javascript
startDelta = dateDiff(A.start, P.start)     // Positive = actual later than provisional
finishDelta = dateDiff(A.finish, P.finish)  // Positive = actual later than provisional
durationDelta = A.duration - P.duration     // Positive = actual longer than provisional
```

**Percentage Variance:**
```javascript
startDeltaPct = (startDelta / P.duration) * 100
finishDeltaPct = (finishDelta / P.duration) * 100
durationVariancePct = (durationDelta / P.duration) * 100
```

**Overall Variance (Combined Metric):**

Option A (Average Absolute Deviation):
```javascript
overallVariance = (abs(startDelta) + abs(finishDelta)) / (2 * P.duration)
```

Option B (Finish-Weighted):
```javascript
overallVariance = abs(finishDelta) / P.duration
// Rationale: Finish date matters most for dependencies
```

**Recommendation:** Use Option B (Finish-Weighted) for Stage 2.

#### Aggregate Variance (Rolling Window)

For N issues in a time window:

**Median Variance:**
```javascript
medianVariance = median([variance1, variance2, ..., varianceN])
// More robust to outliers than mean
```

**Mean Absolute Deviation:**
```javascript
meanAbsVariance = mean([abs(variance1), abs(variance2), ..., abs(varianceN)])
```

**Variance Distribution:**
```javascript
{
    min: minVariance,
    p25: percentile25Variance,
    median: medianVariance,
    p75: percentile75Variance,
    max: maxVariance,
    mean: meanVariance,
    stdDev: standardDeviation
}
```

### 2. Rolling Window Mechanics

**Window Type:** Calendar-based (not scheduled-items count)

**Window Size:** 30 days (configurable)

**Window Definition:**
```javascript
const windowEnd = today
const windowStart = addDays(today, -30)

// Include issues where:
// - Provisional schedule was created during [windowStart, windowEnd]
// - Actual schedule exists (scheduled by daily scheduler)
// - Variance is calculable (both provisional and actual are complete)
```

**Edge Cases:**
- **Insufficient data:** Require minimum 5 issues in window for aggregate metrics
- **Bootstrap period:** First 30 days may have sparse data; report as "insufficient data"
- **Status changes:** Include issues that moved to "In progress" or "Done" during window

### 3. Variance Calculation Triggers

**When to calculate variance:**

1. **Daily (Primary):** After roadmap scheduler runs
   - For each issue in provisional-schedules.json
   - If actual dates exist in Project fields
   - If variance not yet calculated OR actual dates changed

2. **On-Demand:** Manual workflow dispatch
   - Recalculate all variances
   - Useful for testing or debugging

3. **Per-Issue:** When issue status changes to "Done"
   - Final variance calculation
   - Lock variance (don't recalculate)

**Calculation Workflow:**

```yaml
# .github/workflows/calculate-variance.yml
name: Calculate Schedule Variance
on:
  schedule:
    - cron: '30 00 * * *'  # 30 min after scheduler runs
  workflow_dispatch:

jobs:
  calculate:
    runs-on: ubuntu-latest
    steps:
      - name: Calculate Variance
        run: npm run calculate:variance
      
      - name: Check Thresholds
        id: check
        run: npm run check:variance-threshold
      
      - name: Create Alert Issue
        if: steps.check.outputs.alert_needed == 'true'
        run: npm run create:variance-alert
```

### 4. Variance Alert Thresholds

**Threshold Levels:**

| Level | Median Variance | Action |
|-------|----------------|--------|
| **Green** | < 10% | No action (target state) |
| **Yellow** | 10% - 25% | Log warning, track trend |
| **Red** | > 25% | Create diagnostic alert issue |

**Threshold Check:**
```javascript
function checkThreshold(rollingVariance) {
    const { median } = rollingVariance
    
    if (median > 0.25) {
        return {
            level: 'red',
            alert: true,
            message: `High variance detected: ${(median * 100).toFixed(1)}% > 25% threshold`
        }
    } else if (median > 0.10) {
        return {
            level: 'yellow',
            alert: false,
            message: `Moderate variance: ${(median * 100).toFixed(1)}% (target <10%)`
        }
    } else {
        return {
            level: 'green',
            alert: false,
            message: `Good variance: ${(median * 100).toFixed(1)}% < 10%`
        }
    }
}
```

### 5. Alert Issue Format

**Title:**
```
[VARIANCE ALERT] Provisional schedule accuracy below threshold (Week of YYYY-MM-DD)
```

**Body:**
```markdown
## Schedule Variance Alert

**Alert Level:** 🔴 RED  
**Median Variance:** 32.5% (threshold: 25%)  
**Time Window:** 2025-01-01 to 2025-01-30  
**Issues Analyzed:** 12

### Variance Distribution

- **Min:** 5%
- **25th Percentile:** 18%
- **Median:** 32.5%
- **75th Percentile:** 45%
- **Max:** 60%
- **Mean:** 31.2%

### Top Variance Contributors

| Issue | Title | Provisional | Actual | Variance |
|-------|-------|-------------|--------|----------|
| #123 | Implement feature X | 2025-01-10 to 2025-01-15 | 2025-01-12 to 2025-01-22 | 58% |
| #124 | Refactor module Y | 2025-01-16 to 2025-01-18 | 2025-01-18 to 2025-01-25 | 47% |
| #125 | Add tests for Z | 2025-01-19 to 2025-01-21 | 2025-01-20 to 2025-01-26 | 43% |

### Potential Causes

- Upstream delays cascading downstream
- Underestimated complexity for scope:X issues
- Historical samples not representative
- External dependencies (reviews, CI failures)

### Recommended Actions

- [ ] Review historical duration samples for accuracy
- [ ] Increase DEFAULT_DURATION_DAYS for affected scope/type
- [ ] Add explicit size labels to reduce estimation variance
- [ ] Investigate top variance contributors for patterns

### Automation Status

This alert was automatically generated by the variance monitoring workflow. 

**Next check:** 2025-01-31 00:30 UTC  
**Escalation:** If median variance >25% for 2 consecutive weeks, consider rollback per Stage 2 exit criteria.

---
*Related: #83 (Automation Stage 2)*
```

**Labels:**
- `scope:devx`
- `observability`
- `automated-alert`

**Alert Issue Management:**

1. **Single Alert Per Period:** One alert issue per week (Monday-Sunday)
2. **Update Existing:** If alert already open for current week, update it
3. **Auto-Close:** Close alert when variance drops below 25% for 7 consecutive days
4. **Escalation:** If variance >25% for 14 consecutive days, add `urgent` label and ping maintainers

### 6. Partial Rebaseline Trigger

**Context:** When an issue status changes to "In progress", daily scheduler rebaselines its dates.

**Partial Rebaseline:** Only recalculate downstream issues (higher order numbers).

**Logic:**
```javascript
async function handleStatusChange(issueNumber, newStatus) {
    if (newStatus !== 'In progress') return
    
    // Get issue order
    const issue = await getIssueWithOrder(issueNumber)
    const order = issue.order
    
    // Find downstream issues (order > current)
    const downstreamIssues = await getIssuesByOrderRange(order + 1, Infinity)
    
    // Recalculate provisional schedules for downstream
    for (const downstream of downstreamIssues) {
        await recalculateProvisionalSchedule(downstream)
    }
    
    console.log(`Recalculated ${downstreamIssues.length} downstream issues`)
}
```

**Integration:**
Add to `update-issue-status.mjs` workflow:

```javascript
// After updating status to "In progress"
if (newStatus === 'In progress') {
    console.log('Triggering partial rebaseline for downstream issues...')
    await triggerPartialRebaseline(issueNumber)
}
```

## Acceptance Criteria

- [ ] Variance formula defined (finish-weighted)
- [ ] Individual issue variance calculation implemented
- [ ] Aggregate rolling window variance implemented
- [ ] Window size configurable (default 30 days)
- [ ] Minimum sample size enforced (5 issues)
- [ ] Variance calculation triggered daily after scheduler
- [ ] Threshold levels defined (10%, 25%)
- [ ] Alert issue creation implemented
- [ ] Alert issue auto-update logic implemented
- [ ] Alert auto-close logic implemented
- [ ] Top variance contributors identified in alert
- [ ] Partial rebaseline implemented
- [ ] Downstream issue detection working
- [ ] Variance metrics exported for observability
- [ ] Unit tests for variance calculation
- [ ] Integration test for full variance workflow

## Technical Specifications

### Variance Calculation Module

**Location:** `scripts/shared/variance-calculator.mjs`

**Exports:**

```javascript
export {
    calculateIssueVariance,
    calculateRollingVariance,
    checkThreshold,
    identifyTopContributors,
    generateVarianceReport
}
```

**Function Signatures:**

```javascript
function calculateIssueVariance(provisional, actual) {
    return {
        startDelta,
        finishDelta,
        durationDelta,
        startDeltaPct,
        finishDeltaPct,
        durationVariancePct,
        overallVariance,  // finish-weighted
        calculatedAt: new Date().toISOString()
    }
}

function calculateRollingVariance(issues, windowDays = 30) {
    return {
        windowStart,
        windowEnd,
        sampleSize,
        distribution: {
            min, p25, median, p75, max, mean, stdDev
        },
        issues: [
            { issueNumber, variance, provisional, actual }
        ]
    }
}

function checkThreshold(rollingVariance) {
    return {
        level: 'green' | 'yellow' | 'red',
        alert: boolean,
        message: string,
        variance: number
    }
}

function identifyTopContributors(rollingVariance, limit = 5) {
    return issues
        .sort((a, b) => b.variance - a.variance)
        .slice(0, limit)
}

function generateVarianceReport(rollingVariance, threshold) {
    // Returns markdown string for alert issue body
}
```

### Variance Workflow

**Script:** `scripts/calculate-variance.mjs`

```javascript
#!/usr/bin/env node
// 1. Load provisional-schedules.json
// 2. For each issue with actual dates:
//    - Calculate individual variance
//    - Store in provisional-schedules.json
// 3. Calculate rolling window aggregate variance
// 4. Check threshold
// 5. Create/update alert issue if needed
// 6. Output summary to console
```

### Partial Rebaseline Script

**Script:** `scripts/partial-rebaseline.mjs`

```javascript
#!/usr/bin/env node
// Usage: node scripts/partial-rebaseline.mjs --issue 123
// 1. Get implementation order for issue
// 2. Find all issues with higher order
// 3. For each downstream issue:
//    - Recompute provisional schedule
//    - Update provisional-schedules.json
//    - Update comment (if exists)
// 4. Optionally trigger scheduler dry-run to preview impact
```

### Configuration

**File:** `roadmap/variance-config.json`

```json
{
    "windowDays": 30,
    "minSampleSize": 5,
    "thresholds": {
        "yellow": 0.10,
        "red": 0.25
    },
    "alertEscalationDays": 14,
    "autoCloseAfterDays": 7
}
```

## Testing Strategy

### Unit Tests

**Location:** `scripts/shared/variance-calculator.test.mjs`

Test cases:
1. **calculateIssueVariance:**
   - Positive delta (actual later)
   - Negative delta (actual earlier)
   - Zero delta (perfect match)
   - Duration increase
   - Duration decrease

2. **calculateRollingVariance:**
   - Sufficient samples (N ≥ 5)
   - Insufficient samples (N < 5)
   - Empty window
   - Mixed variance values
   - Outlier handling

3. **checkThreshold:**
   - Green level (< 10%)
   - Yellow level (10-25%)
   - Red level (> 25%)
   - Boundary values

4. **identifyTopContributors:**
   - Correct sorting
   - Limit enforcement
   - Fewer issues than limit

### Integration Tests

1. **End-to-end variance workflow:**
   - Create provisional schedule
   - Scheduler assigns actual dates
   - Variance calculated
   - Stored in JSON
   - Alert created if threshold exceeded

2. **Partial rebaseline:**
   - Status change to "In progress"
   - Downstream issues recalculated
   - Upstream issues unchanged

3. **Alert lifecycle:**
   - Create alert
   - Update with new data
   - Auto-close when variance improves

### Manual Testing

1. Simulate high variance scenario
2. Verify alert issue created
3. Improve estimates, verify alert closes
4. Test partial rebaseline with real project data

## Documentation Impact

### Files to Update

1. **docs/developer-workflow/implementation-order-automation.md**
   - Add "Variance Monitoring" section
   - Document thresholds and alert conditions
   - Explain partial rebaseline

2. **docs/developer-workflow/roadmap-scheduling.md**
   - Note variance calculation integration
   - Document npm scripts for variance

3. **README.md**
   - Add variance alert workflow to CI/automation section

## Rollback Procedure

If variance monitoring causes issues:
1. Disable variance calculation workflow
2. Keep provisional-schedules.json for manual analysis
3. Close open alert issues with explanation
4. Re-enable after fixing with adjusted thresholds

## Dependencies

- Sub-issue #1 (Duration Estimation Module)
- Sub-issue #3 (Provisional Storage Schema)
- Daily roadmap scheduler must run first

## Estimated Duration

4 days

## Notes

- Start conservative with thresholds; adjust based on 2 weeks of data
- Variance naturally higher in early issues (less historical data)
- Consider confidence-weighted variance in future (Stage 3)
- Partial rebaseline may cause comment spam; implement debouncing if needed
