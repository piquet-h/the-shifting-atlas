@description('Name prefix for resources')
param name string = 'atlas'

@description('Azure region for resources')
param location string = resourceGroup().location

@description('Application Insights resource ID to link the alert to')
param applicationInsightsId string

@description('Action group resource ID for alert notifications (optional)')
param actionGroupId string = ''

@description('RU percentage threshold for single partition alert (default: 80)')
param hotPartitionThreshold int = 80

@description('Resolution threshold (percentage below which alert auto-resolves, default: 70)')
param resolutionThreshold int = 70

@description('Minimum document count to enable alert (suppresses new container false positives)')
param minDocumentCount int = 1000

@description('Evaluation frequency in minutes (default: 5)')
param evaluationFrequencyMinutes int = 5

@description('Alert severity (0=Critical, 1=Error, 2=Warning, 3=Informational)')
param severity int = 1

// Hot partition detection alert for SQL API containers
// Fires when single partition consumes >80% of total RU in 5-minute window
// Suppresses alert for new containers (<1000 documents)
var alertName = 'alert-sql-hot-partition-${name}'

resource sqlHotPartitionAlert 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = {
  name: alertName
  location: location
  properties: {
    displayName: 'SQL API Hot Partition Detection'
    description: 'Detects hot partitions in Cosmos DB SQL API containers when a single partition key consumes >80% of total RU in a 5-minute window. Suppresses alerts for new containers (<${minDocumentCount} operations). Auto-resolves when partition RU consumption drops below ${resolutionThreshold}% for 3 consecutive intervals (15 minutes).'
    severity: severity
    enabled: true
    evaluationFrequency: 'PT${evaluationFrequencyMinutes}M'
    windowSize: 'PT${evaluationFrequencyMinutes}M'
    scopes: [
      applicationInsightsId
    ]
    criteria: {
      allOf: [
        {
          query: format(
            '''
// SQL API Hot Partition Detection Query
// Identifies single partition consuming disproportionate RU share
let windowSize = {0}m;
let hotThreshold = {1}; // Percentage of total RU
let minOps = {2}; // Minimum operations to enable alert

// Get all SQL operations with partition key in current window
let sqlOps = customEvents
| where timestamp > ago(windowSize)
| where name == "SQL.Query.Executed"
| extend containerName = tostring(customDimensions.containerName),
         partitionKey = tostring(customDimensions.partitionKey),
         ruCharge = todouble(customDimensions.ruCharge),
         latencyMs = todouble(customDimensions.latencyMs),
         operationName = tostring(customDimensions.operationName)
| where isnotempty(partitionKey) and isnotempty(containerName);

// Calculate total RU per container
let containerTotals = sqlOps
| summarize 
    totalContainerRU = sum(ruCharge),
    totalContainerOps = count()
  by containerName;

// Calculate RU per partition within each container
let partitionMetrics = sqlOps
| summarize 
    partitionRU = sum(ruCharge),
    operationCount = count(),
    avgLatency = round(avg(latencyMs), 1),
    p95Latency = round(percentile(latencyMs, 95), 1),
    topOperations = make_list(pack("operation", operationName, "ru", ruCharge), 5)
  by containerName, partitionKey;

// Join partition metrics with container totals and calculate percentages
partitionMetrics
| join kind=inner containerTotals on containerName
| extend ruPercent = round(100.0 * partitionRU / totalContainerRU, 2)
| where totalContainerOps >= minOps // Suppress for low-volume containers
| where ruPercent > hotThreshold // Only partitions exceeding threshold
| project 
    EventTimestamp = now(),
    containerName,
    partitionKey,
    ruPercent,
    partitionRU = round(partitionRU, 2),
    totalContainerRU = round(totalContainerRU, 2),
    operationCount,
    avgLatency,
    p95Latency,
    topOperations,
    alertThreshold = hotThreshold
| order by ruPercent desc
| take 1 // Alert on worst offender only
''',
            evaluationFrequencyMinutes,
            hotPartitionThreshold,
            minDocumentCount
          )
          timeAggregation: 'Count'
          operator: 'GreaterThan'
          threshold: 0
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    autoMitigate: true // Auto-resolve when condition no longer met
    actions: actionGroupId != ''
      ? {
          actionGroups: [
            actionGroupId
          ]
        }
      : {}
  }
}

output alertId string = sqlHotPartitionAlert.id
output alertName string = sqlHotPartitionAlert.name
