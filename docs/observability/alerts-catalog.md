# Observability Alerts Catalog

> **Infrastructure**: `infrastructure/alert-*.bicep` modules  
> **Monitoring**: Azure Monitor Scheduled Query Rules  
> **Source Data**: Application Insights custom events

## Purpose

Central registry documenting all configured Azure Monitor alerts, including trigger conditions, severity levels, auto-resolution behavior, and operational response guidance.

## Alert Categories

### Graph Operations / Throttling

#### Gremlin 429 Throttling Spike Detection

**Alert ID:** `gremlin-429-spike-{name}`  
**Bicep Module:** `infrastructure/alert-gremlin-429-spike.bicep`  
**Status:** Active (M2 Observability)

**Purpose:**  
Detect abnormal Cosmos DB Gremlin throttling (HTTP 429 responses) below expected RPS baseline, correlating with ADR-002 partition saturation thresholds. Fires when throttling occurs despite low query volume, indicating potential partition hot-spotting or misconfigured RU provisioning.

**Trigger Conditions:**

-   **Normal Severity (Warning)**: `>=5` HTTP 429 responses in 5-minute window AND total `Graph.Query.Executed` calls `< BASELINE_RPS * 300` (5 min in seconds)
-   **High Severity (Error)**: `>=10` HTTP 429 responses in 5-minute window AND same RPS condition

**Evaluation:**

-   **Frequency**: Every 5 minutes
-   **Window Size**: 5 minutes (rolling)
-   **Auto-Resolve**: When alert condition no longer met (Count429 < 5 or query volume at/above baseline)
    -   Note: Azure Monitor scheduled query rules use the same threshold for firing and resolution. The issue requirement specifies "<2 429s per window" for resolution, but this is not directly supported. Alert resolves when the firing condition is no longer true.

**Alert Payload Context:**

-   `Count429`: Number of 429 responses in window
-   `TotalQueries`: Total Graph.Query.Executed calls in window
-   `ExpectedQueries`: Baseline RPS × window duration (baseline threshold)
-   `BelowBaseline`: Boolean indicating if query volume is below expected
-   `AlertSeverity`: "Normal" or "High"
-   `AvgRU`: Average RU charge per query in window
-   `P95Latency`: 95th percentile query latency (ms)
-   `TotalRU`: Total RU consumption in window

**Configuration:**

-   **Main Parameters** (in `infrastructure/main.bicep`):
    -   `gremlinBaselineRps`: Expected baseline RPS for Gremlin queries (default: 50)
    -   Set to 0 to disable alert entirely (diagnostic/development mode)

-   **Module Parameters** (in `infrastructure/alert-gremlin-429-spike.bicep`):
    -   `normalThreshold429Count`: Minimum 429 count to trigger normal severity alert (default: 5)
    -   `highThreshold429Count`: Minimum 429 count to trigger high severity alert (default: 10)
    -   `evaluationFrequencyMinutes`: How often to evaluate the alert condition (default: 5)
    -   `severity`: Alert severity level - 0=Critical, 1=Error, 2=Warning, 3=Informational (default: 2)

**Parameter Tuning Table:**

| Parameter | Default | Purpose | Tuning Guidance |
|-----------|---------|---------|----------------|
| `baselineRps` | 50 | Expected query rate (RPS) | Set based on normal traffic patterns; higher = less sensitive |
| `normalThreshold429Count` | 5 | 429s to trigger warning | Increase if transient throttling is acceptable |
| `highThreshold429Count` | 10 | 429s to trigger high severity | Should be ~2x normal threshold |
| `evaluationFrequencyMinutes` | 5 | Evaluation window size | Match to typical incident response time |

See [Threshold Tuning Report](./threshold-tuning.md) for baseline metrics and tuning methodology.

**Edge Cases Handled:**

-   **Transient Network Glitch**: Single-window burst of 429s does not trigger alert if query volume is at/above baseline (indicates external factors, not partition saturation)
-   **Mixed Success/Failure Events**: Correctly counts only HTTP 429 failures by filtering `Graph.Query.Failed` events with `httpStatusCode == "429"` dimension

