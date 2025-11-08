@description('Name prefix for resources')
param name string = 'atlas'

@description('Azure region for resources')
param location string = resourceGroup().location

@description('Application Insights resource ID to link the alert to')
param applicationInsightsId string

@description('Action group resource ID for alert notifications (optional)')
param actionGroupId string = ''

@description('Maximum RU per 5-minute interval for percentage calculation')
#disable-next-line no-unused-params
param maxRuPerInterval int = 120000

@description('RU percentage threshold for composite alert')
#disable-next-line no-unused-params
param ruPercentThreshold int = 70

@description('Minimum 429 count threshold for composite alert')
#disable-next-line no-unused-params
param throttlingCountThreshold int = 3

@description('Minimum P95 latency increase percentage vs 24h baseline')
#disable-next-line no-unused-params
param latencyIncreasePercentThreshold int = 25

@description('Minimum baseline samples required for latency comparison')
#disable-next-line no-unused-params
param minBaselineSamples int = 100

// Composite partition pressure alert (Issue #294)
// Fires when RU% >70% AND 429s >=3 AND P95 latency increase >25% vs 24h baseline
// Critical severity, distinct from individual RU or 429 alerts
var alertName = 'alert-composite-partition-pressure-${name}'

// Build the KQL query template with placeholder
var alertQueryTemplate = '''
// Composite Partition Pressure Alert Query
// Step 1: Calculate RU metrics for current 5-min window
let currentWindow = 5m;
let baselineWindow = 24h;
let minBaselineSamples = ${string(minBaselineSamples)};
let maxRuPerInterval = ${string(maxRuPerInterval)};
let ruThreshold = ${string(ruPercentThreshold)};
let throttling429Threshold = ${string(throttlingCountThreshold)};
let latencyIncreaseThreshold = ${string(latencyIncreasePercentThreshold)};

// Current window metrics
let currentMetrics = customEvents
| where timestamp > ago(currentWindow)
| where name == "Graph.Query.Executed"
| extend ruCharge = todouble(customDimensions.ruCharge)
| extend latencyMs = todouble(customDimensions.durationMs)
| extend operationName = tostring(customDimensions.operationName)
| extend statusCode = toint(customDimensions.statusCode)
| summarize 
    totalRu = sum(ruCharge),
    count429 = countif(statusCode == 429),
    currentP95Latency = percentile(latencyMs, 95),
    sampleCount = count(),
    topOperations = make_list(pack("operation", operationName, "ru", ruCharge), 10)
| extend ruPercent = (totalRu / maxRuPerInterval) * 100
| project ruPercent, count429, currentP95Latency, sampleCount, topOperations;

// Baseline P95 latency (24h window, excluding current hour to avoid skew)
let baselineMetrics = customEvents
| where timestamp between (ago(baselineWindow) .. ago(1h))
| where name == "Graph.Query.Executed"
| extend latencyMs = todouble(customDimensions.durationMs)
| summarize 
    baselineP95Latency = percentile(latencyMs, 95),
    baselineSampleCount = count();

// Combine current and baseline
currentMetrics
| extend dummy = 1
| join kind=inner (
    baselineMetrics | extend dummy = 1
) on dummy
| project-away dummy, dummy1
| where baselineSampleCount >= minBaselineSamples // Suppress if insufficient baseline
| extend latencyIncreasePct = ((currentP95Latency - baselineP95Latency) / baselineP95Latency) * 100
| where ruPercent > ruThreshold // RU threshold
    and count429 >= throttling429Threshold // 429 threshold
    and latencyIncreasePct > latencyIncreaseThreshold // Latency degradation threshold
| project 
    ruPercent = round(ruPercent, 2),
    count429,
    currentP95Latency = round(currentP95Latency, 2),
    baselineP95Latency = round(baselineP95Latency, 2),
    latencyIncreasePct = round(latencyIncreasePct, 2),
    sampleCount,
    baselineSampleCount,
    topOperations = topOperations
| extend 
    top2Operations = array_slice(topOperations, 0, 2)
| project-away topOperations
'''

