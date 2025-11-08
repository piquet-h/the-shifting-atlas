# Observability Alert Threshold Tuning Report

**Issue:** #297  
**Milestone:** M2 Observability  
**Status:** Baseline Collection  
**Last Updated:** 2025-11-08

## Purpose

This document records the methodology and outcomes of threshold tuning for observability alerts after initial baseline data collection. The goal is to calibrate alert conditions to minimize false positives while maintaining sensitivity to genuine partition pressure and performance degradation.

## Baseline Collection Period

**Collection Requirements:**
- **Duration:** 7 consecutive days of telemetry
- **Start Date:** TBD (awaiting dashboard deployment)
- **End Date:** TBD
- **Data Sources:**
  - Application Insights custom events (`Graph.Query.Executed`, `Graph.Query.Failed`)
  - Dashboard visualizations (#289, #283)
  - Alert firing history (#292, #293, #294, #295)

**Quality Criteria:**
- Minimum 300 `Graph.Query.Executed` events per operation for statistical validity
- No deployment anomalies or major incidents during collection period
- Representative traffic patterns (includes both low and peak activity periods)

## Current Thresholds (Pre-Tuning)

### 1. Sustained High RU Utilization Alert (#292)

**Bicep Module:** `infrastructure/alert-ru-utilization.bicep`  
**Current Configuration:**
- **Fire Threshold:** RU% >70% for 3 consecutive 5-minute windows (15 minutes sustained)
- **Resolve Threshold:** RU% <65% for 2 consecutive windows (10 minutes)
- **Provisioned RU:** 400 RU/s (default)
- **Max RU per 5-min interval:** 120,000 RU (400 RU/s × 300 seconds)

**Rationale (ADR-002):**
- 70% provides headroom before saturation
- Early warning allows investigation before critical impact
- Consecutive window requirement filters transient spikes

**Tuning Questions:**
- [ ] What is the median RU% during normal operation?
- [ ] What is the 95th percentile RU% during peak intervals?
- [ ] How many false positive alerts fired during baseline period?
- [ ] What was the actual RU% during genuine performance issues?

### 2. Gremlin 429 Spike Detection Alert (#293)

**Bicep Module:** `infrastructure/alert-gremlin-429-spike.bicep`  
**Current Configuration:**
- **Normal Severity:** >=5 HTTP 429 responses in 5-minute window
- **High Severity:** >=10 HTTP 429 responses in 5-minute window
- **Additional Condition:** Total queries < baseline RPS × 300 (default: 50 RPS = 15,000 queries/5min)
- **Evaluation Frequency:** Every 5 minutes

**Rationale:**
- Detects throttling below expected traffic baseline (indicates partition hot-spotting)
- Differentiates from high-load throttling (expected at scale)
- Baseline RPS check prevents false positives during legitimate traffic spikes

**Tuning Questions:**
- [ ] What is the typical 429 count distribution per 5-minute window?
- [ ] What percentage of windows have 0 throttling responses?
- [ ] What is the actual baseline RPS observed (vs. 50 RPS default)?
- [ ] How many windows had 429s but were excluded by baseline RPS check?

### 3. Composite Partition Pressure Alert (#294)

**Bicep Module:** `infrastructure/alert-composite-partition-pressure.bicep`  
**Current Configuration:**
- **Condition 1:** RU% >70%
- **Condition 2:** 429 count >=3 in 5-minute window
- **Condition 3:** P95 latency increase >25% vs. 24-hour baseline
- **Trigger:** All three conditions met simultaneously
- **Minimum Baseline Samples:** 100 `Graph.Query.Executed` events in 24-hour window
- **Auto-Resolve:** Any one condition drops below threshold for 3 consecutive periods (15 minutes)

**Rationale:**
- Multi-signal approach reduces false positives
- Requires sustained degradation across RU, throttling, and latency
- Baseline comparison accounts for normal latency variance

**Tuning Questions:**
- [ ] How many times did all three conditions align during baseline period?
- [ ] What was the typical P95 latency baseline (by time of day)?
- [ ] Were there periods where 2 conditions met but alert didn't fire?
- [ ] Was the 25% latency increase threshold appropriate for detected issues?

### 4. Non-Movement Operation Latency Degradation Alert (#295)

**Bicep Module:** `infrastructure/alerts-operation-latency.bicep`  
**Current Configuration:**
- **Critical Severity:** P95 latency >600ms for 10-minute window
- **Warning Severity:** P95 latency >500ms for 10-minute window
- **Minimum Sample Size:** 20 calls per 10-minute window
- **Evaluation Frequency:** Every 10 minutes
- **Auto-Mitigation:** Enabled (Azure-managed timing)

**Monitored Operations:**
1. `location.upsert.check`
2. `location.upsert.write`
3. `exit.ensureExit.check`
4. `exit.ensureExit.create`
5. `player.create`

**Rationale:**
- Fixed thresholds appropriate for persistence operations
- Critical threshold (600ms) indicates significant degradation
- Warning threshold (500ms) provides early signal

**Tuning Questions:**
- [ ] What is the typical P95 latency for each operation during normal load?
- [ ] What is the P99 latency distribution (for context)?
- [ ] How many operations consistently exceed minimum sample size?
- [ ] Were there any operations with latency spikes that didn't trigger alerts?

## Baseline Metrics (To Be Collected)

### RU Consumption Analysis

**Query Template:**
```kusto
customEvents
| where timestamp between (datetime('YYYY-MM-DD') .. datetime('YYYY-MM-DD'))
| where name == 'Graph.Query.Executed'
| extend ruCharge = todouble(customDimensions.ruCharge)
| where isnotnull(ruCharge)
| summarize 
    MedianRU = percentile(ruCharge, 50),
    P95RU = percentile(ruCharge, 95),
    P99RU = percentile(ruCharge, 99),
    TotalEvents = count()
    by bin(timestamp, 5m)
| extend RUPercent = round(100.0 * TotalEvents / 120000.0, 2)
| summarize 
    MedianRUPercent = percentile(RUPercent, 50),
    P95RUPercent = percentile(RUPercent, 95),
    MaxRUPercent = max(RUPercent),
    WindowsAbove70Pct = countif(RUPercent > 70.0),
    TotalWindows = count()
```

**Expected Outputs:**
- Median RU% during normal operation
- 95th percentile RU% (peak intervals)
- Number of 5-minute windows exceeding 70% threshold
- False positive rate (alert fires with no genuine issue)

### 429 Throttling Distribution

**Query Template:**
```kusto
let evaluationWindow = 5m;
let baselineRps = 50;
customEvents
| where timestamp between (datetime('YYYY-MM-DD') .. datetime('YYYY-MM-DD'))
| where name == 'Graph.Query.Failed'
| where customDimensions.httpStatusCode == '429'
| summarize Count429 = count() by WindowStart = bin(timestamp, evaluationWindow)
| join kind=leftouter (
    customEvents
    | where timestamp between (datetime('YYYY-MM-DD') .. datetime('YYYY-MM-DD'))
    | where name == 'Graph.Query.Executed'
    | summarize TotalQueries = count() by WindowStart = bin(timestamp, evaluationWindow)
) on WindowStart
| extend ExpectedQueries = baselineRps * 300
| extend BelowBaseline = TotalQueries < ExpectedQueries
| summarize 
    MedianCount429 = percentile(Count429, 50),
    P95Count429 = percentile(Count429, 95),
    WindowsWith5Plus = countif(Count429 >= 5),
    WindowsWith10Plus = countif(Count429 >= 10),
    WindowsBelowBaseline = countif(BelowBaseline),
    TotalWindows = count()
```

**Expected Outputs:**
- Typical 429 count per 5-minute window
- Percentage of windows with 0 throttling
- Actual baseline RPS (vs. 50 RPS assumption)
- Alert fire frequency validation

### Latency Percentiles by Operation

**Query Template:**
```kusto
customEvents
| where timestamp between (datetime('YYYY-MM-DD') .. datetime('YYYY-MM-DD'))
| where name == 'Graph.Query.Executed'
| extend operationName = tostring(customDimensions.operationName)
| extend latencyMs = todouble(customDimensions.latencyMs)
| where operationName in (
    'location.upsert.check',
    'location.upsert.write',
    'exit.ensureExit.check',
    'exit.ensureExit.create',
    'player.create'
)
| where isnotnull(latencyMs)
| summarize 
    MedianLatency = percentile(latencyMs, 50),
    P95Latency = percentile(latencyMs, 95),
    P99Latency = percentile(latencyMs, 99),
    MaxLatency = max(latencyMs),
    SampleCount = count()
    by operationName, bin(timestamp, 10m)
| summarize 
    TypicalP95 = percentile(P95Latency, 50),
    PeakP95 = percentile(P95Latency, 95),
    WindowsAbove500ms = countif(P95Latency > 500),
    WindowsAbove600ms = countif(P95Latency > 600),
    TotalWindows = count(),
    MinSamples = min(SampleCount),
    MedianSamples = percentile(SampleCount, 50)
    by operationName
```

**Expected Outputs:**
- Typical P95 latency for each operation
- Peak P95 during high-load periods
- Operations with insufficient sample size (<20 calls/window)
- Alert sensitivity validation

## Threshold Tuning Methodology

### Step 1: Data Collection

1. **Verify Dashboard Deployment:**
   - Confirm Performance Operations Dashboard (#289) is deployed
   - Confirm Movement Latency Dashboard (#283) is deployed
   - Verify data ingestion in Application Insights

2. **Start Baseline Period:**
   - Record start date/time in this document
   - Monitor for deployment anomalies or incidents
   - Ensure representative traffic patterns (weekday + weekend)

3. **Export Baseline Data:**
   - Run queries above after 7-day period
   - Export results to `docs/observability/baseline-metrics-YYYY-MM-DD.json`
   - Document any outlier days excluded from analysis

### Step 2: Analysis

1. **Compare Actual vs. Expected:**
   - Calculate delta between observed metrics and current thresholds
   - Identify false positive alerts (fired with no genuine issue)
   - Identify missed alerts (genuine issue but no firing)

2. **Statistical Validation:**
   - Ensure sufficient sample size (>=300 events per operation)
   - Check for diurnal patterns (time-of-day variance)
   - Account for traffic growth trends

3. **Outlier Handling:**
   - Document deployment anomalies or incidents
   - Exclude outlier days with clear root cause (deployment, testing, etc.)
   - Minimum 5 clean days required for tuning

### Step 3: Proposed Thresholds

*(To be populated after baseline collection)*

**Format:**
```markdown
#### Alert: [Alert Name]

**Current Threshold:** [value]  
**Observed Baseline:** [median/P95]  
**Proposed Threshold:** [new value]  
**Rationale:** [why change is justified]  
**Expected Impact:** [reduction in false positives, improved detection, etc.]
```

### Step 4: Verification

1. **Simulation Test:**
   - Identify prior high-RU interval from baseline data
   - Calculate alert firing with proposed thresholds
   - Verify new thresholds would still detect genuine issues

2. **Post-Tuning Observation:**
   - Monitor alert firing for 24 hours after threshold update
   - Confirm no continuous alerts for benign baseline traffic
   - Document observation window start time

3. **Rollback Plan:**
   - Keep previous threshold values in code comments
   - Document rollback procedure if new thresholds underperform

## Proposed Threshold Updates

*(This section will be populated after baseline data analysis)*

### Summary Table

| Alert | Current Threshold | Proposed Threshold | Rationale | Issue Reference |
|-------|------------------|-------------------|-----------|----------------|
| RU Utilization | >70% | TBD | TBD | #292 |
| 429 Spike (Normal) | >=5 per 5min | TBD | TBD | #293 |
| 429 Spike (High) | >=10 per 5min | TBD | TBD | #293 |
| Composite Pressure (RU) | >70% | TBD | TBD | #294 |
| Composite Pressure (429) | >=3 per 5min | TBD | TBD | #294 |
| Composite Pressure (Latency) | +25% vs baseline | TBD | TBD | #294 |
| Operation Latency (Critical) | >600ms | TBD | TBD | #295 |
| Operation Latency (Warning) | >500ms | TBD | TBD | #295 |

### Detailed Recommendations

*(Detailed rationale for each threshold change will be added here after analysis)*

## Implementation Plan

### Phase 1: Documentation Update (This PR)

- [x] Create threshold tuning report template
- [x] Document current thresholds and rationale
- [x] Define baseline collection methodology
- [x] Specify analysis queries and expected outputs
- [ ] Link report from alerts catalog

### Phase 2: Baseline Collection (Separate Activity)

- [ ] Deploy all dashboards and alerts to production
- [ ] Start 7-day observation period (record start date)
- [ ] Monitor for deployment anomalies
- [ ] Export baseline metrics after 7 days

### Phase 3: Analysis & Recommendations (Future PR)

- [ ] Run baseline queries and export data
- [ ] Calculate proposed thresholds with rationale
- [ ] Update this document with recommendations
- [ ] Prepare verification test plan

### Phase 4: Threshold Updates (Future PR)

- [ ] Update Bicep parameters with new thresholds
- [ ] Deploy infrastructure changes
- [ ] Execute verification tests
- [ ] Monitor for 24 hours post-deployment
- [ ] Document final outcomes in this report

## Edge Cases and Handling

### Insufficient Data

**Scenario:** Operation has <300 events during baseline period  
**Handling:**
- Document operation as "insufficient data" in tuning table
- Defer threshold tuning for that operation
- Note in follow-up section for re-evaluation after additional data collection

**Example:**
```markdown
| player.create | >600ms | DEFERRED | Only 150 samples collected; need 300+ | #295 |
```

### Outlier Day Exclusion

**Scenario:** Deployment or incident causes anomalous metrics  
**Criteria for Exclusion:**
1. Clear root cause identified (deployment, load test, service incident)
2. Metrics >2 standard deviations from 6-day mean
3. Duration <24 hours
4. At least 5 clean days remain for analysis

**Documentation:**
```markdown
**Excluded Days:**
- 2025-11-10: Deployment of new feature caused 3x RU spike (16:00-18:00)
- Metrics: RU% peaked at 240%, 50+ 429 responses
- Reason: Non-representative traffic pattern
```

### Diurnal Pattern Variance

**Scenario:** Metrics vary significantly by time of day  
**Handling:**
- Calculate separate baselines for peak vs. off-peak hours
- Consider time-of-day aware thresholds (future enhancement)
- Document variance in rationale section

## Follow-Up Activities

### Immediate (Part of M2 Observability)

- [ ] Complete 7-day baseline collection (depends on dashboard deployment)
- [ ] Analyze baseline data and propose thresholds
- [ ] Update alert configurations with tuned thresholds
- [ ] Verify post-tuning alert behavior (24-hour observation)

### Future Enhancements (Post-M2)

- [ ] Automate weekly threshold drift analysis
  - Monitor for gradual baseline shifts over time
  - Alert when observed metrics deviate from tuned thresholds by >15%
  - Recommend periodic re-tuning (quarterly or after major traffic changes)

- [ ] Time-of-day aware thresholds
  - Separate thresholds for peak vs. off-peak hours
  - Reduce false positives during known high-traffic periods
  - Maintain sensitivity during low-traffic periods

- [ ] Machine learning anomaly detection
  - Replace fixed thresholds with adaptive models
  - Learn normal behavior patterns automatically
  - Detect unusual patterns without manual threshold tuning

## References

- **ADR-002:** [Graph Partition Strategy](../adr/ADR-002-graph-partition-strategy.md) — Defines RU and throttling thresholds
- **Alerts Catalog:** [alerts-catalog.md](./alerts-catalog.md) — Comprehensive alert documentation
- **Composite Pressure Alert:** [alert-composite-partition-pressure.md](./alert-composite-partition-pressure.md) — Multi-signal alert details
- **Operation Latency Alert:** [operation-latency-monitoring.md](./operation-latency-monitoring.md) — Latency monitoring implementation
- **Issue #297:** Post-Baseline Threshold Tuning
- **Issue #292:** Sustained High RU Utilization Alert
- **Issue #293:** Gremlin 429 Spike Detection Alert
- **Issue #294:** Composite Partition Pressure Alert
- **Issue #295:** Non-Movement Operation Latency Degradation Alert
- **Issue #289:** Dashboard: Performance Operations (Consolidated Workbook)
- **Issue #283:** Dashboard: Movement Latency Distribution (P95/P99)

## Version History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2025-11-08 | 1.0 | Copilot Agent | Initial template creation with current thresholds and methodology |

---

**Status:** Awaiting Baseline Collection  
**Next Milestone:** Phase 2 — Start 7-day observation period after dashboard deployment
