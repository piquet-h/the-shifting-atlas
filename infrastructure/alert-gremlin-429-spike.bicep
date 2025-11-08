@description('Name prefix for resources')
param name string = 'atlas'

@description('Azure region for resources')
param location string = resourceGroup().location

@description('Application Insights resource ID for alert')
param applicationInsightsId string

@description('Action group ID for alert notifications (optional)')
param actionGroupId string = ''

@description('Expected baseline RPS for Gremlin queries (set to 0 to suppress alert)')
param baselineRps int = 50

@description('Alert evaluation frequency in minutes')
param evaluationFrequencyMinutes int = 5

@description('Alert severity (0=Critical, 1=Error, 2=Warning, 3=Informational)')
param severity int = 2

@description('Normal severity threshold: minimum 429 count to trigger normal alert')
param normalThreshold429Count int = 5

@description('High severity threshold: minimum 429 count to trigger high severity alert')
param highThreshold429Count int = 10

// Alert naming
var alertName = 'gremlin-429-spike-${name}'
var alertDisplayName = 'Gremlin 429 Throttling Spike Detection'
var alertDescription = 'Detects abnormal Cosmos DB Gremlin throttling (HTTP 429) below expected RPS baseline, correlating with ADR-002 partition saturation thresholds.'

// Create scheduled query rule for 429 spike detection
resource alert 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = if (baselineRps > 0) {
  name: alertName
  location: location
  properties: {
    displayName: alertDisplayName
    description: alertDescription
    severity: severity
    enabled: true
    evaluationFrequency: 'PT${evaluationFrequencyMinutes}M'
    windowSize: 'PT${evaluationFrequencyMinutes}M'
    scopes: [
      applicationInsightsId
    ]
    targetResourceTypes: [
      'Microsoft.Insights/components'
    ]
    criteria: {
      allOf: [
        {
          query: format(
            '''
let evaluationWindow = {0}m;
let baselineRps = {1};
let normalThreshold = {2};
let highThreshold = {3};
// Count 429 failures in the evaluation window
let throttleCount = customEvents
| where timestamp > ago(evaluationWindow)
| where name == "Graph.Query.Failed"
| where customDimensions.httpStatusCode == "429"
| summarize Count429 = count();
// Count total Graph.Query.Executed calls to verify we're below baseline
let totalQueries = customEvents
| where timestamp > ago(evaluationWindow)
| where name == "Graph.Query.Executed"
| summarize TotalQueries = count();
// Get RU% and P95 latency for context (last window)
let metrics = customEvents
| where timestamp > ago(evaluationWindow)
| where name == "Graph.Query.Executed"
| extend ruCharge = todouble(customDimensions.ruCharge)
| extend latencyMs = todouble(customDimensions.latencyMs)
| summarize 
    AvgRU = avg(ruCharge),
    P95Latency = percentile(latencyMs, 95),
    TotalRU = sum(ruCharge);
// Combine results and apply alert logic
throttleCount
| extend TotalQueries = toscalar(totalQueries | project TotalQueries)
| extend AvgRU = toscalar(metrics | project AvgRU)
| extend P95Latency = toscalar(metrics | project P95Latency)
| extend TotalRU = toscalar(metrics | project TotalRU)
| extend ExpectedQueries = baselineRps * {0} * 60
| extend BelowBaseline = TotalQueries < ExpectedQueries
| extend AlertSeverity = case(
    Count429 >= highThreshold and BelowBaseline, "High",
    Count429 >= normalThreshold and BelowBaseline, "Normal",
    "None"
)
| where AlertSeverity != "None" and baselineRps > 0
| project 
    Count429,
    TotalQueries,
    ExpectedQueries,
    BelowBaseline,
    AlertSeverity,
    AvgRU,
    P95Latency,
    TotalRU
''',
            evaluationFrequencyMinutes,
            baselineRps,
            normalThreshold429Count,
            highThreshold429Count
          )
          timeAggregation: 'Count'
          dimensions: [
            {
              name: 'AlertSeverity'
              operator: 'Include'
              values: [
                '*'
              ]
            }
          ]
          operator: 'GreaterThanOrEqual'
          threshold: 1
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    autoMitigate: true
    checkWorkspaceAlertsStorageConfigured: false
    skipQueryValidation: false
    actions: {
      actionGroups: actionGroupId != '' ? [actionGroupId] : []
      customProperties: {
        baselineRps: string(baselineRps)
        normalThreshold: string(normalThreshold429Count)
        highThreshold: string(highThreshold429Count)
        adrReference: 'ADR-002'
        documentationUrl: 'https://github.com/piquet-h/the-shifting-atlas/blob/main/docs/observability/telemetry-catalog.md#graphqueryfailed'
      }
    }
  }
  tags: {
    M2_Observability: 'true'
    Alert_Type: 'Throttling'
    Service: 'Cosmos-Gremlin'
  }
}

output alertId string = baselineRps > 0 ? alert.id : ''
output alertName string = baselineRps > 0 ? alert.name : ''
output baselineRpsConfigured int = baselineRps
output alertEnabled bool = baselineRps > 0
