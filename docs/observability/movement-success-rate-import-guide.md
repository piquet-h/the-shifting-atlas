# Movement Navigation Dashboard - Import Guide

## Overview

This consolidated workbook provides comprehensive monitoring of player movement health in The Shifting Atlas, tracking success vs. blocked movements, latency distribution, and blocked reasons to detect regressions in normalization, world connectivity, and performance.

## Related Issues

- [#10](https://github.com/piquet-h/the-shifting-atlas/issues/10) - Telemetry Event Registry Expansion (dependency)
- [#281](https://github.com/piquet-h/the-shifting-atlas/issues/281) - Movement Success Rate Panel
- [#282](https://github.com/piquet-h/the-shifting-atlas/issues/282) - Movement Blocked Reasons Breakdown
- [#283](https://github.com/piquet-h/the-shifting-atlas/issues/283) - Movement Latency Distribution (P95/P99)

## Events Tracked

The workbook queries the following telemetry events from the event registry:

- **`Navigation.Move.Success`**: Successful player movement (destination resolved, heading updated)
- **`Navigation.Move.Blocked`**: Failed movement attempt (invalid direction, missing origin, absent exit, repository error)

See `docs/observability/telemetry-catalog.md` for full event specifications.

## Metrics Displayed

### Primary Metrics (Last 24h)
- **Success**: Count of successful movements
- **Blocked**: Count of blocked movements
- **SuccessRate (%)**: Percentage of successful movements
- **BlockedRate (%)**: Percentage of blocked movements

### Thresholds
- 🟢 **Normal**: SuccessRate ≥ 95%
- 🟡 **Warning (Amber)**: 90% ≤ SuccessRate < 95%
- 🔴 **Critical (Red)**: SuccessRate < 90%

### Additional Visualizations
1. **Success Rate Trend**: Hourly trend line over 24 hours
2. **Blocked Reasons Breakdown**: Table showing distribution of blocking reasons
   - `invalid-direction`: Invalid or unrecognized direction
   - `from-missing`: Origin location not found
   - `no-exit`: No exit exists in requested direction
   - `move-failed`: Repository or system error
3. **Blocked Rate Trend**: 7-day blocked rate trend
4. **Latency Distribution**: P50/P95/P99 latency percentiles for both Success and Blocked events
   - 1h and 24h comparative windows
   - Threshold annotations: P95 success >400ms (amber), >600ms (red)
   - Sample size display for percentile stability assessment
   - Low event volume warning (<20 events)
5. **Latency Trend**: P95 latency trend comparing Success vs Blocked events over 24h

## Edge Cases Handled

1. **Empty Dataset (No Movements)**: 
   - Query uses safe division: `Total == 0 ? 1 : Total`
   - Prevents division-by-zero errors
   - Displays zeros without errors

2. **Single Player High Blocked Rate**:
   - Aggregate metrics show overall system health
   - Blocked reasons breakdown helps identify patterns
   - Consider per-player analysis if spike detected

3. **Low Event Volume (<20 events)**:
   - Latency percentile panel displays stability warning
   - Percentiles may be unreliable with insufficient sample size
   - Notice: "⚠️ INSTABILITY NOTICE: <20 total events in last 24h. Percentiles unreliable. Wait for more data."

4. **Missing latency_ms Dimension**:
   - Query filters out null/missing latency values gracefully
   - Only valid latency measurements included in percentile calculations
   - Events without latency_ms dimension are excluded (should not occur in normal operation)

## Deployment

### Primary Method: Bicep Infrastructure-as-Code (Recommended)

The workbook is automatically deployed as part of the main infrastructure deployment:

- **Module**: `infrastructure/workbook-movement-navigation-dashboard.bicep`
- **Integration**: Included in `infrastructure/main.bicep`
- **Workbook Definition**: `infrastructure/workbooks/movement-navigation-dashboard.workbook.json`

Deploy the complete infrastructure stack to provision the workbook:

```bash
az deployment group create \
  --resource-group <resource-group> \
  --template-file infrastructure/main.bicep \
  --parameters name=atlas location=<region>
```

The workbook will be automatically created and linked to the Application Insights resource.

### Alternative: Manual Azure Portal Import

For development or testing purposes, you can manually import the workbook:

1. Navigate to Azure Portal → Application Insights resource
2. Select **Workbooks** from left navigation
3. Click **+ New** or **+ Open**
4. Click **Advanced Editor** (</> icon)
5. Copy contents of `infrastructure/workbooks/movement-navigation-dashboard.workbook.json`
6. Paste into the JSON editor
7. Click **Apply**
8. Click **Done Editing**
9. Click **Save** → provide name "Movement Navigation Dashboard"
10. Select resource group and region
11. Click **Save**

**Note**: Manual imports are not tracked in infrastructure-as-code and may be overwritten by automated deployments.

## Verification Steps

After importing the workbook:

1. **Check Data Availability**: Ensure Application Insights has telemetry data
   - Navigate to Logs and run: `customEvents | where name in ("Navigation.Move.Success", "Navigation.Move.Blocked") | count`
   
2. **Verify Visualizations**: All panels should load without errors
   - Tiles panel shows current metrics
   - Summary table shows status with color coding
   - Trend charts display hourly data
   - Blocked reasons table shows breakdown
   - Latency percentiles table shows 1h and 24h windows
   - Latency trend chart displays P95 comparison

3. **Test Empty State**: If no data available:
   - Panels should display zeros
   - No errors or "division by zero" messages
   - Status shows appropriate state for 0 events
   - Latency panel shows instability notice

4. **Validate Thresholds**: When data exists:
   - Status colors match threshold definitions
   - Amber appears when SuccessRate is 90-94.99%
   - Red appears when SuccessRate is <90%
   - Green appears when SuccessRate is ≥95%
   - Latency P95 status shows 🟢 Normal (<400ms), 🟡 Warning (400-599ms), 🔴 Critical (≥600ms)

5. **Check Latency Data**: Verify latency_ms dimension is present
   - Run: `customEvents | where name in ("Navigation.Move.Success", "Navigation.Move.Blocked") | extend latency = todouble(customDimensions.latency_ms) | where isnotnull(latency) | count`
   - If count is 0, latency_ms dimension is missing (backend issue)
   - Sample size warning should appear if count <20

## Query Reference

### Success Rate Query

The core Kusto query from `telemetry-catalog.md`:

```kusto
customEvents
| where timestamp > ago(24h)
| where name in ("Navigation.Move.Success", "Navigation.Move.Blocked")
| summarize Success=countif(name == "Navigation.Move.Success"),
            Blocked=countif(name == "Navigation.Move.Blocked"),
            Total=Success + Blocked,
            SuccessRate = 100.0 * Success / (Total == 0 ? 1 : Total),
            BlockedRate = 100.0 * Blocked / (Total == 0 ? 1 : Total)
```

### Latency Distribution Query

Query for P50/P95/P99 latency percentiles with 1h and 24h windows:

```kusto
// Movement Latency Percentiles - 1h & 24h comparison
let timeRange1h = 1h;
let timeRange24h = 24h;
let minEvents = 20;
// 1h window
let events1h = customEvents
| where timestamp > ago(timeRange1h)
| where name in ('Navigation.Move.Success', 'Navigation.Move.Blocked')
| extend latencyMs = todouble(customDimensions.latency_ms)
| where isnotnull(latencyMs) and latencyMs >= 0;
let count1h = toscalar(events1h | count);
let percentiles1h = events1h
| summarize 
    Count = count(),
    P50 = round(percentile(latencyMs, 50), 0),
    P95 = round(percentile(latencyMs, 95), 0),
    P99 = round(percentile(latencyMs, 99), 0)
  by EventName = name
| extend TimeWindow = '1h';
// 24h window
let events24h = customEvents
| where timestamp > ago(timeRange24h)
| where name in ('Navigation.Move.Success', 'Navigation.Move.Blocked')
| extend latencyMs = todouble(customDimensions.latency_ms)
| where isnotnull(latencyMs) and latencyMs >= 0;
let count24h = toscalar(events24h | count);
let percentiles24h = events24h
| summarize 
    Count = count(),
    P50 = round(percentile(latencyMs, 50), 0),
    P95 = round(percentile(latencyMs, 95), 0),
    P99 = round(percentile(latencyMs, 99), 0)
  by EventName = name
| extend TimeWindow = '24h';
// Union both windows with threshold annotations
union percentiles1h, percentiles24h
| extend P95Status = iff(EventName == 'Navigation.Move.Success',
    iff(P95 < 400, '🟢 Normal',
        iff(P95 < 600, '🟡 Warning', '🔴 Critical')),
    'n/a')
| extend StabilityWarning = iff(Count < minEvents, '⚠️ Low Volume (<20)', '')
| project TimeWindow, EventName, Count, P50, P95, P99, P95Status, StabilityWarning
| order by TimeWindow desc, EventName asc
```

## Operational Guidance

### Alert Configuration

Consider setting up Azure Monitor alerts based on workbook queries:

**Success Rate Alert:**
```kusto
// Alert when SuccessRate < 95% for 15 minutes
customEvents
| where timestamp > ago(15m)
| where name in ("Navigation.Move.Success", "Navigation.Move.Blocked")
| summarize Success=countif(name == "Navigation.Move.Success"),
            Blocked=countif(name == "Navigation.Move.Blocked")
| extend Total = Success + Blocked
| extend SuccessRate = 100.0 * Success / (Total == 0 ? 1 : Total)
| where SuccessRate < 95 and Total > 10
```

**Latency P95 Alert:**
```kusto
// Alert when P95 latency > 400ms for Navigation.Move.Success (5 minutes)
customEvents
| where timestamp > ago(5m)
| where name == 'Navigation.Move.Success'
| extend latencyMs = todouble(customDimensions.latency_ms)
| where isnotnull(latencyMs)
| summarize 
    P95 = percentile(latencyMs, 95),
    Count = count()
| where P95 > 400 and Count >= 20
```

### Troubleshooting

**No Data Displayed:**
- Verify Application Insights connection string is configured
- Check that telemetry events are being emitted from backend
- Confirm sampling rate isn't filtering all events
- Validate time range (default: last 24h)

**High Blocked Rate:**
1. Check Blocked Reasons Breakdown panel
2. If `invalid-direction`: Review direction normalization logic
3. If `no-exit`: World connectivity issues or missing exits
4. If `from-missing`: Player location sync issues
5. If `move-failed`: Backend service or Cosmos DB issues

**High Latency (P95 > 400ms):**
1. Check Latency Distribution panel for trends
2. Compare 1h vs 24h windows to identify recent regressions
3. Verify Cosmos DB performance metrics (RU consumption, throttling)
4. Check Application Insights dependencies for slow queries
5. Review blocked vs success latency - blocked should be faster (no persistence)
6. If P95 > 600ms: Critical - investigate immediately

**Low Event Volume Warning:**
- Percentile calculations require ≥20 events for statistical reliability
- Wait for more data before making performance conclusions
- Consider extending time window if traffic is consistently low

**Threshold Colors Not Showing:**
- Verify formatters are properly configured in table visualization
- Check that Status column calculation is working
- Ensure SuccessRate is numeric (not string)

## Maintenance

- **Update Frequency**: Dashboard auto-refreshes every 5 minutes (configurable)
- **Data Retention**: 24-hour window (adjustable in queries)
- **Event Schema Changes**: If event dimensions change, update blocked reasons breakdown query
- **Threshold Tuning**: Modify threshold values in Status calculation as needed

## Related Documentation

- [Telemetry Catalog](./telemetry-catalog.md) - Full event specifications
- [Observability Overview](../observability.md) - Overall monitoring strategy
- [ADR-002](../../architecture/adr/ADR-002-graph-partition-strategy.md) - Related partition monitoring

## Milestone

M2 Observability - Dashboard monitoring for core game loop health
