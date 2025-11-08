/**
 * Azure Monitor Alert Rules for Operation Latency Monitoring
 * 
 * Monitors P95 latency for non-movement Gremlin operations using native Azure Monitor scheduled query alerts.
 * Replaces custom timer function implementation for simplicity and maintainability.
 * 
 * Issue: #295 (M2 Observability)
 * Related: ADR-002 latency guidance
 * 
 * Monitored Operations:
 * - location.upsert.check
 * - location.upsert.write
 * - exit.ensureExit.check
 * - exit.ensureExit.create
 * - player.create
 * 
 * Alert Configuration:
 * - Evaluation Frequency: Every 10 minutes
 * - Time Window: 10 minutes
 * - Consecutive Periods: Managed by ops/config, not code
 * - Auto-Mitigation: Enabled (timing controlled by Azure)
 * - Minimum Sample Size: 20 calls per window
 * 
 * Severity Levels:
 * - Critical (Severity 1): P95 >600ms
 * - Warning (Severity 2): P95 >500ms
 */

@description('Application Insights resource for alert scoping')
param applicationInsightsId string

@description('Location for alert rules')
param location string

// Operations to monitor
var operations = [
  'location.upsert.check'
  'location.upsert.write'
  'exit.ensureExit.check'
  'exit.ensureExit.create'
  'player.create'
]

// Create alert rules for each operation x severity combination
resource alertRules 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = [for operation in operations: {
  name: 'alert-latency-${replace(operation, '.', '-')}-critical'
  location: location
  properties: {
    displayName: 'Operation Latency: ${operation} (Critical)'
    description: 'Alerts when P95 latency exceeds 600ms for ${operation}. Auto-resolves when condition clears.'
    severity: 1
    enabled: true
    evaluationFrequency: 'PT10M'
    windowSize: 'PT10M'
    criteria: {
      allOf: [
        {
          query: '''
            let threshold = 600;
            let minSampleSize = 20;
            customEvents
            | where name == 'Graph.Query.Executed'
            | extend operationName = tostring(customDimensions.operationName)
            | extend latencyMs = todouble(customDimensions.latencyMs)
            | where operationName == '${operation}'
            | where isnotempty(latencyMs)
            | summarize 
                P95 = percentile(latencyMs, 95),
                SampleSize = count(),
                AvgLatency = avg(latencyMs),
                MaxLatency = max(latencyMs)
            | where SampleSize >= minSampleSize
            | where P95 > threshold
            | project P95, SampleSize, AvgLatency, MaxLatency, Threshold = threshold
          '''
          timeAggregation: 'Count'
          dimensions: []
          operator: 'GreaterThan'
          threshold: 0
          // Game code does not set multi-window evaluation periods; consecutive windows are ops/config.
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    autoMitigate: true
    checkWorkspaceAlertsStorageConfigured: false
    scopes: [
      applicationInsightsId
    ]
    actions: {
      actionGroups: []
      customProperties: {
        operationName: operation
        thresholdMs: '600'
        severityLevel: 'critical'
      }
    }
  }
}]

resource warningAlertRules 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = [for operation in operations: {
  name: 'alert-latency-${replace(operation, '.', '-')}-warning'
  location: location
  properties: {
    displayName: 'Operation Latency: ${operation} (Warning)'
    description: 'Alerts when P95 latency exceeds 500ms for ${operation}. Auto-resolves when condition clears.'
    severity: 2
    enabled: true
    evaluationFrequency: 'PT10M'
    windowSize: 'PT10M'
    criteria: {
      allOf: [
        {
          query: '''
            let threshold = 500;
            let minSampleSize = 20;
            customEvents
            | where name == 'Graph.Query.Executed'
            | extend operationName = tostring(customDimensions.operationName)
            | extend latencyMs = todouble(customDimensions.latencyMs)
            | where operationName == '${operation}'
            | where isnotempty(latencyMs)
            | summarize 
                P95 = percentile(latencyMs, 95),
                SampleSize = count(),
                AvgLatency = avg(latencyMs),
                MaxLatency = max(latencyMs)
            | where SampleSize >= minSampleSize
            | where P95 > threshold
            | project P95, SampleSize, AvgLatency, MaxLatency, Threshold = threshold
          '''
          timeAggregation: 'Count'
          dimensions: []
          operator: 'GreaterThan'
          threshold: 0
          // Game code does not set multi-window evaluation periods; consecutive windows are ops/config.
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    autoMitigate: true
    checkWorkspaceAlertsStorageConfigured: false
    scopes: [
      applicationInsightsId
    ]
    actions: {
      actionGroups: []
      customProperties: {
        operationName: operation
        thresholdMs: '500'
        severityLevel: 'warning'
      }
    }
  }
}]

// Outputs for reference
output criticalAlertRuleIds array = [for i in range(0, length(operations)): alertRules[i].id]
output warningAlertRuleIds array = [for i in range(0, length(operations)): warningAlertRules[i].id]
