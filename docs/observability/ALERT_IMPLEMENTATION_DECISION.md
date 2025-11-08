# Azure Monitor Alerts vs Custom Timer Function: Analysis

## User Request
@piquet-h suggested exploring Azure Monitor alerts as an alternative to the custom timer function, noting it would reduce complexity and move operations out of direct game code.

## Comparison

### Custom Timer Function (Current Implementation)

**Advantages:**
- ✅ Custom logic for consecutive window tracking
- ✅ In-memory state management for alert lifecycle
- ✅ Flexible threshold logic (3 consecutive windows to alert, 2 to resolve)
- ✅ Custom telemetry events with detailed dimensions
- ✅ Baseline comparison (24h P95 context)

**Disadvantages:**
- ❌ Requires maintaining custom code in game backend
- ❌ Adds complexity to the Functions app
- ❌ In-memory state lost on function restart
- ❌ Requires dependency on @azure/monitor-query
- ❌ Custom query logic to maintain
- ❌ Function execution costs
- ❌ Requires Monitoring Reader RBAC assignment
- ❌ More code to test and maintain

### Azure Monitor Alerts (Native Solution)

**Advantages:**
- ✅ **No custom code required** - purely declarative Bicep
- ✅ **No function execution costs** - Azure manages the monitoring
- ✅ **Built-in alert lifecycle** - automatic resolution when condition clears
- ✅ **Persistent state** - Azure manages alert state across restarts
- ✅ **Action groups** - native integration with notifications (email, webhook, etc.)
- ✅ **Azure Portal UI** - view/manage alerts without custom dashboards
- ✅ **Built-in throttling** - prevents alert storms
- ✅ **No RBAC complexity** - alerts run in Azure's context
- ✅ **Log Analytics queries** - same KQL queries, no SDK needed
- ✅ **Evaluation frequency** - built-in support for time windows
- ✅ **Alert rules versioning** - managed by Azure Resource Manager

**Disadvantages:**
- ⚠️ Less flexible for complex multi-window logic
- ⚠️ Standard alert dimensions (can't add custom baseline comparison inline)
- ⚠️ May require multiple alert rules for warning/critical thresholds

## Recommendation: Use Azure Monitor Alerts

**Rationale:**
1. **Simplicity**: The issue requirements (P95 >600ms for consecutive windows) map directly to Azure Monitor scheduled query alerts
2. **Separation of Concerns**: Monitoring infrastructure shouldn't live in game code
3. **Lower Maintenance**: No custom code to test, debug, or maintain
4. **Cost Efficiency**: No Function execution costs for monitoring
5. **Native Features**: Built-in alert management, action groups, auto-resolution

## Implementation Plan

Replace custom timer function with Azure Monitor scheduled query alert rules:

### 1. Alert Rule per Operation
Create 5 alert rules (one per monitored operation):
- location.upsert.check
- location.upsert.write
- exit.ensureExit.check
- exit.ensureExit.create
- player.create

### 2. Two Severity Levels per Operation
Each operation needs 2 alert rules:
- **Critical** (Severity 1): P95 >600ms
- **Warning** (Severity 2): P95 >500ms

### 3. KQL Query Pattern
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
    SampleSize = count()
| where SampleSize >= minSampleSize
| where P95 > threshold
```

### 4. Alert Configuration
- **Frequency**: 10 minutes (matches current implementation)
- **Time window**: 10 minutes
- **Threshold**: Fire when query returns results (P95 exceeds threshold)
- **Auto-mitigation**: 20 minutes (2 consecutive 10-min windows below threshold)
- **Mute actions**: 30 minutes (prevent alert storms)

### 5. Bicep Implementation
```bicep
resource alertRule 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = {
  name: 'alert-latency-${operationName}-${severity}'
  location: location
  properties: {
    displayName: 'P95 Latency: ${operationName} (${severity})'
    description: 'Alerts when P95 latency exceeds ${threshold}ms for ${operationName}'
    severity: severityLevel
    enabled: true
    evaluationFrequency: 'PT10M'
    windowSize: 'PT10M'
    criteria: {
      allOf: [
        {
          query: '...' // KQL query from above
          timeAggregation: 'Count'
          operator: 'GreaterThan'
          threshold: 0 // Alert when query returns any rows
          failingPeriods: {
            numberOfEvaluationPeriods: 3 // 3 consecutive windows
            minFailingPeriodsToAlert: 3
          }
        }
      ]
    }
    autoMitigate: true
    checkWorkspaceAlertsStorageConfigured: false
    scopes: [
      applicationInsights.id
    ]
  }
}
```

### 6. What We Lose (Acceptable Trade-offs)
- ❌ Custom telemetry events (Monitoring.OperationLatency.*) - not needed, Azure provides alert history
- ❌ 24h baseline comparison in alert payload - can add to action group webhook payload if needed
- ❌ InsufficientData diagnostic events - acceptable, just means no alert fires

### 7. What We Gain
- ✅ Zero maintenance code
- ✅ Native Azure alert management UI
- ✅ Action groups for notifications
- ✅ Alert history and analytics
- ✅ Simpler deployment (just Bicep, no Function code)
- ✅ No function execution costs
- ✅ No custom dependencies

## Migration Steps

1. Create Bicep alert rule module
2. Instantiate 10 alert rules (5 operations × 2 severities)
3. Optional: Create action group for alert notifications
4. Remove custom timer function code
5. Remove custom telemetry events
6. Update documentation to reference Azure Monitor alerts
7. Update package.json to remove @azure/monitor-query

## Conclusion

**Azure Monitor alerts are the correct solution** for this requirement. They provide all the necessary functionality (consecutive window tracking, auto-resolution, per-operation monitoring) without custom code complexity.
