# Alert Catalog: Partition Pressure & Performance

This document catalogs alerts configured for partition pressure detection and performance monitoring in The Shifting Atlas.

**Last Updated**: 2025-11-09  
**Alert Count**: 3 active alerts (down from 13)  
**Architecture**: Action Group + Alert Processing Rule for composite escalation

---

## Alert: Composite Partition Pressure (Critical) - ACTION GROUP

**Issue**: #294  
**Implementation**: Action Group + Alert Processing Rule (replaces complex KQL query)  
**Status**: ✅ Active (deployed 2025-11-09)

### Purpose

Correlates multiple partition pressure signals (RU%, 429s, latency) to fire critical escalation only when 2+ signals detected simultaneously within 10 minutes. Reduces false positives while maintaining high-confidence detection.

### Architecture

**Components**:
1. **Action Group**: `ag-partition-pressure-atlas`
   - Email/webhook receivers (configurable)
   - Rate limiting enabled

2. **Alert Processing Rule**: `apr-composite-partition-pressure-atlas`
   - Monitors: RU Utilization + 429 Spike + Operation Latency alerts
   - Fires when: ≥2 alerts active within 10-minute window
   - Conditions:
     - AlertRuleName contains: `alert-ru-utilization`, `gremlin-429-spike`, `latency-`
     - Severity: Sev2 or Sev3

### Benefits Over Previous Complex Query Approach

- ✅ No format() validation issues
- ✅ Simpler maintenance (native Azure features)
- ✅ Better operational visibility (see which specific metrics triggered)
- ✅ $0 additional query cost (reuses existing alerts)
- ✅ Easy to adjust correlation logic without KQL changes

### Configuration

**Bicep File**: `infrastructure/action-group-partition-pressure.bicep`  
**Module**: `actionGroupPartitionPressure` in `main.bicep`

**Configurable Parameters**:
- `emailReceivers`: Array of email addresses for notifications
- `webhookReceivers`: Array of webhook URLs (Slack, PagerDuty, etc.)
- `enabled`: Toggle action group on/off

**Tags**:
- `M2-Observability`: true
- `Issue`: 294
- `AlertType`: CompositePartitionPressure

### Related Alerts (Inputs to Composite)

- **Issue #292**: Sustained High RU Utilization alert
- **Issue #293**: Gremlin 429 Spike Detection alert  
- **Issue #295**: Operation Latency alerts (consolidated)

---

## Alert: Sustained High RU Utilization (Warning)

### Conditions

The alert fires **only when all three conditions are met simultaneously**:

1. **RU% > 70%**: Total RU consumption exceeds 70% of configured maximum per interval
2. **429 Count >= 3**: At least 3 throttling responses (HTTP 429) in the last 5 minutes
3. **P95 Latency Increase > 25%**: Current P95 latency increased by more than 25% compared to 24-hour baseline

### Baseline Requirements

- **Baseline Window**: Rolling 24 hours (excluding current hour to avoid skew)
- **Minimum Samples**: >= 100 `Graph.Query.Executed` events in baseline window
- **Suppression**: Alert is suppressed if baseline sample count < 100 (diagnostic event logged instead)

### Alert Payload

The alert includes the following information:

- `ruPercent`: Current RU utilization percentage (rounded to 2 decimal places)
- `count429`: Number of 429 throttling responses in evaluation window
- `currentP95Latency`: Current P95 latency in milliseconds
- `baselineP95Latency`: Baseline P95 latency (24h average)
- `latencyIncreasePct`: Percentage increase from baseline
- `sampleCount`: Number of samples in current window
- `baselineSampleCount`: Number of samples in baseline window
- `top2Operations`: Top 2 operations by RU consumption with operation name and RU charge

### Auto-Resolution

The alert auto-resolves when **any one** of the following conditions is met for 3 consecutive evaluation periods (15 minutes):

- RU% drops below 70%
- 429 count falls below 3
- P95 latency increase falls below 25%

### Configuration

**Bicep File**: `infrastructure/alert-composite-partition-pressure.bicep`  
**Module**: `alertCompositePartitionPressure` in `main.bicep`

**Configurable Parameters**:

| Parameter | Default | Purpose | Tuning Notes |
|-----------|---------|---------|--------------|
| `maxRuPerInterval` | 120000 | Maximum RU per 5-minute interval (400 RU/s × 300s) | Must match provisioned throughput × 300 |
| `ruPercentThreshold` | 70 | RU% threshold for composite condition | Align with RU utilization alert |
| `throttlingCountThreshold` | 3 | Minimum 429 count for composite condition | Lower = more sensitive |
| `latencyIncreasePercentThreshold` | 25 | Minimum P95 latency increase % vs baseline | Lower = more sensitive |
| `minBaselineSamples` | 100 | Minimum baseline samples required | Higher = more reliable comparison |
| `actionGroupId` | (empty) | Optional action group for notifications | Email, SMS, webhook, etc. |

