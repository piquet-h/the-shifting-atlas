/**
 * Azure Monitor Alert Rules for Dual Persistence Migration Failures
 * 
 * Monitors player data migration from Gremlin to SQL API (ADR-002).
 * Fires alerts when migration failure rate exceeds acceptable thresholds.
 * 
 * Issue: #529 (M2 Observability - Dual Persistence)
 * Related: ADR-002 (Dual Persistence Strategy)
 * Dependencies: #518 (Write-Through Logic), #519 (Feature Flag), #525 (Telemetry Events)
 * 
 * Telemetry Events:
 * - Player.Migrate.Success: Successful player data migration to SQL API
 * - Player.Migrate.Failed: Failed player data migration to SQL API
 * 
 * Alert Configuration:
 * - Warning (Severity 2): >5% failure rate over 15 minutes
 * - Critical (Severity 1): >10% failure rate over 5 minutes
 * - Auto-Mitigation: Enabled
 * - Minimum Sample Size: 10 migration attempts per window
 * 
 * Remediation Steps (included in alert description):
 * 1. Check SQL API health (portal metrics)
 * 2. Review Application Insights exceptions
 * 3. Verify SQL container provisioning
 * 4. Check for Gremlin→SQL schema mismatches
 * 5. Review migration script logs
 */

@description('Name prefix for resources')
param name string = 'atlas'

@description('Azure region for resources')
param location string = resourceGroup().location

@description('Application Insights resource ID for alert')
param applicationInsightsId string

@description('Action group ID for alert notifications (optional)')
param actionGroupId string = ''

@description('Warning threshold: migration failure percentage')
param warningFailurePercent int = 5

@description('Critical threshold: migration failure percentage')
param criticalFailurePercent int = 10

@description('Minimum sample size required to trigger alert (avoid false positives on low traffic)')
param minSampleSize int = 10

@description('Enable alert rules')
param enabled bool = true

// Remediation guidance for alert notifications
var remediationSteps = '''
Remediation Steps:
1. Check SQL API health: Azure Portal → Cosmos DB SQL Account → Metrics (Availability, Server Errors)
2. Review Application Insights exceptions: Query for 'Player.Migrate.Failed' events with exception details
3. Verify SQL container provisioning: Ensure 'players' container exists with partition key '/id'
4. Check for Gremlin→SQL schema mismatches: Compare player vertex properties with PlayerDoc schema
5. Review migration script logs: Check Function App logs for migration errors and retry attempts
'''

// Warning Alert: Migration failure rate >5% over 15 minutes
resource alertMigrationFailureWarning 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = {
  name: 'alert-migration-failure-warning-${name}'
  location: location
  properties: {
    displayName: 'Dual Persistence: Migration Failure Rate (Warning)'
    description: 'Alerts when player migration failure rate exceeds ${warningFailurePercent}% over 15 minutes. ${remediationSteps}'
    severity: 2 // Warning
    enabled: enabled
    evaluationFrequency: 'PT5M' // Evaluate every 5 minutes
    windowSize: 'PT15M' // Look back 15 minutes
    scopes: [
      applicationInsightsId
    ]
    criteria: {
      allOf: [
        {
          query: format(
            '''
let failureThreshold = {0};
let minSamples = {1};
customEvents
| where name in ("Player.Migrate.Success", "Player.Migrate.Failed")
| summarize 
    Total = count(),
    Failures = countif(name == "Player.Migrate.Failed"),
    FailedSamples = make_list_if(tostring(customDimensions), name == "Player.Migrate.Failed", 5)
| extend FailureRate = iff(Total > 0, (Failures * 100.0) / Total, 0.0)
| where Total >= minSamples
| where FailureRate > failureThreshold
| project 
    Total,
    Failures,
    FailureRate = round(FailureRate, 2),
    Threshold = failureThreshold,
    FailedSamples
''',
            warningFailurePercent,
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
            alertType: 'DualPersistence_MigrationFailure'
            severityLevel: 'warning'
            thresholdPercent: string(warningFailurePercent)
            windowSize: '15 minutes'
            adrReference: 'ADR-002'
            relatedIssues: '#518, #519, #525, #529'
          }
        }
      : {
          actionGroups: []
          customProperties: {
            alertType: 'DualPersistence_MigrationFailure'
            severityLevel: 'warning'
            thresholdPercent: string(warningFailurePercent)
            windowSize: '15 minutes'
            adrReference: 'ADR-002'
            relatedIssues: '#518, #519, #525, #529'
          }
        }
  }
}

// Critical Alert: Migration failure rate >10% over 5 minutes
resource alertMigrationFailureCritical 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = {
  name: 'alert-migration-failure-critical-${name}'
  location: location
  properties: {
    displayName: 'Dual Persistence: Migration Failure Rate (Critical)'
    description: 'Alerts when player migration failure rate exceeds ${criticalFailurePercent}% over 5 minutes. ${remediationSteps}'
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
let failureThreshold = {0};
let minSamples = {1};
customEvents
| where name in ("Player.Migrate.Success", "Player.Migrate.Failed")
| summarize 
    Total = count(),
    Failures = countif(name == "Player.Migrate.Failed"),
    FailedSamples = make_list_if(tostring(customDimensions), name == "Player.Migrate.Failed", 5)
| extend FailureRate = iff(Total > 0, (Failures * 100.0) / Total, 0.0)
| where Total >= minSamples
| where FailureRate > failureThreshold
| project 
    Total,
    Failures,
    FailureRate = round(FailureRate, 2),
    Threshold = failureThreshold,
    FailedSamples
''',
            criticalFailurePercent,
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
            alertType: 'DualPersistence_MigrationFailure'
            severityLevel: 'critical'
            thresholdPercent: string(criticalFailurePercent)
            windowSize: '5 minutes'
            adrReference: 'ADR-002'
            relatedIssues: '#518, #519, #525, #529'
          }
        }
      : {
          actionGroups: []
          customProperties: {
            alertType: 'DualPersistence_MigrationFailure'
            severityLevel: 'critical'
            thresholdPercent: string(criticalFailurePercent)
            windowSize: '5 minutes'
            adrReference: 'ADR-002'
            relatedIssues: '#518, #519, #525, #529'
          }
        }
  }
}

// Outputs
output warningAlertRuleId string = alertMigrationFailureWarning.id
output criticalAlertRuleId string = alertMigrationFailureCritical.id
output warningAlertRuleName string = alertMigrationFailureWarning.name
output criticalAlertRuleName string = alertMigrationFailureCritical.name
