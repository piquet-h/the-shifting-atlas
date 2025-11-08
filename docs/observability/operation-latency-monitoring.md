# Operation Latency Monitoring with Azure Monitor Alerts

## Overview

Native Azure Monitor scheduled query alerts that monitor P95 latency for non-movement Gremlin operations to detect persistence degradation.

**Issue:** #295 (M2 Observability)  
**Related:** ADR-002 latency guidance

## Why Azure Monitor Alerts?

This implementation uses native Azure Monitor alerts instead of custom timer functions for several key advantages:

✅ **Zero Custom Code** - Purely declarative Bicep infrastructure  
✅ **No Maintenance Burden** - Azure manages alert evaluation and state  
✅ **No Execution Costs** - No Function compute charges for monitoring  
✅ **Built-in Features** - Alert lifecycle, action groups, auto-resolution  
✅ **Persistent State** - Survives restarts and deployments  
✅ **Native UI** - Manage alerts in Azure Portal  
✅ **Action Groups** - Email, webhook, SMS notifications out-of-the-box

## Monitored Operations

The following Gremlin operations are monitored for latency degradation:

- `location.upsert.check` - Location vertex existence check
- `location.upsert.write` - Location vertex upsert operation
- `exit.ensureExit.check` - Exit edge existence check
- `exit.ensureExit.create` - Exit edge creation
- `player.create` - Player vertex creation

These operations are tracked via `Graph.Query.Executed` telemetry events emitted by the `queryWithTelemetry` method in repository classes.

## Alert Configuration

### Thresholds

| Severity | P95 Latency | Consecutive Windows | Auto-Resolve |
|----------|-------------|---------------------|--------------|
| **Critical** | >600ms | 3 (30 minutes) | 2 healthy windows (20 minutes) |
| **Warning** | >500ms | 3 (30 minutes) | 2 healthy windows (20 minutes) |

**Minimum Sample Size:** 20 calls per 10-minute window (windows with fewer calls are ignored)

### Evaluation Schedule

- **Frequency**: Every 10 minutes
- **Time Window**: 10 minutes
- **Consecutive Periods**: 3 windows must exceed threshold before alert fires
- **Auto-Mitigation**: Alert automatically resolves after threshold clears for 2 consecutive windows

### Alert Rules

**Total Rules**: 10 (5 operations × 2 severity levels)

Each operation has two alert rules:
1. Critical alert (Severity 1) - P95 >600ms
2. Warning alert (Severity 2) - P95 >500ms

## Deployment

### Bicep Module

Alert rules are defined in `infrastructure/alerts-operation-latency.bicep` and referenced in `main.bicep`:

```bicep
module operationLatencyAlerts 'alerts-operation-latency.bicep' = {
  name: 'alerts-operation-latency'
  params: {
    applicationInsightsId: applicationInsights.id
    location: location
  }
}
```

### No Additional Configuration Required

Unlike custom timer functions, Azure Monitor alerts require:
- ❌ No environment variables
- ❌ No RBAC role assignments
- ❌ No Managed Identity permissions
- ❌ No Function app dependencies
- ❌ No custom code maintenance

Azure manages everything automatically.

## KQL Query Logic

Each alert rule uses this query pattern:

```kusto
let threshold = 600; // or 500 for warning
let minSampleSize = 20;
customEvents
| where name == 'Graph.Query.Executed'
| extend operationName = tostring(customDimensions.operationName)
| extend latencyMs = todouble(customDimensions.latencyMs)
| where operationName == 'location.upsert.check' // operation-specific
| where isnotempty(latencyMs)
| summarize 
    P95 = percentile(latencyMs, 95),
    SampleSize = count(),
    AvgLatency = avg(latencyMs),
    MaxLatency = max(latencyMs)
| where SampleSize >= minSampleSize
| where P95 > threshold
| project P95, SampleSize, AvgLatency, MaxLatency, Threshold = threshold
```

The alert fires when the query returns any results (indicating P95 exceeded the threshold).

## Managing Alerts

### View Active Alerts