**Tags**:
- `M2-Observability`: true
- `Issue`: 294
- `AlertType`: CompositePartitionPressure
- `Severity`: Critical

**Parameter Suppression Logic**:
- Alert is **suppressed** if baseline sample count < `minBaselineSamples`
- Diagnostic alert fires instead to track suppression reason
- After 24 hours of telemetry, alert becomes active

### Dependencies

This alert builds upon and correlates with:

- **Issue #292**: Sustained High RU Utilization alert (single-metric RU monitoring)
- **Issue #293**: Gremlin 429 Spike Detection alert (single-metric throttling monitoring)
- **Issue #79**: Graph query telemetry with RU and latency tracking

### Telemetry Requirements

The alert queries `Graph.Query.Executed` custom events with the following dimensions:

- `customDimensions.ruCharge`: RU charge for the operation (numeric)
- `customDimensions.latencyMs` or `customDimensions.durationMs`: Operation duration in milliseconds (numeric, uses coalesce for compatibility)
- `customDimensions.operationName`: Operation identifier (string)
- `customDimensions.statusCode` or `customDimensions.httpStatusCode`: HTTP status code (numeric, uses coalesce for compatibility, 429 for throttling)

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| High RU without latency degradation | No alert (requires all three conditions) |
| Latency degradation with low RU | No alert (requires all three conditions) |
| No 429 errors despite high RU | No alert (requires all three conditions) |
| Baseline insufficient (<100 samples) | Alert suppressed, diagnostic event logged |
| Single spike (< 3 periods) | No alert (requires 1 of 3 periods to fire) |

### Diagnostic Alert: Baseline Suppression

A companion diagnostic alert (severity: Informational) fires when the composite alert would trigger based on RU% and 429 count, but is suppressed due to insufficient baseline samples.

**Purpose**: Track baseline data collection progress and identify periods where the composite alert cannot evaluate latency trends.

**Payload**:
- `message`: "Composite partition pressure alert suppressed"
- `reason`: "Insufficient baseline samples"
- `baselineSampleCount`: Actual baseline sample count
- `requiredSamples`: Minimum required (100)
- `currentRuPercent`: Current RU percentage
- `current429Count`: Current 429 count

### References

- **ADR-002**: Graph Partition Strategy - defines RU thresholds and partition pressure triggers
- **Copilot Instructions Section 9**: Code generation heuristics for alerts
- **M5 Quality & Depth Milestone**: Comprehensive observability and alert optimization

### Threshold Tuning

Thresholds were selected based on ADR-002 guidance:

- **70% RU**: Early warning before saturation, allows time for investigation
- **3x 429 in 5 min**: Signal of sustained throttling, not transient network issues
- **25% latency increase**: Significant degradation indicating partition stress

