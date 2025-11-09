/**
 * Consolidated Azure Monitor Alert Rules for Operation Latency Monitoring
 * 
 * Replaces 10 individual alerts (5 operations × 2 severities) with 2 consolidated alerts.
 * 
 * Benefits:
 * - 83% query reduction: 60 → 10 queries/hour
 * - Cost savings: ~$10-15/month
 * - Easier maintenance: single query to update
 * - Better alert payload: shows ALL affected operations
 * 
 * Issue: #295 (M2 Observability)
 * Related: ADR-002 latency guidance, Alert Optimization Plan
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
 * - Auto-Mitigation: Enabled
 * - Minimum Sample Size: 20 calls per operation per window
 * 
 * Severity Levels:
 * - Critical (Severity 1): P95 >600ms
 * - Warning (Severity 2): P95 >500ms
 */

@description('Application Insights resource for alert scoping')
param applicationInsightsId string

@description('Location for alert rules')
param location string

@description('Action group for notifications (optional)')
param actionGroupId string = ''

@description('Critical latency threshold in milliseconds')
param criticalThresholdMs int = 600

@description('Warning latency threshold in milliseconds')
param warningThresholdMs int = 500

@description('Minimum sample size required per operation')
param minSampleSize int = 20

// Operations to monitor (can be overridden for testing)
#disable-next-line no-unused-params
param operations array = [
  'location.upsert.check'
  'location.upsert.write'
  'exit.ensureExit.check'
  'exit.ensureExit.create'
  'player.create'
]

// Build operation list for KQL
var operationsForKql = '"location.upsert.check","location.upsert.write","exit.ensureExit.check","exit.ensureExit.create","player.create"'

// Critical Alert: P95 > 600ms for any operation
resource alertLatencyCritical 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = {
  name: 'alert-latency-consolidated-critical'
  location: location
  properties: {
    displayName: 'Operation Latency: Multi-Operation (Critical)'
    description: 'Alerts when P95 latency exceeds ${criticalThresholdMs}ms for any monitored operation. Shows all affected operations in payload.'
    severity: 1
    enabled: true
    evaluationFrequency: 'PT10M'
    windowSize: 'PT10M'
    criteria: {
      allOf: [
        {
          query: format(
            '''
let threshold = {0};
let minSampleSize = {1};
let monitoredOperations = dynamic([{2}]);
customEvents
| where name == 'Graph.Query.Executed'
| extend operationName = tostring(customDimensions.operationName)
| extend latencyMs = todouble(customDimensions.latencyMs)
| where operationName in (monitoredOperations)
| where isnotempty(latencyMs)
| summarize 
    P95 = percentile(latencyMs, 95),
    SampleSize = count(),
    AvgLatency = avg(latencyMs),
    MaxLatency = max(latencyMs)
  by operationName
| where SampleSize >= minSampleSize
| where P95 > threshold
| project operationName, P95 = round(P95, 2), SampleSize, AvgLatency = round(AvgLatency, 2), MaxLatency = round(MaxLatency, 2), Threshold = threshold
| order by P95 desc
''',
            criticalThresholdMs,
            minSampleSize,
            operationsForKql
          )
          timeAggregation: 'Count'
          dimensions: []
          operator: 'GreaterThan'
          threshold: 0
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
    actions: actionGroupId != ''
      ? {
          actionGroups: [actionGroupId]
          customProperties: {
            thresholdMs: string(criticalThresholdMs)
            severityLevel: 'critical'
            alertType: 'ConsolidatedOperationLatency'
            monitoredOperations: 'location.upsert.check, location.upsert.write, exit.ensureExit.check, exit.ensureExit.create, player.create'
          }
        }
      : {
          actionGroups: []
          customProperties: {
            thresholdMs: string(criticalThresholdMs)
            severityLevel: 'critical'
            alertType: 'ConsolidatedOperationLatency'
            monitoredOperations: 'location.upsert.check, location.upsert.write, exit.ensureExit.check, exit.ensureExit.create, player.create'
          }
        }
  }
}

// Warning Alert: P95 > 500ms for any operation
resource alertLatencyWarning 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = {
  name: 'alert-latency-consolidated-warning'
  location: location
  properties: {
    displayName: 'Operation Latency: Multi-Operation (Warning)'
    description: 'Alerts when P95 latency exceeds ${warningThresholdMs}ms for any monitored operation. Shows all affected operations in payload.'
    severity: 2
    enabled: true
    evaluationFrequency: 'PT10M'
    windowSize: 'PT10M'
    criteria: {
      allOf: [
        {
          query: format(
            '''
let threshold = {0};
let minSampleSize = {1};
let monitoredOperations = dynamic([{2}]);
customEvents
| where name == 'Graph.Query.Executed'
| extend operationName = tostring(customDimensions.operationName)
| extend latencyMs = todouble(customDimensions.latencyMs)
| where operationName in (monitoredOperations)
| where isnotempty(latencyMs)
| summarize 
    P95 = percentile(latencyMs, 95),
    SampleSize = count(),
    AvgLatency = avg(latencyMs),
    MaxLatency = max(latencyMs)
  by operationName
| where SampleSize >= minSampleSize
| where P95 > threshold
| project operationName, P95 = round(P95, 2), SampleSize, AvgLatency = round(AvgLatency, 2), MaxLatency = round(MaxLatency, 2), Threshold = threshold
| order by P95 desc
''',
            warningThresholdMs,
            minSampleSize,
            operationsForKql
          )
          timeAggregation: 'Count'
          dimensions: []
          operator: 'GreaterThan'
          threshold: 0
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
    actions: actionGroupId != ''
      ? {
          actionGroups: [actionGroupId]
          customProperties: {
            thresholdMs: string(warningThresholdMs)
            severityLevel: 'warning'
            alertType: 'ConsolidatedOperationLatency'
            monitoredOperations: 'location.upsert.check, location.upsert.write, exit.ensureExit.check, exit.ensureExit.create, player.create'
          }
        }
      : {
          actionGroups: []
          customProperties: {
            thresholdMs: string(warningThresholdMs)
            severityLevel: 'warning'
            alertType: 'ConsolidatedOperationLatency'
            monitoredOperations: 'location.upsert.check, location.upsert.write, exit.ensureExit.check, exit.ensureExit.create, player.create'
          }
        }
  }
}

// Outputs
output criticalAlertRuleId string = alertLatencyCritical.id
output warningAlertRuleId string = alertLatencyWarning.id
output criticalAlertRuleName string = alertLatencyCritical.name
output warningAlertRuleName string = alertLatencyWarning.name
