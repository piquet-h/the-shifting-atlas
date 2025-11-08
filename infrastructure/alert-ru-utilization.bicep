param name string
param location string
param applicationInsightsId string
param actionGroupId string = ''

@description('Provisioned RU/s throughput for the Gremlin graph (used to calculate RU percentage)')
param provisionedRuPerSecond int = 400

@description('Enable the alert rule')
param enabled bool = true

@description('Fire alert when RU percentage exceeds this threshold (sustained across consecutive windows)')
param fireRuPercentThreshold int = 70

@description('Auto-resolve alert when RU percentage drops below this threshold')
param resolveRuPercentThreshold int = 65

@description('Number of consecutive windows above fire threshold required to trigger alert')
param consecutiveFireWindows int = 3

@description('Number of consecutive windows below resolve threshold required to auto-resolve')
param consecutiveResolveWindows int = 2

@description('Minimum data quality percentage (events with RU data / total events)')
param minDataQualityPercent int = 70

// Calculate maximum RU per 5-minute interval (300 seconds) as a variable
#disable-next-line no-unused-vars
var maxRuPerInterval = provisionedRuPerSecond * 300

// Scheduled query rule for sustained high RU utilization
resource alertRuUtilization 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = {
  name: 'alert-ru-utilization-${name}'
  location: location
  properties: {
    displayName: 'Sustained High RU Utilization'
    description: 'Alert fires when RU utilization exceeds 70%. Auto-resolves when RU% drops below 65%. References ADR-002 partition pressure thresholds.'
    enabled: enabled
    severity: 2 // Warning
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
// Step 1: Calculate RU consumption per 5-minute bucket
let timeRange = 15m; // Time window for analysis
let bucketSize = 5m;
let maxRuPerInterval = {0};
let highThreshold = {1}.0; // Fire alert at >{1}% RU
let resolveThreshold = {2}.0; // Auto-resolve at <{2}% RU
let minDataQuality = {3} / 100.0; // Require {3}% of samples to have ruCharge data
// Collect Graph.Query.Executed events with RU charge
let ruEvents = customEvents
  | where timestamp > ago(timeRange)
  | where name == 'Graph.Query.Executed'
  | extend operationName = tostring(customDimensions.operationName),
           ruCharge = todouble(customDimensions.ruCharge)
  | where isnotempty(operationName);
// Calculate data quality (percentage of events with RU data)
let totalEvents = toscalar(ruEvents | count);
let eventsWithRu = toscalar(ruEvents | where isnotnull(ruCharge) | count);
let dataQuality = iff(totalEvents > 0, todouble(eventsWithRu) / todouble(totalEvents), 0.0);
// Abort evaluation if data quality is insufficient (<70%)
let shouldAbort = dataQuality < minDataQuality;
// If aborting, emit diagnostic event (return empty result set to prevent alert firing)
let diagnosticResult = datatable(Timestamp:datetime, RUPercent:real, Interval:int, TopOperations:string, DataQuality:real, Status:string) [
  now(), 0.0, 0, '', dataQuality, 'insufficient-data'
];
// Calculate RU percentage per bucket
let ruByBucket = ruEvents
  | where isnotnull(ruCharge)
  | summarize TotalRU = sum(ruCharge), 
              TopOps = make_list(pack('op', operationName, 'ru', ruCharge), 100)
    by bucket = bin(timestamp, bucketSize)
  | extend RUPercent = round(100.0 * TotalRU / maxRuPerInterval, 2)
  | project bucket, RUPercent, TopOps, TotalRU;
// Get the three most recent buckets and check for sustained pressure
let recentBuckets = ruByBucket
  | top 3 by bucket desc
  | serialize interval = row_number();
// Check if all 3 recent intervals exceed high threshold
let sustainedHigh = recentBuckets
  | where RUPercent > highThreshold
  | count;
// Check if last 2 intervals are below resolve threshold (for auto-resolve)
let recentResolved = recentBuckets
  | where interval <= {6}
  | where RUPercent < resolveThreshold
  | count;
// Extract top 3 operations by RU consumption across all buckets
let topOperations = ruEvents
  | where isnotnull(ruCharge)
  | summarize TotalRU = sum(ruCharge) by operationName
  | top 3 by TotalRU desc
  | project operationName, TotalRU = round(TotalRU, 2)
  | summarize TopOps = make_list(pack('op', operationName, 'ru', TotalRU));
// Final result: Fire alert if sustained high (3 intervals >70%)
// Auto-resolve if recent 2 intervals <65%
// Abort if data quality insufficient
let alertCondition = iff(shouldAbort, 
  diagnosticResult,
  recentBuckets
  | summarize 
      LatestTimestamp = max(bucket),
      MaxRUPercent = max(RUPercent),
      SustainedHighCount = toscalar(sustainedHigh),
      ResolvedCount = toscalar(recentResolved),
      TopOps = toscalar(topOperations | project TopOps)
  | extend Status = case(
      SustainedHighCount >= {5}, 'alert', // Fire alert
      ResolvedCount >= {6}, 'resolved', // Auto-resolve
      'normal' // No action
    )
  | project Timestamp = LatestTimestamp, RUPercent = MaxRUPercent, 
           Interval = SustainedHighCount, TopOperations = tostring(TopOps), 
           DataQuality = dataQuality, Status
);
// Return rows only when alert should fire (Status = 'alert')
alertCondition
| where Status == 'alert'
| project Timestamp, RUPercent, Interval, TopOperations, DataQuality
''',
            maxRuPerInterval,
            fireRuPercentThreshold,
            resolveRuPercentThreshold,
            minDataQualityPercent,
            consecutiveFireWindows,
            consecutiveResolveWindows
          )
          timeAggregation: 'Count'
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
    actions: empty(actionGroupId)
      ? {}
      : {
          actionGroups: [
            actionGroupId
          ]
          customProperties: {
            alert_type: 'ru_utilization'
            fireThreshold: '${fireRuPercentThreshold}%'
            resolveThreshold: '${resolveRuPercentThreshold}%'
            consecutiveFireWindows: string(consecutiveFireWindows)
            consecutiveResolveWindows: string(consecutiveResolveWindows)
            minDataQuality: '${minDataQualityPercent}%'
            adr_reference: 'ADR-002'
          }
        }
  }
}

output alertRuleId string = alertRuUtilization.id
output alertRuleName string = alertRuUtilization.name