These thresholds may be adjusted based on observed baseline metrics. See [Threshold Tuning Report](./threshold-tuning.md) for baseline collection methodology and proposed adjustments (Issue #297: Post-Baseline Threshold Tuning).

### Troubleshooting

**Alert not firing despite high RU**:
1. Check if all three conditions are met (query each metric independently)
2. Verify baseline sample count >= 100 (check diagnostic alert)
3. Confirm telemetry events include required dimensions (ruCharge, durationMs, statusCode)

**Alert firing frequently**:
1. Review partition key distribution (see ADR-002 migration triggers)
2. Analyze top operations by RU (included in alert payload)
3. Consider threshold tuning if baseline metrics shift significantly
4. Investigate application-level optimization opportunities

**Baseline always insufficient**:
1. Verify Graph.Query.Executed events are being emitted correctly
2. Check sampling configuration (ensure events not over-sampled)
3. Wait 24 hours after initial deployment for baseline accumulation
4. Monitor diagnostic alert for baseline growth trends

### Remediation Actions

When this alert fires, investigate immediately:

1. **Review Alert Payload**: Check top 2 operations consuming RU
2. **Analyze Query Patterns**: Look for inefficient traversals or missing indexes
3. **Check Partition Distribution**: Verify no single partition is hot (ADR-002 thresholds)
4. **Review Recent Changes**: Correlate with deployments or feature rollouts
5. **Consider Scaling**: Evaluate partition migration or RU increase per ADR-002

### Related Alerts

- **Sustained High RU (#292)**: Single-metric RU monitoring (fires earlier, lower threshold)
- **Gremlin 429 Spike (#293)**: Single-metric throttling detection (fires on rate-limit violations)
- **Non-Movement Operation Latency Degradation (#295)**: Latency monitoring for write operations

### Deployment

The alert is automatically deployed via Bicep when infrastructure is updated:

```bash
# Deploy infrastructure including alert
az deployment group create \
  --resource-group rg-atlas-game \
  --template-file infrastructure/main.bicep \
  --parameters name=atlas location=eastus
```

### Testing

**Manual Validation Scenario** (Issue #294 acceptance criteria):

1. Generate sustained high RU load (>70% for 5 minutes)
2. Simulate 429 responses (throttle deliberately or exceed RU limits)
3. Induce latency degradation (complex queries or resource contention)
4. Verify alert fires within 5-minute evaluation window
5. Reduce any one metric below threshold
6. Verify alert auto-resolves after 3 consecutive clean periods (15 minutes)

**Baseline Suppression Test**:

1. Deploy to new environment with no historical data
2. Generate high RU and 429 responses
3. Verify composite alert does NOT fire (baseline insufficient)
4. Verify diagnostic alert DOES fire with suppression message
5. Wait 24 hours for baseline accumulation
6. Repeat load test and verify composite alert now fires

---

## Alert: Consolidated Operation Latency (Critical & Warning)

**Issue**: #295  
**Implementation**: Consolidated multi-operation alerts (2 alerts replace 10)  
**Status**: ✅ Active (deployed 2025-11-09)

### Purpose

Monitors P95 latency across all non-movement Gremlin operations with consolidated alerting. Single query checks multiple operations and reports all that exceed thresholds, providing better operational visibility and 83% cost reduction.

### Architecture

**Two Severity Levels**:
1. **Critical Alert**: `alert-latency-consolidated-critical`
   - Severity: 1 (Critical)
   - Threshold: P95 > 600ms
   - Replaces: 5 individual critical alerts

2. **Warning Alert**: `alert-latency-consolidated-warning`
   - Severity: 2 (Warning)
   - Threshold: P95 > 500ms
   - Replaces: 5 individual warning alerts

### Monitored Operations

- `location.upsert.check`
- `location.upsert.write`
- `exit.ensureExit.check`
- `exit.ensureExit.create`
- `player.create`

### Query Strategy

```kql
let monitoredOperations = dynamic([...]);
customEvents
| where name == 'Graph.Query.Executed'
| where operationName in (monitoredOperations)
| summarize P95 = percentile(latencyMs, 95), SampleSize = count() by operationName
| where SampleSize >= 20
| where P95 > threshold
| order by P95 desc  // Worst operations first
```

### Alert Payload

Shows **all** operations exceeding threshold in single alert:
- `operationName`: Operation that exceeded threshold
- `P95`: 95th percentile latency (ms)
- `SampleSize`: Number of samples in evaluation window
- `AvgLatency`: Average latency (ms)
- `MaxLatency`: Maximum observed latency (ms)
- `Threshold`: Applied threshold (600ms critical, 500ms warning)

### Benefits Over Individual Alerts

- ✅ **Cost**: 83% query reduction (60 → 10 queries/hour)
- ✅ **UX**: See all affected operations in one alert
- ✅ **Prioritization**: Operations ordered by severity (worst first)
- ✅ **Maintenance**: Single query to update per severity level
- ✅ **Coverage**: Identical monitoring (no gaps)

### Configuration

**Bicep File**: `infrastructure/alerts-operation-latency-consolidated.bicep`  
**Module**: `operationLatencyAlerts` in `main.bicep`

**Configurable Parameters**:
- `criticalThresholdMs`: Critical threshold (default: 600)
- `warningThresholdMs`: Warning threshold (default: 500)
- `minSampleSize`: Minimum samples required (default: 20)
- `operations`: Array of operation names to monitor
- `actionGroupId`: Optional action group for notifications

**Evaluation**:
- Frequency: Every 10 minutes
- Window: 10 minutes
- Auto-mitigation: Enabled

### Testing

**Induce Latency Test**:
1. Run complex traversal queries (large depth, no limits)
2. Verify operations appear in alert payload when P95 > threshold
3. Check operations ordered by P95 (worst first)
4. Reduce query complexity
5. Verify alert auto-resolves

**Multi-Operation Test**:
1. Induce latency in 2+ operations simultaneously
2. Verify single alert shows all affected operations
3. Confirm SampleSize ≥ 20 for each operation

---

**Last Updated**: 2025-11-09  
**Status**: Active  
**Milestone**: M5 Quality & Depth
