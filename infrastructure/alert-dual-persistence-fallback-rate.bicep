/**
 * Azure Monitor Alert Rule for Dual Persistence Gremlin Fallback Rate
 * 
 * Monitors Player.Get operations and alerts when Gremlin fallback rate is excessive.
 * After migration stabilizes, high fallback rate indicates SQL API availability issues.
 * 
 * Issue: #529 (M2 Observability - Dual Persistence)
 * Related: ADR-002 (Dual Persistence Strategy)
 * Dependencies: #518 (Write-Through Logic), #519 (Feature Flag), #525 (Telemetry Events)
 * 
 * Telemetry Events:
 * - Player.Get.SourceSql: Player data read from SQL API (primary source)
 * - Player.Get.SourceGremlinFallback: Player data read from Gremlin (fallback when SQL unavailable)
 * 
 * Alert Configuration:
 * - Warning (Severity 2): >20% fallback rate over 1 hour
 * - Minimum Sample Size: 50 Player.Get operations per window
 * - Expected: Fallback rate should be near 0% after migration period
 * 
 * Edge Cases:
 * - Early migration: High fallback rate is expected (consider time-based suppression)
 * - Low player traffic: May not trigger alert thresholds (minSampleSize mitigates this)
 * 
 * Remediation Steps (included in alert description):
 * 1. Check SQL API health and availability metrics
 * 2. Verify SQL container health and provisioning
 * 3. Review Application Insights for SQL API errors
 * 4. Check for network connectivity issues to SQL API
 * 5. Verify migration completion status
 */

@description('Name prefix for resources')
param name string = 'atlas'

@description('Azure region for resources')
param location string = resourceGroup().location

@description('Application Insights resource ID for alert')
param applicationInsightsId string

@description('Action group ID for alert notifications (optional)')
param actionGroupId string = ''

@description('Fallback rate threshold percentage (after migration stable)')
param fallbackThresholdPercent int = 20

@description('Minimum sample size required to trigger alert')
param minSampleSize int = 50

@description('Enable alert rule')
param enabled bool = true

// Remediation guidance for alert notifications
var remediationSteps = '''
Remediation Steps:
1. Check SQL API health: Azure Portal → Cosmos DB SQL Account → Metrics (Availability, Request Rate)
2. Verify SQL container health: Ensure 'players' container is accessible and not throttled
3. Review Application Insights: Query for SQL API errors and timeout exceptions
4. Check network connectivity: Verify Function App can reach SQL API endpoint
5. Verify migration completion: Confirm all players have been migrated to SQL API
6. Consider migration period: High fallback rate is expected during initial migration phase
'''

// Warning Alert: Gremlin fallback rate >20% over 1 hour (after migration stable)
resource alertFallbackRate 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = {
  name: 'alert-fallback-rate-${name}'
  location: location
  properties: {
    displayName: 'Dual Persistence: Excessive Gremlin Fallback Rate'
    description: 'Alerts when Player.Get operations fall back to Gremlin >${fallbackThresholdPercent}% over 1 hour. Indicates SQL API availability issues after migration stable. ${remediationSteps}'
    severity: 2 // Warning
    enabled: enabled
    evaluationFrequency: 'PT15M' // Evaluate every 15 minutes
    windowSize: 'PT1H' // Look back 1 hour
    scopes: [
      applicationInsightsId
    ]
    criteria: {
      allOf: [
        {
          query: format(
            '''
let fallbackThreshold = {0};
let minSamples = {1};
// Count Player.Get operations by source
let sqlReads = customEvents
  | where name == "Player.Get.SourceSql"
  | count;
let gremlinFallbacks = customEvents
  | where name == "Player.Get.SourceGremlinFallback"
  | count;
// Calculate fallback rate
let totalReads = toscalar(sqlReads) + toscalar(gremlinFallbacks);
let fallbackCount = toscalar(gremlinFallbacks);
// Alert if fallback rate exceeds threshold and we have sufficient samples
datatable(Total: long, FallbackCount: long) [
  totalReads, fallbackCount
]
| extend FallbackRate = iff(Total > 0, (FallbackCount * 100.0) / Total, 0.0)
| where Total >= minSamples
| where FallbackRate > fallbackThreshold
| project 
    Total,
    SqlReads = Total - FallbackCount,
    GremlinFallbacks = FallbackCount,
    FallbackRate = round(FallbackRate, 2),
    Threshold = fallbackThreshold
''',
            fallbackThresholdPercent,
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
            alertType: 'DualPersistence_FallbackRate'
            severityLevel: 'warning'
            thresholdPercent: string(fallbackThresholdPercent)
            windowSize: '1 hour'
            adrReference: 'ADR-002'
            relatedIssues: '#518, #519, #525, #529'
            note: 'High fallback rate expected during migration period'
          }
        }
      : {
          actionGroups: []
          customProperties: {
            alertType: 'DualPersistence_FallbackRate'
            severityLevel: 'warning'
            thresholdPercent: string(fallbackThresholdPercent)
            windowSize: '1 hour'
            adrReference: 'ADR-002'
            relatedIssues: '#518, #519, #525, #529'
            note: 'High fallback rate expected during migration period'
          }
        }
  }
}

// Outputs
output alertRuleId string = alertFallbackRate.id
output alertRuleName string = alertFallbackRate.name
output fallbackThresholdConfigured int = fallbackThresholdPercent