**Data Source:**

-   `Graph.Query.Failed` events with `httpStatusCode` dimension (added M2 Observability)
-   `Graph.Query.Executed` events for RU and latency context

**Related Telemetry Events:**

-   [`Graph.Query.Failed`](./telemetry-catalog.md#graphqueryfailed)
-   [`Graph.Query.Executed`](./telemetry-catalog.md#graphqueryexecuted)

**Related ADRs:**

-   [ADR-002: Graph Partition Strategy](../adr/ADR-002-graph-partition-strategy.md) — Defines thresholds: "> 50k vertices OR sustained RU >70% OR repeated 429s at <50 RPS"

**Response Guidance:**

1. **Verify Query Volume**: Check `TotalQueries` in alert payload. If significantly below baseline, investigate:
    - Partition key distribution (is all data in one partition?)
    - Query patterns (cross-partition queries more expensive)
    - RU provisioning (400 RU/s default may be too low for load)
2. **Check RU Consumption**: Review `AvgRU` and `TotalRU`. If consistently high:
    - Optimize queries (use `.limit()`, reduce traversal depth)
    - Consider increasing provisioned RU/s
3. **Partition Strategy**: If hot-partition suspected, review ADR-002 migration path to region-based sharding
4. **Latency Impact**: Check `P95Latency`. If >300ms, throttling is degrading user experience

**Escalation Path:**

-   **Normal Severity**: Monitor for 15 minutes; investigate if not auto-resolved
-   **High Severity**: Immediate investigation; may indicate critical partition saturation

**Deployment:**

```bash
# Deploy with default baseline (50 RPS)
az deployment group create \
  --resource-group rg-atlas-game \
  --template-file infrastructure/main.bicep

# Deploy with custom baseline (100 RPS)
az deployment group create \
  --resource-group rg-atlas-game \
  --template-file infrastructure/main.bicep \
  --parameters gremlinBaselineRps=100

# Suppress alert entirely (development/diagnostic)
az deployment group create \
  --resource-group rg-atlas-game \
  --template-file infrastructure/main.bicep \
  --parameters gremlinBaselineRps=0
```

**Testing:**

To verify alert configuration without triggering production incidents, simulate 429 errors in a test environment:

1. Temporarily reduce Cosmos DB RU provisioning to 400 RU/s (minimum)
2. Generate sustained Gremlin query load at 10-20 QPS
3. Observe 429 responses in Application Insights within 5 minutes
4. Verify alert fires and includes RU/latency context in payload
5. Restore normal RU provisioning
6. Verify alert auto-resolves after 15 minutes

**Dashboard Integration:**

This alert complements the **Performance Operations Dashboard** (`workbook-performance-operations-dashboard.bicep`), which visualizes:

-   RU consumption trends
-   Query latency percentiles (P50, P95, P99)
-   Throttling event frequency

**Issue Tracking:**

-   **Original Issue**: [#TBD - Configure 429 Spike Alert]
-   **Telemetry Dependency**: [#79 - Graph RU/Latency Telemetry](https://github.com/piquet-h/the-shifting-atlas/issues/79)
-   **Related**: [#10 - Movement Success Rate Dashboard](https://github.com/piquet-h/the-shifting-atlas/issues/10)

---

#### Sustained High RU Utilization

**Alert ID:** `alert-ru-utilization-{name}`  
**Bicep Module:** `infrastructure/alert-ru-utilization.bicep`  
**Status:** Active (M2 Observability)

**Purpose:**  
Detect sustained high RU consumption (>70%) over multiple consecutive 5-minute windows, indicating partition pressure or inefficient queries. Auto-resolves when RU% drops below 65% for 2 consecutive windows.

**Trigger Conditions:**

-   **Fire Threshold**: RU% >70% for 3 consecutive 5-minute windows (15 minutes sustained)
-   **Resolve Threshold**: RU% <65% for 2 consecutive windows (10 minutes)
-   **Evaluation Frequency**: Every 5 minutes
-   **Window Size**: 15 minutes (rolling)
-   **Data Quality Requirement**: ≥70% of events must have RU data (suppresses alert if insufficient telemetry)

**Alert Payload Context:**

-   `RUPercent`: Current RU utilization percentage
-   `Interval`: Number of consecutive high-RU intervals
-   `TopOperations`: Top operations by RU consumption
-   `DataQuality`: Percentage of events with RU data

**Configuration:**

-   **Main Parameters** (in `infrastructure/main.bicep`):
    -   `provisionedRuPerSecond`: Provisioned RU/s throughput (default: 400)
    -   `enabled`: Enable/disable alert (default: true)

-   **Module Parameters** (in `infrastructure/alert-ru-utilization.bicep`):
    -   `fireRuPercentThreshold`: RU% to trigger alert (default: 70)
    -   `resolveRuPercentThreshold`: RU% to auto-resolve (default: 65)
    -   `consecutiveFireWindows`: Consecutive windows above fire threshold (default: 3)
    -   `consecutiveResolveWindows`: Consecutive windows below resolve threshold (default: 2)
    -   `minDataQualityPercent`: Minimum % of events with RU data (default: 70)

**Parameter Tuning Table:**

| Parameter | Default | Purpose | Tuning Guidance |
|-----------|---------|---------|----------------|
| `fireRuPercentThreshold` | 70 | RU% to fire alert | Lower for early warning; higher to reduce false positives |
| `resolveRuPercentThreshold` | 65 | RU% to auto-resolve | Should be 5-10% below fire threshold to avoid flapping |
| `consecutiveFireWindows` | 3 | Sustained high required | Increase to filter transient spikes |
| `consecutiveResolveWindows` | 2 | Sustained recovery required | Should be < consecutiveFireWindows |
| `minDataQualityPercent` | 70 | Telemetry quality gate | Increase if RU tracking is reliable |

**Data Source:**

-   `Graph.Query.Executed` events with `ruCharge` dimension

**Related ADRs:**

-   [ADR-002: Graph Partition Strategy](../adr/ADR-002-graph-partition-strategy.md) — 70% RU threshold

**Response Guidance:**

1. **Check Top Operations**: Review `TopOperations` in payload for high-RU queries
2. **Optimize Queries**: Add `.limit()`, reduce traversal depth, improve indexing
3. **Review Partition Key**: Ensure even distribution per ADR-002
4. **Scale RU/s**: If sustained, consider increasing provisioned throughput

**Issue Tracking:**

-   **Original Issue**: [#292 - Sustained High RU Utilization Alert]

---

#### Composite Partition Pressure (Critical)

**Alert ID:** `alert-composite-partition-pressure-{name}`  
**Bicep Module:** `infrastructure/alert-composite-partition-pressure.bicep`  
**Status:** Active (M2 Observability)

**Purpose:**  
Multi-signal critical alert combining RU%, throttling (429), and latency degradation to reduce false positives and signal urgent partition pressure requiring immediate intervention. Fires only when all three conditions are met simultaneously.

**Trigger Conditions:**

All three conditions must be met in the same 5-minute window:

1. **RU% > 70%**: Total RU consumption exceeds threshold
2. **429 Count ≥ 3**: At least 3 throttling responses
3. **P95 Latency Increase > 25%**: Current P95 latency increased >25% vs 24-hour baseline

**Baseline Requirements:**

-   **Baseline Window**: Rolling 24 hours (excluding current hour to avoid skew)
-   **Minimum Samples**: ≥100 `Graph.Query.Executed` events in baseline window
-   **Suppression**: Alert suppressed if baseline sample count <100 (diagnostic event logged instead)

**Alert Payload Context:**

-   `ruPercent`: Current RU utilization percentage
-   `count429`: Number of 429 throttling responses
-   `currentP95Latency`: Current P95 latency (ms)
-   `baselineP95Latency`: 24-hour baseline P95 latency (ms)
-   `latencyIncreasePct`: Percentage increase from baseline
-   `sampleCount`: Current window sample count
-   `baselineSampleCount`: Baseline window sample count
-   `top2Operations`: Top 2 operations by RU consumption

**Configuration:**

-   **Main Parameters** (in `infrastructure/main.bicep`):
    -   `maxRuPerInterval`: Maximum RU per 5-minute interval (default: 120000 for 400 RU/s × 300s)

-   **Module Parameters** (in `infrastructure/alert-composite-partition-pressure.bicep`):
    -   `ruPercentThreshold`: RU% threshold (default: 70)
    -   `throttlingCountThreshold`: Minimum 429 count (default: 3)
    -   `latencyIncreasePercentThreshold`: Latency increase % vs baseline (default: 25)
    -   `minBaselineSamples`: Minimum baseline samples required (default: 100)

**Parameter Tuning Table:**

| Parameter | Default | Purpose | Tuning Guidance |
|-----------|---------|---------|----------------|
| `ruPercentThreshold` | 70 | RU% component | Align with RU utilization alert |
| `throttlingCountThreshold` | 3 | 429 count component | Lower = more sensitive to throttling |
| `latencyIncreasePercentThreshold` | 25 | Latency degradation % | Lower = more sensitive to latency impact |
| `minBaselineSamples` | 100 | Baseline quality gate | Higher = more reliable baseline comparison |

**Data Source:**

-   `Graph.Query.Executed` events with `ruCharge`, `latencyMs`/`durationMs`, `statusCode`/`httpStatusCode` dimensions

**Related ADRs:**

-   [ADR-002: Graph Partition Strategy](../adr/ADR-002-graph-partition-strategy.md) — Multi-signal thresholds

**Response Guidance:**

1. **Immediate Investigation**: Critical severity requires urgent action
2. **Review Alert Payload**: Check all three metrics and top operations
3. **Partition Analysis**: Verify partition key distribution (hot partition suspected)
4. **Query Optimization**: Review and optimize high-RU operations immediately
5. **Consider Migration**: If sustained, review ADR-002 partition migration path

**Escalation Path:**

-   **Critical Severity**: Immediate escalation; may indicate imminent service degradation

**Issue Tracking:**

-   **Original Issue**: [#294 - Composite Partition Pressure Alert]
-   **Dependencies**: [#292 - RU Alert], [#293 - 429 Spike Alert]

---

## Adding New Alerts

### Process

1. Choose descriptive alert name following pattern: `{service}-{metric}-{condition}-{name}`
2. Create Bicep module in `infrastructure/alert-{name}.bicep`
3. Document in this catalog (copy template below)
4. Add module reference to `infrastructure/main.bicep`
5. Update infrastructure README parameters section
6. Test alert in non-production environment

### Template

```markdown
#### {Alert Display Name}

**Alert ID:** `{resource-name-prefix}`  
**Bicep Module:** `infrastructure/alert-{name}.bicep`  
**Status:** Active | Planned | Deprecated

**Purpose:**  
{Why this alert exists; what anomaly it detects}

**Trigger Conditions:**

-   **Threshold**: {metric} {operator} {value} over {window}
-   **Evaluation Frequency**: {minutes}
-   **Auto-Resolve**: {conditions}

**Alert Payload Context:**  
{Key dimensions/metrics included in alert}

**Configuration:**  
{Parameter names, defaults, suppression options}

**Data Source:**  
{Telemetry event names, log sources}

**Response Guidance:**  
{Step-by-step operational response}

**Escalation Path:**  
{When to escalate vs auto-resolve}
```

---

## Related Documentation

-   [Telemetry Event Catalog](./telemetry-catalog.md) — Event definitions and dimensions
-   [Threshold Tuning Report](./threshold-tuning.md) — Baseline metrics and threshold calibration methodology (Issue #297)
-   [Infrastructure README](../../infrastructure/README.md) — Bicep deployment parameters
-   [ADR-002: Graph Partition Strategy](../adr/ADR-002-graph-partition-strategy.md) — Partition thresholds
-   [Observability Overview](../observability.md) — High-level monitoring strategy

---

**Last Updated:** 2025-11-08  
**Alert Count:** 3 active alerts (429 Spike, RU Utilization, Composite Partition Pressure)
