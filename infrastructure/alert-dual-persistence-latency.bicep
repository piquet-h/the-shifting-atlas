/**
 * Azure Monitor Alert Rules for Dual Persistence Write-Through Latency
 * 
 * Monitors write-through synchronization latency between Gremlin and SQL API.
 * Fires alerts when P95 latency exceeds acceptable thresholds.
 * 
 * Issue: #529 (M2 Observability - Dual Persistence)
 * Related: ADR-002 (Dual Persistence Strategy)
 * Dependencies: #518 (Write-Through Logic), #519 (Feature Flag), #525 (Telemetry Events)
 * 
 * Telemetry Events:
 * - Player.WriteThrough.Success: Write-through to SQL API succeeded (includes latencyMs)
 * - Player.WriteThrough.Failed: Write-through to SQL API failed
 * 
 * Alert Configuration:
 * - Warning (Severity 2): P95 >500ms over 10 minutes
 * - Critical (Severity 1): P95 >1000ms over 5 minutes
 * - Auto-Mitigation: Enabled
 * - Minimum Sample Size: 20 write-through operations per window
 * 
 * Remediation Steps (included in alert description):
 * 1. Check SQL API metrics (latency, throttling, availability)
 * 2. Review SQL container RU utilization
 * 3. Check for SQL API throttling (429 responses)
 * 4. Verify network latency between Function App and SQL API
 * 5. Review Application Insights for slow write-through operations
 */

@description('Name prefix for resources')
param name string = 'atlas'

@description('Azure region for resources')
param location string = resourceGroup().location

@description('Application Insights resource ID for alert')
param applicationInsightsId string

@description('Action group ID for alert notifications (optional)')
param actionGroupId string = ''

@description('Warning threshold: P95 latency in milliseconds')
param warningLatencyMs int = 500

@description('Critical threshold: P95 latency in milliseconds')
param criticalLatencyMs int = 1000

@description('Minimum sample size required to trigger alert')
param minSampleSize int = 20

@description('Enable alert rules')
param enabled bool = true

// Remediation guidance for alert notifications
var remediationSteps = '''
Remediation Steps:
1. Check SQL API metrics: Azure Portal → Cosmos DB SQL Account → Metrics (Server Side Latency, Request Rate)
2. Review SQL container RU utilization: Check if container is approaching serverless limits
3. Check for SQL API throttling: Query for HTTP 429 responses in Application Insights
4. Verify network latency: Test connectivity between Function App and SQL API endpoint
5. Review slow operations: Query Application Insights for write-through operations with high latencyMs
6. Consider scaling: Evaluate if serverless SQL API needs optimization or manual throughput provisioning
'''

// Warning Alert: Write-through P95 latency >500ms over 10 minutes
resource alertWriteThroughLatencyWarning 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = {
  name: 'alert-writethrough-latency-warning-${name}'
  location: location
  properties: {
    displayName: 'Dual Persistence: Write-Through Latency (Warning)'
    description: 'Alerts when write-through P95 latency exceeds ${warningLatencyMs}ms over 10 minutes. ${remediationSteps}'
    severity: 2 // Warning
    enabled: enabled
    evaluationFrequency: 'PT5M' // Evaluate every 5 minutes
    windowSize: 'PT10M' // Look back 10 minutes
    scopes: [
      applicationInsightsId
    ]
    criteria: {
      allOf: [
        {
          query: format(
            '''
let latencyThreshold = {0};
let minSamples = {1};
customEvents
| where name == "Player.WriteThrough.Success"
| where isnotnull(customDimensions.latencyMs)
| extend latencyMs = todouble(customDimensions.latencyMs)
| summarize 
    P95 = percentile(latencyMs, 95),
    SampleSize = count(),
    AvgLatency = avg(latencyMs),
    MaxLatency = max(latencyMs),
    SlowOperations = countif(latencyMs > latencyThreshold)
| where SampleSize >= minSamples
| where P95 > latencyThreshold
| project 
    P95 = round(P95, 2),
    SampleSize,
    AvgLatency = round(AvgLatency, 2),
    MaxLatency = round(MaxLatency, 2),
    SlowOperations,
    Threshold = latencyThreshold
''',
            warningLatencyMs,
            minSampleSize
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
    actions: actionGroupId != ''
      ? {
          actionGroups: [actionGroupId]
          customProperties: {
            alertType: 'DualPersistence_WriteThroughLatency'
            severityLevel: 'warning'
            thresholdMs: string(warningLatencyMs)
            windowSize: '10 minutes'
            adrReference: 'ADR-002'
            relatedIssues: '#518, #519, #525, #529'
          }
        }
      : {
          actionGroups: []
          customProperties: {
            alertType: 'DualPersistence_WriteThroughLatency'
            severityLevel: 'warning'
            thresholdMs: string(warningLatencyMs)
            windowSize: '10 minutes'
            adrReference: 'ADR-002'
            relatedIssues: '#518, #519, #525, #529'
          }
        }
  }
}

// Critical Alert: Write-through P95 latency >1000ms over 5 minutes
resource alertWriteThroughLatencyCritical 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = {
  name: 'alert-writethrough-latency-critical-${name}'
  location: location
  properties: {
    displayName: 'Dual Persistence: Write-Through Latency (Critical)'
    description: 'Alerts when write-through P95 latency exceeds ${criticalLatencyMs}ms over 5 minutes. ${remediationSteps}'
    severity: 1 // Critical
    enabled: enabled
    evaluationFrequency: 'PT5M' // Evaluate every 5 minutes
    windowSize: 'PT5M' // Look back 5 minutes
    scopes: [
      applicationInsightsId
    ]
    criteria: {
      allOf: [
        {
          query: format(
            '''
let latencyThreshold = {0};
let minSamples = {1};
customEvents
| where name == "Player.WriteThrough.Success"
| where isnotnull(customDimensions.latencyMs)
| extend latencyMs = todouble(customDimensions.latencyMs)
| summarize 
    P95 = percentile(latencyMs, 95),
    SampleSize = count(),
    AvgLatency = avg(latencyMs),
    MaxLatency = max(latencyMs),
    SlowOperations = countif(latencyMs > latencyThreshold)
| where SampleSize >= minSamples
| where P95 > latencyThreshold
| project 
    P95 = round(P95, 2),
    SampleSize,
    AvgLatency = round(AvgLatency, 2),
    MaxLatency = round(MaxLatency, 2),
    SlowOperations,
    Threshold = latencyThreshold
''',
            criticalLatencyMs,
            minSampleSize
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
    actions: actionGroupId != ''
      ? {
          actionGroups: [actionGroupId]
          customProperties: {
            alertType: 'DualPersistence_WriteThroughLatency'
            severityLevel: 'critical'
            thresholdMs: string(criticalLatencyMs)
            windowSize: '5 minutes'
            adrReference: 'ADR-002'
            relatedIssues: '#518, #519, #525, #529'
          }
        }
      : {
          actionGroups: []
          customProperties: {
            alertType: 'DualPersistence_WriteThroughLatency'
            severityLevel: 'critical'
            thresholdMs: string(criticalLatencyMs)
            windowSize: '5 minutes'
            adrReference: 'ADR-002'
            relatedIssues: '#518, #519, #525, #529'
          }
        }
  }
}

// Outputs
output warningAlertRuleId string = alertWriteThroughLatencyWarning.id
output criticalAlertRuleId string = alertWriteThroughLatencyCritical.id
output warningAlertRuleName string = alertWriteThroughLatencyWarning.name
output criticalAlertRuleName string = alertWriteThroughLatencyCritical.name
