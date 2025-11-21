/**
 * Azure Monitor Alert Rule for Dual Persistence Feature Flag Toggle
 * 
 * Monitors FeatureFlag.Loaded events and alerts when DISABLE_GREMLIN_PLAYER_VERTEX flag is toggled.
 * This is an informational alert to track feature flag state changes during migration.
 * 
 * Issue: #529 (M2 Observability - Dual Persistence)
 * Related: ADR-002 (Dual Persistence Strategy), #519 (Gremlin Player Vertex Feature Flag)
 * Dependencies: #518 (Write-Through Logic), #519 (Feature Flag), #525 (Telemetry Events)
 * 
 * Telemetry Events:
 * - FeatureFlag.Loaded: Feature flag state loaded at startup (includes all flag values)
 * 
 * Alert Configuration:
 * - Informational (Severity 3): Flag state change detected
 * - Evaluation Frequency: Every 5 minutes
 * - Window Size: 5 minutes
 * - Purpose: Track migration phase transitions (not actionable)
 * 
 * Feature Flag Values (disableGremlinPlayerVertex property):
 * - 'false': Dual persistence mode - write to both Gremlin and SQL API (default)
 * - 'true': SQL-only mode - skip Gremlin player vertex writes (migration complete)
 * 
 * Notes:
 * - This alert is informational only, not actionable
 * - Helps correlate migration events with flag changes
 * - Expected to fire during deployment/restart when flag changes
 */

@description('Name prefix for resources')
param name string = 'atlas'

@description('Azure region for resources')
param location string = resourceGroup().location

@description('Application Insights resource ID for alert')
param applicationInsightsId string

@description('Action group ID for alert notifications (optional)')
param actionGroupId string = ''

@description('Enable alert rule')
param enabled bool = true

// Informational Alert: Feature flag toggled
resource alertFeatureFlagToggle 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = {
  name: 'alert-feature-flag-toggle-${name}'
  location: location
  properties: {
    displayName: 'Dual Persistence: Feature Flag Toggled (Informational)'
    description: 'Informational alert when DISABLE_GREMLIN_PLAYER_VERTEX feature flag is toggled. Indicates migration phase transition (dual-write ↔ SQL-only). Not actionable - used for correlation and tracking.'
    severity: 3 // Informational
    enabled: enabled
    evaluationFrequency: 'PT5M' // Evaluate every 5 minutes
    windowSize: 'PT5M' // Look back 5 minutes
    scopes: [
      applicationInsightsId
    ]
    criteria: {
      allOf: [
        {
          query: '''
// Detect feature flag state changes
customEvents
| where name == "FeatureFlag.Loaded"
| extend disableGremlinPlayerVertex = tostring(customDimensions.disableGremlinPlayerVertex)
| where isnotempty(disableGremlinPlayerVertex)
| summarize 
    FlagValues = make_set(disableGremlinPlayerVertex),
    LoadCount = count(),
    LatestTimestamp = max(timestamp)
| extend StateChanged = array_length(FlagValues) > 1
| where LoadCount > 0
| project 
    LoadCount,
    FlagValues = tostring(FlagValues),
    StateChanged,
    LatestTimestamp,
    Message = iff(StateChanged, "Feature flag toggled during window", "Feature flag loaded")
'''
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
            alertType: 'DualPersistence_FeatureFlagToggle'
            severityLevel: 'informational'
            actionable: 'false'
            purpose: 'Tracking migration phase transitions'
            adrReference: 'ADR-002'
            relatedIssues: '#519, #525, #529'
          }
        }
      : {
          actionGroups: []
          customProperties: {
            alertType: 'DualPersistence_FeatureFlagToggle'
            severityLevel: 'informational'
            actionable: 'false'
            purpose: 'Tracking migration phase transitions'
            adrReference: 'ADR-002'
            relatedIssues: '#519, #525, #529'
          }
        }
  }
}

// Outputs
output alertRuleId string = alertFeatureFlagToggle.id
output alertRuleName string = alertFeatureFlagToggle.name
