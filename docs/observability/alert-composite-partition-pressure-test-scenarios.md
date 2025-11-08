# Composite Partition Pressure Alert - Test Scenarios

Manual validation scenarios for issue #294.

## Prerequisites

- Azure infrastructure deployed with alert-composite-partition-pressure module
- Application Insights configured and receiving telemetry
- Access to Azure Portal to view alerts and query data

## Scenario 1: Alert Fires with All Conditions Met

### Setup
1. Deploy infrastructure with alert module enabled
2. Wait for 24 hours to accumulate baseline data (>=100 samples)

### Test Steps
1. Generate sustained high RU load:
   ```bash
   # Run intensive Gremlin queries to consume >70% RU in 5-minute window
   # Example: Complex graph traversals or bulk operations
   ```

2. Simulate 429 throttling responses:
   - Continue load until hitting RU limits
   - Verify at least 3x 429 responses in 5-minute window via query:
   ```kusto
   customEvents
   | where timestamp > ago(5m)
   | where name == "Graph.Query.Executed"
   | extend statusCode = toint(customDimensions.statusCode)
   | where statusCode == 429
   | summarize count()
   ```

3. Induce latency degradation:
   - Run complex queries that increase P95 latency by >25%
   - Verify with query:
   ```kusto
   let current = customEvents
   | where timestamp > ago(5m)
   | where name == "Graph.Query.Executed"
   | extend latencyMs = todouble(customDimensions.durationMs)
   | summarize p95 = percentile(latencyMs, 95);
   let baseline = customEvents
   | where timestamp between (ago(24h) .. ago(1h))
   | where name == "Graph.Query.Executed"
   | extend latencyMs = todouble(customDimensions.durationMs)
   | summarize p95 = percentile(latencyMs, 95);
   current | extend dummy=1
   | join (baseline | extend dummy=1) on dummy
   | project current_p95=p95, baseline_p95=p951, increase_pct=((p95-p951)/p951)*100
   ```

### Expected Results
- Alert fires within 5 minutes of conditions being met
- Alert payload includes:
  - `ruPercent` > 70
  - `count429` >= 3
  - `latencyIncreasePct` > 25
  - Top 2 operations by RU consumption
- Severity: Critical (0)

### Validation Queries

Check alert fired:
```kusto
AzureDiagnostics
| where Category == "Alerts"
| where AlertName_s == "Composite Partition Pressure (RU + 429 + Latency)"
| where TimeGenerated > ago(1h)
| project TimeGenerated, AlertState_s, AlertSeverity_s
```

Review alert details:
```kusto
alerts
| where alertName == "alert-composite-partition-pressure-atlas"
| where timestamp > ago(1h)
| project timestamp, severity, properties
```

## Scenario 2: Alert Does NOT Fire - Missing One Condition

### Test Steps

#### Test 2a: High RU + 429, but No Latency Degradation
1. Generate high RU load (>70%)
2. Induce 429 responses (>=3)
3. Keep queries simple to maintain normal latency (<25% increase)

**Expected**: No alert fires

#### Test 2b: High RU + Latency Degradation, but No 429
1. Generate high RU load (>70%)
2. Run slow queries (>25% latency increase)
3. Stay below throttling threshold (no 429s)

**Expected**: No alert fires

#### Test 2c: 429 + Latency Degradation, but Low RU
1. Artificially trigger 429 responses without high RU
2. Run slow queries
3. Keep total RU below 70%

**Expected**: No alert fires

### Validation
```kusto
// Verify conditions
let metrics = customEvents
| where timestamp > ago(5m)
| where name == "Graph.Query.Executed"
| extend ruCharge = todouble(customDimensions.ruCharge)
| extend statusCode = toint(customDimensions.statusCode)
| extend latencyMs = todouble(customDimensions.durationMs)
| summarize 
    totalRu = sum(ruCharge),
    count429 = countif(statusCode == 429),
    currentP95 = percentile(latencyMs, 95);
metrics
| extend ruPercent = (totalRu / 2000) * 100
| project ruPercent, count429, currentP95
```

Check no alert fired:
```kusto
AzureDiagnostics
| where Category == "Alerts"
| where AlertName_s == "Composite Partition Pressure (RU + 429 + Latency)"
| where TimeGenerated > ago(1h)
| summarize count()
// Should return 0
```

## Scenario 3: Alert Suppressed - Insufficient Baseline

### Setup
1. Deploy to new environment with no historical data
2. Immediately run test scenario

### Test Steps
1. Generate high RU load (>70%)
2. Induce 429 responses (>=3)
3. Run slow queries (>25% latency increase)

### Expected Results
- Composite alert does NOT fire
- Diagnostic alert DOES fire with payload:
  - `message`: "Composite partition pressure alert suppressed"
  - `reason`: "Insufficient baseline samples"
  - `baselineSampleCount` < 100

### Validation Queries

Check composite alert NOT fired:
```kusto
AzureDiagnostics
| where Category == "Alerts"
| where AlertName_s == "Composite Partition Pressure (RU + 429 + Latency)"
| where TimeGenerated > ago(10m)
| summarize count()
// Should return 0
```

Check diagnostic alert fired:
```kusto
AzureDiagnostics
| where Category == "Alerts"
| where AlertName_s contains "Baseline Suppression"
| where TimeGenerated > ago(10m)
| project TimeGenerated, AlertState_s, properties_d
```

Verify baseline sample count:
```kusto
customEvents
| where timestamp between (ago(24h) .. ago(1h))
| where name == "Graph.Query.Executed"
| summarize count()
// Should return < 100
```