**Azure Portal:**
1. Navigate to your Application Insights resource
2. Select **Alerts** in the left menu
3. View fired alerts and their history

**CLI:**
```bash
az monitor metrics alert list \
  --resource-group <resource-group> \
  --query "[?starts_with(name, 'alert-latency')]"
```

### Query Alert History

```kusto
AzureActivity
| where OperationNameValue contains "Microsoft.Insights/ScheduledQueryRules"
| where ActivityStatusValue == "Success"
| project TimeGenerated, OperationNameValue, Properties
| order by TimeGenerated desc
```

### View Alert Details

When an alert fires, it includes:
- **P95 Latency** - Current P95 value that triggered the alert
- **Sample Size** - Number of operations in the window
- **Avg Latency** - Average latency for context
- **Max Latency** - Maximum latency observed
- **Threshold** - The threshold that was exceeded

### Action Groups (Optional)

To receive notifications when alerts fire, create an action group:

```bash
# Create action group for email notifications
az monitor action-group create \
  --name "operation-latency-alerts" \
  --resource-group <resource-group> \
  --short-name "OpLatency" \
  --email-receiver \
    name="DevOps Team" \
    email-address="devops@example.com"

# Update alert rules to use action group (in Bicep)
actions: {
  actionGroups: [
    '/subscriptions/<subscription-id>/resourceGroups/<rg>/providers/Microsoft.Insights/actionGroups/operation-latency-alerts'
  ]
}
```

## Troubleshooting

### No Alerts Firing (Expected Behavior)

If operations are healthy (P95 <500ms), no alerts will fire. This is correct.

To verify alerts are configured correctly:
1. Check alert rules exist in Azure Portal
2. Verify Application Insights is receiving `Graph.Query.Executed` events
3. Confirm operations have sufficient volume (>20 calls per 10 minutes)

### Check Graph.Query.Executed Events

```kusto
customEvents
| where timestamp > ago(1h)
| where name == 'Graph.Query.Executed'
| extend operationName = tostring(customDimensions.operationName)
| summarize Count = count(), AvgLatency = avg(todouble(customDimensions.latencyMs)) by operationName
| order by Count desc
```

### Simulate Latency Degradation (Testing)

To test alerts in a non-production environment:

1. Artificially slow down operations (add delays)
2. Wait 30 minutes (3 evaluation periods)
3. Check alert fires in Azure Portal
4. Remove delays
5. Wait 20 minutes (2 evaluation periods)
6. Confirm alert auto-resolves

### Alert Fired But Latency Looks OK

Check:
- Is this a **trailing alert** from earlier degradation?
- Auto-mitigation takes 20 minutes after latency improves
- View alert timeline to see when condition first occurred

### Too Many Alerts

If alerts fire frequently:
- Review actual P95 latency - may indicate real performance issue
- Consider adjusting thresholds if current levels are too sensitive
- Add **mute actions** period in alert rule (default: none)

## Comparison with Custom Function Approach

| Aspect | Azure Monitor Alerts | Custom Timer Function |
|--------|---------------------|----------------------|
| Code Complexity | Zero (Bicep only) | ~400 lines TypeScript |
| Maintenance | Azure-managed | Manual code maintenance |
| Execution Cost | None | Function compute charges |
| State Management | Persistent (Azure) | In-memory (lost on restart) |
| Testing Required | None (declarative) | Unit + integration tests |
| RBAC Setup | None | Monitoring Reader role |
| Alert UI | Azure Portal built-in | Custom telemetry queries |
| Notifications | Action Groups | Custom implementation |
| Deployment | Single Bicep module | Function + dependencies |

## Related Documentation

- [Azure Monitor Scheduled Query Alerts](https://learn.microsoft.com/en-us/azure/azure-monitor/alerts/alerts-types#log-alerts)
- [Telemetry Catalog](./telemetry-catalog.md) - Graph.Query.Executed event
- ADR-002 - Graph partition strategy and latency guidance
- Issue #295 - M2 Observability milestone

---

**Last Updated:** 2025-11-08  
**Implementation:** Azure Monitor native alerts (no custom code)
