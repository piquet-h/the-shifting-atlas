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

-   **Parameter**: `gremlinBaselineRps` in `infrastructure/main.bicep`
-   **Default**: `50` RPS
-   **Suppression**: Set `gremlinBaselineRps = 0` to disable alert entirely (diagnostic/development mode)

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
**Alert Count:** 1 active alert
