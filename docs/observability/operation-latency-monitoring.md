# Operation Latency Monitoring Setup

## Overview

Timer-triggered Azure Function that monitors P95 latency for non-movement Gremlin operations to detect persistence degradation before it impacts player experience.

**Issue:** #10 (M2 Observability)  
**Related:** ADR-002 latency guidance, #79

## Monitored Operations

The following Gremlin operations are monitored for latency degradation:

- `location.upsert.check` - Location vertex existence check
- `location.upsert.write` - Location vertex upsert operation
- `exit.ensureExit.check` - Exit edge existence check
- `exit.ensureExit.create` - Exit edge creation
- `player.create` - Player vertex creation

These operations are tracked via `Graph.Query.Executed` telemetry events emitted by the `queryWithTelemetry` method in repository classes.

## Alert Thresholds

| Level | P95 Latency | Consecutive Windows | Action |
|-------|-------------|---------------------|--------|
| **Warning** | >500ms | 3 (30 minutes) | Investigate performance |
| **Critical** | >600ms | 3 (30 minutes) | Immediate action required |
| **Resolved** | <450ms | 2 (20 minutes) | Auto-resolve alert |

**Minimum Sample Size:** 20 calls per 10-minute window (windows with fewer calls are skipped with diagnostic telemetry)

## Configuration

### Environment Variables

#### Required
- `APPINSIGHTS_WORKSPACE_ID` - Application Insights workspace/app ID for querying telemetry
  - Automatically configured in Bicep: `applicationInsights.properties.AppId`
  - Used by Azure Monitor Query SDK to access telemetry data

#### Optional
- `OPERATION_LATENCY_MONITOR_SCHEDULE` - NCRONTAB schedule expression
  - Default: `"0 */10 * * * *"` (every 10 minutes)
  - Format: `{second} {minute} {hour} {day} {month} {day-of-week}`
  - Examples:
    - `"0 */5 * * * *"` - Every 5 minutes
    - `"0 0 * * * *"` - Every hour
    - `"0 */15 * * * *"` - Every 15 minutes

### Deployment

The monitoring function is automatically deployed with the backend Azure Functions app. No manual configuration is required beyond the environment variables.

#### Bicep Configuration

Added to `infrastructure/main.bicep`:
```bicep
APPINSIGHTS_WORKSPACE_ID: applicationInsights.properties.AppId
```

#### Permissions

The function uses Managed Identity (`DefaultAzureCredential`) to authenticate with Azure Monitor. The Function App's system-assigned managed identity needs the **Monitoring Reader** role on the Application Insights component:

```bash
# Grant Monitoring Reader role to Function App identity
az role assignment create \
  --assignee <function-app-principal-id> \
  --role "Monitoring Reader" \
  --scope /subscriptions/<subscription-id>/resourceGroups/<resource-group>/providers/Microsoft.Insights/components/<app-insights-name>
```

Or via Bicep:
```bicep
resource monitoringRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(backendFunctionApp.id, 'MonitoringReader', applicationInsights.id)
  scope: applicationInsights
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '43d0d8ad-25c7-4714-9337-8ba259a9fe05') // Monitoring Reader
    principalId: backendFunctionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}
```

## Telemetry Events

### Monitoring.OperationLatency.Alert

Emitted when P95 latency exceeds thresholds for 3 consecutive windows.

**Dimensions:**
- `operationName` - Name of the monitored operation
- `currentP95Ms` - Current window P95 latency
- `baselineP95Ms` - 24-hour baseline P95 for comparison
- `sampleSize` - Number of operations in current window
- `alertLevel` - `"warning"` or `"critical"`
- `thresholdMs` - Threshold that was exceeded
- `consecutiveWindows` - Number of consecutive windows (3)

### Monitoring.OperationLatency.Resolved

Emitted when P95 latency drops below 450ms for 2 consecutive windows.

**Dimensions:**
- `operationName`
- `currentP95Ms`
- `baselineP95Ms`
- `sampleSize`
- `thresholdMs` (450)
- `consecutiveWindows` (2)

### Monitoring.OperationLatency.InsufficientData

Emitted when a monitoring window has fewer than 20 operations (skipped from alert evaluation).

