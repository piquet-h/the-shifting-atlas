# Alert Catalog: Partition Pressure & Performance

This document catalogs alerts configured for partition pressure detection and performance monitoring in The Shifting Atlas.

## Alert: Composite Partition Pressure (Critical)

**Issue**: #294  
**Severity**: Critical (0)  
**Evaluation Frequency**: Every 5 minutes  
**Window Size**: 5 minutes

### Purpose

Multi-signal alert combining RU%, throttling (429), and latency degradation to reduce false positives and signal urgent partition pressure requiring intervention. Provides higher-confidence escalation beyond single-metric alerts.

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
- **M2 Observability Milestone**: Performance monitoring and alerting expansion

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

**Last Updated**: 2025-11-08  
**Status**: Active  
**Milestone**: M2 Observability