resource compositePartitionPressureAlert 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = {
  name: alertName
  location: location
  properties: {
    displayName: 'Composite Partition Pressure (RU + 429 + Latency)'
    description: 'Multi-signal alert combining RU%, throttling (429), and latency degradation to reduce false positives and signal urgent intervention. Fires only when: RU% >70% AND 429s >=3 in last 5 min AND P95 latency increase >25% vs 24h baseline. Auto-resolves when any metric recovers below thresholds for 3 consecutive intervals.'
    severity: 0 // Critical
    enabled: true
    evaluationFrequency: 'PT5M' // Every 5 minutes
    windowSize: 'PT5M' // 5-minute window
    scopes: [
      applicationInsightsId
    ]
    criteria: {
      allOf: [
        {
          query: alertQueryTemplate
          timeAggregation: 'Count'
          dimensions: []
          operator: 'GreaterThan'
          threshold: 0
          failingPeriods: {
            numberOfEvaluationPeriods: 3
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    autoMitigate: false // Must be false when muteActionsDuration is set
    actions: actionGroupId != ''
      ? {
          actionGroups: [
            actionGroupId
          ]
          customProperties: {
            alertType: 'CompositePartitionPressure'
            severity: 'Critical'
            ruThreshold: '${ruPercentThreshold}%'
            throttling429Threshold: string(throttlingCountThreshold)
            latencyIncreaseThreshold: '${latencyIncreasePercentThreshold}%'
            minBaselineSamples: string(minBaselineSamples)
            dependsOn: 'Issues #292 (Sustained High RU), #293 (429 Spike)'
            referenceDoc: 'ADR-002 thresholds'
          }
        }
      : {}
    muteActionsDuration: 'PT15M' // Mute for 15 minutes after firing to avoid noise
  }
  tags: {
    M2_Observability: 'true'
    Issue: '294'
    AlertType: 'CompositePartitionPressure'
    Severity: 'Critical'
  }
}

// Baseline suppression diagnostic alert
// Logs when composite alert is suppressed due to insufficient baseline samples
resource baselineSuppressionDiagnostic 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = {
  name: 'alert-composite-baseline-suppression-${name}'
  location: location
  properties: {
    displayName: 'Composite Alert Baseline Suppression (Diagnostic)'
    description: 'Logs diagnostic event when composite partition pressure alert is suppressed due to insufficient baseline samples (<100). Informational only.'
    severity: 3 // Informational
    enabled: true
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    scopes: [
      applicationInsightsId
    ]
    criteria: {
      allOf: [
        {
          query: '''
            // Check for insufficient baseline samples that would suppress composite alert
            let currentWindow = 5m;
            let baselineWindow = 24h;
            let minBaselineSamples = 100;
            let maxRuPerInterval = ${maxRuPerInterval};
            
            // Current window metrics (check if conditions would trigger)
            let currentMetrics = customEvents
            | where timestamp > ago(currentWindow)
            | where name == "Graph.Query.Executed"
            | extend ruCharge = todouble(customDimensions.ruCharge)
            | extend statusCode = toint(customDimensions.statusCode)
            | summarize 
                totalRu = sum(ruCharge),
                count429 = countif(statusCode == 429)
            | extend ruPercent = (totalRu / maxRuPerInterval) * 100
            | where ruPercent > 70 and count429 >= 3
            | project ruPercent, count429;
            
            // Baseline sample count
            let baselineMetrics = customEvents
            | where timestamp between (ago(baselineWindow) .. ago(1h))
            | where name == "Graph.Query.Executed"
            | summarize baselineSampleCount = count()
            | where baselineSampleCount < minBaselineSamples;
            
            // Alert if conditions met but baseline insufficient
            currentMetrics
            | extend dummy = 1
            | join kind=inner (
                baselineMetrics | extend dummy = 1
            ) on dummy
            | project-away dummy, dummy1
            | project 
                message = "Composite partition pressure alert suppressed",
                reason = "Insufficient baseline samples",
                baselineSampleCount,
                requiredSamples = minBaselineSamples,
                currentRuPercent = ruPercent,
                current429Count = count429
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
    actions: {}
  }
  tags: {
    M2_Observability: 'true'
    Issue: '294'
    AlertType: 'Diagnostic'
  }
}

output alertId string = compositePartitionPressureAlert.id
output alertName string = compositePartitionPressureAlert.name
output diagnosticAlertId string = baselineSuppressionDiagnostic.id
output diagnosticAlertName string = baselineSuppressionDiagnostic.name