**Dimensions:**
- `operationName`
- `sampleSize` - Actual number of operations
- `minimumRequired` (20)
- `windowMinutes` (10)

### Monitoring.OperationLatency.Error

Emitted when an error occurs during monitoring for a specific operation.

**Dimensions:**
- `operationName`
- `errorMessage`

### Monitoring.OperationLatency.Complete

Emitted after each monitoring cycle (every 10 minutes).

**Dimensions:**
- `monitored` - Number of operations monitored
- `alerts` - Number of new alerts triggered
- `resolutions` - Number of alerts resolved
- `insufficientData` - Number of operations skipped due to low volume
- `durationMs` - Monitoring cycle duration
- `success` - `true` or `false`
- `errorMessage` - If `success` is false

## Querying in Application Insights

### View Current Alerts

```kusto
customEvents
| where timestamp > ago(1h)
| where name == 'Monitoring.OperationLatency.Alert'
| project 
    timestamp,
    operationName = tostring(customDimensions.operationName),
    alertLevel = tostring(customDimensions.alertLevel),
    currentP95Ms = todouble(customDimensions.currentP95Ms),
    baselineP95Ms = todouble(customDimensions.baselineP95Ms),
    sampleSize = toint(customDimensions.sampleSize)
| order by timestamp desc
```

### View Alert History (Last 7 Days)

```kusto
let timeRange = 7d;
customEvents
| where timestamp > ago(timeRange)
| where name in ('Monitoring.OperationLatency.Alert', 'Monitoring.OperationLatency.Resolved')
| extend 
    operationName = tostring(customDimensions.operationName),
    eventType = case(name == 'Monitoring.OperationLatency.Alert', 'Alert', 'Resolved'),
    alertLevel = tostring(customDimensions.alertLevel),
    currentP95Ms = todouble(customDimensions.currentP95Ms)
| project timestamp, operationName, eventType, alertLevel, currentP95Ms
| order by operationName, timestamp asc
```

### Monitoring Job Health

```kusto
customEvents
| where timestamp > ago(24h)
| where name == 'Monitoring.OperationLatency.Complete'
| project 
    timestamp,
    success = tobool(customDimensions.success),
    monitored = toint(customDimensions.monitored),
    alerts = toint(customDimensions.alerts),
    resolutions = toint(customDimensions.resolutions),
    durationMs = todouble(customDimensions.durationMs)
| summarize 
    TotalRuns = count(),
    SuccessfulRuns = countif(success == true),
    FailedRuns = countif(success == false),
    AvgDurationMs = avg(durationMs),
    TotalAlerts = sum(alerts),
    TotalResolutions = sum(resolutions)
| extend SuccessRate = round(100.0 * SuccessfulRuns / TotalRuns, 2)
```

## Troubleshooting

### No monitoring data appearing

1. **Check timer execution:**
   ```kusto
   traces
   | where timestamp > ago(1h)
   | where message contains "Operation latency monitoring"
   | order by timestamp desc
   ```

2. **Verify workspace ID is configured:**
   ```bash
   az functionapp config appsettings list \
     --name <function-app-name> \
     --resource-group <resource-group> \
     --query "[?name=='APPINSIGHTS_WORKSPACE_ID'].value"
   ```

3. **Check permissions:** Verify Function App has Monitoring Reader role

4. **Review error telemetry:**
   ```kusto
   customEvents
   | where timestamp > ago(1h)
   | where name == 'Monitoring.OperationLatency.Error'
   | project timestamp, customDimensions
   ```

### Frequent "InsufficientData" events

This is normal for:
- New deployments with low traffic
- Operations that run infrequently
- Off-peak hours

Consider adjusting `MIN_SAMPLE_SIZE` threshold in code if needed (currently 20 calls per 10 minutes).

### False positive alerts

If alerts trigger but manual investigation shows acceptable latency:
- Check baseline comparison - spikes may be relative to historical performance
- Verify `consecutiveWindows` logic is working (requires 3 consecutive windows)
- Review sample size in alert dimensions

## Related Documentation

- [Telemetry Catalog](./telemetry-catalog.md) - Complete event documentation
- ADR-002 - Graph partition strategy and latency guidance
- Issue #10 - M2 Observability milestone
- Issue #79 - Movement latency monitoring (related pattern)