## Scenario 4: Auto-Resolution After Recovery

### Setup
1. Trigger alert by meeting all conditions (Scenario 1)
2. Wait for alert to fire

### Test Steps
1. Reduce RU consumption below 70%
2. Continue monitoring for 3 consecutive 5-minute periods (15 minutes total)

### Expected Results
- Alert auto-resolves after 3 consecutive periods with RU < 70%
- Alert state changes from "Fired" to "Resolved"

### Alternative Recovery Paths
Test that alert resolves when ANY ONE metric recovers:

#### Path A: Reduce 429 Count
- Keep RU and latency high
- Reduce load to avoid throttling (<3 429s per 5 min)
- Verify alert resolves after 15 minutes

#### Path B: Improve Latency
- Keep RU and 429 count high
- Optimize queries to reduce latency below 25% increase
- Verify alert resolves after 15 minutes

### Validation Queries

Monitor alert state over time:
```kusto
AzureDiagnostics
| where Category == "Alerts"
| where AlertName_s == "Composite Partition Pressure (RU + 429 + Latency)"
| where TimeGenerated > ago(30m)
| project TimeGenerated, AlertState_s
| order by TimeGenerated desc
```

Verify metrics dropped:
```kusto
customEvents
| where timestamp > ago(20m)
| where name == "Graph.Query.Executed"
| extend ruCharge = todouble(customDimensions.ruCharge)
| extend statusCode = toint(customDimensions.statusCode)
| summarize 
    totalRu = sum(ruCharge),
    count429 = countif(statusCode == 429)
    by bin(timestamp, 5m)
| extend ruPercent = (totalRu / 2000) * 100
| order by timestamp desc
```

## Scenario 5: Baseline Accumulation Over Time

### Test Steps
1. Deploy to new environment
2. Generate normal operational load
3. Monitor baseline sample accumulation daily

### Expected Results
Day 1-23: Diagnostic alert fires when conditions met (baseline insufficient)
Day 24+: Composite alert operational (baseline >= 100 samples)

### Validation Query

Track baseline growth:
```kusto
let window_start = ago(24h);
let window_end = ago(1h);
customEvents
| where timestamp between (window_start .. window_end)
| where name == "Graph.Query.Executed"
| summarize 
    sample_count = count(),
    earliest = min(timestamp),
    latest = max(timestamp)
| extend 
    hours_covered = datetime_diff('hour', latest, earliest),
    sufficient = sample_count >= 100
```

## Performance Validation

### Query Execution Time
Measure alert query performance:
```kusto
// Run the composite alert query directly
// (Copy query from alert-composite-partition-pressure.bicep)
// Measure execution time in Azure Portal query editor
```

**Expected**: Query completes in <10 seconds for typical data volume

### Alert Evaluation Lag
Check time between condition met and alert fired:
```kusto
// Compare timestamp of first condition breach vs alert fire time
let condition_time = customEvents
| where timestamp > ago(1h)
| where name == "Graph.Query.Executed"
| extend ruCharge = todouble(customDimensions.ruCharge)
| summarize totalRu = sum(ruCharge) by bin(timestamp, 5m)
| extend ruPercent = (totalRu / 2000) * 100
| where ruPercent > 70
| summarize min(timestamp);
let alert_time = AzureDiagnostics
| where Category == "Alerts"
| where AlertName_s == "Composite Partition Pressure (RU + 429 + Latency)"
| where AlertState_s == "Fired"
| where TimeGenerated > ago(1h)
| summarize min(TimeGenerated);
// Calculate difference
```

**Expected**: Alert fires within 5-10 minutes of conditions first met

## Troubleshooting Failed Tests

### Alert Not Firing
1. Verify all three conditions actually met with validation queries
2. Check baseline sample count >= 100
3. Confirm telemetry events include required dimensions:
   - `customDimensions.ruCharge` (numeric)
   - `customDimensions.durationMs` (numeric)
   - `customDimensions.statusCode` (numeric)
   - `customDimensions.operationName` (string)

### Alert Firing Incorrectly
1. Review alert payload to identify which threshold breached
2. Check for recent threshold changes
3. Verify baseline calculation is accurate
4. Check for sampling configuration changes

### Diagnostic Alert Not Firing
1. Verify conditions for composite alert are met
2. Confirm baseline sample count < 100
3. Check diagnostic alert is enabled in Bicep deployment

## Test Completion Checklist

- [ ] Scenario 1: Alert fires with all conditions met
- [ ] Scenario 2a: No alert - high RU+429, normal latency
- [ ] Scenario 2b: No alert - high RU+latency, no 429
- [ ] Scenario 2c: No alert - 429+latency, low RU
- [ ] Scenario 3: Suppression alert fires with insufficient baseline
- [ ] Scenario 4: Auto-resolution after metric recovery
- [ ] Scenario 5: Baseline accumulation tracked
- [ ] Performance: Query executes in <10 seconds
- [ ] Performance: Alert lag <10 minutes
- [ ] Documentation reviewed and accurate
- [ ] Threshold values documented in ADR-002

## Notes

- Tests should be performed in non-production environment
- Coordinate with team before inducing high load or throttling
- Document any unexpected behavior in issue #294
- Update thresholds in issue #297 if baseline metrics differ significantly

---

**Test Date**: _____________________  
**Tester**: _____________________  
**Environment**: _____________________  
**Result**: PASS / FAIL  
**Notes**: _____________________
