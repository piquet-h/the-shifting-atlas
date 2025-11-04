# Movement Success Rate Workbook - Import Guide

## Overview

This workbook provides comprehensive monitoring of player movement health in The Shifting Atlas, tracking success vs. blocked movements to detect regressions in normalization and world connectivity.

## Related Issues

- [#10](https://github.com/piquet-h/the-shifting-atlas/issues/10) - Telemetry Event Registry Expansion (dependency)
- Implements requirements from Movement Success Rate Panel issue

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
2. **Blocked Reasons Breakdown**: Pie chart showing distribution of blocking reasons
   - `invalid-direction`: Invalid or unrecognized direction
   - `from-missing`: Origin location not found
   - `no-exit`: No exit exists in requested direction
   - `move-failed`: Repository or system error

## Edge Cases Handled

1. **Empty Dataset (No Movements)**: 
   - Query uses safe division: `Total == 0 ? 1 : Total`
   - Prevents division-by-zero errors
   - Displays zeros without errors

2. **Single Player High Blocked Rate**:
   - Aggregate metrics show overall system health
   - Blocked reasons breakdown helps identify patterns
   - Consider per-player analysis if spike detected

## Import Procedure

### Method 1: Azure Portal Import

1. Navigate to Azure Portal → Application Insights resource
2. Select **Workbooks** from left navigation
3. Click **+ New** or **+ Open**
4. Click **Advanced Editor** (</> icon)
5. Copy contents of `movement-success-rate-workbook.json`
6. Paste into the JSON editor
7. Click **Apply**
8. Click **Done Editing**
9. Click **Save** → provide name "Movement Success Rate Dashboard"
10. Select resource group and region
11. Click **Save**

### Method 2: ARM Template Deployment

The workbook JSON can be deployed via ARM template or Bicep:

```bicep
resource workbook 'Microsoft.Insights/workbooks@2022-04-01' = {
  name: guid('movement-success-rate-workbook')
  location: location
  kind: 'shared'
  properties: {
    displayName: 'Movement Success Rate Dashboard'
    serializedData: loadTextContent('movement-success-rate-workbook.json')
    sourceId: applicationInsights.id
    category: 'workbook'
  }
}
```

### Method 3: Azure CLI

```bash
az monitor app-insights workbook create \
  --resource-group <resource-group> \
  --name "MovementSuccessRate" \
  --display-name "Movement Success Rate Dashboard" \
  --serialized-data @movement-success-rate-workbook.json \
  --source-id <app-insights-resource-id> \
  --category "The Shifting Atlas"
```

## Verification Steps

After importing the workbook:

1. **Check Data Availability**: Ensure Application Insights has telemetry data
   - Navigate to Logs and run: `customEvents | where name in ("Navigation.Move.Success", "Navigation.Move.Blocked") | count`
   
2. **Verify Visualizations**: All panels should load without errors
   - Tiles panel shows current metrics
   - Summary table shows status with color coding
   - Trend chart displays hourly data
   - Pie chart shows blocked reasons

3. **Test Empty State**: If no data available:
   - Panels should display zeros
   - No errors or "division by zero" messages
   - Status shows appropriate state for 0 events

4. **Validate Thresholds**: When data exists:
   - Status colors match threshold definitions
   - Amber appears when SuccessRate is 90-94.99%
   - Red appears when SuccessRate is <90%
   - Green appears when SuccessRate is ≥95%

## Query Reference

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

## Operational Guidance

### Alert Configuration

Consider setting up Azure Monitor alerts based on workbook queries:

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
