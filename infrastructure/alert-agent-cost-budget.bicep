@description('Name prefix for resources')
param name string = 'atlas'

@description('Azure region for resources')
param location string = resourceGroup().location

@description('Application Insights resource ID for alert')
param applicationInsightsId string

@description('Action group ID for alert notifications (optional)')
param actionGroupId string = ''

@description('Number of individual agent steps exceeding the cost budget within the evaluation window that triggers the alert')
param breachCountThreshold int = 1

@description('Alert evaluation frequency in minutes')
param evaluationFrequencyMinutes int = 5

@description('Alert severity (0=Critical, 1=Error, 2=Warning, 3=Informational)')
param severity int = 2

// Alert naming
var alertName = 'agent-cost-budget-${name}'
var alertDisplayName = 'Agent Step Cost Budget Exceeded'
var alertDescription = 'Fires when one or more agent steps exceed the per-step cost budget (AGENT_STEP_COST_BUDGET_MICROS, default $0.01). Indicates an agent workload is burning LLM tokens beyond the configured threshold. Check the agent-sandbox workbook Cost & Budget section for per-agent-type breakdown and triage the agent decision logic or raise the budget threshold.'

resource agentCostBudgetAlert 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = {
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
customEvents
| where timestamp > ago({0}m)
| where name == 'Agent.Step.CostExceeded'
| summarize BreachCount = count()
| where BreachCount >= {1}
''',
            evaluationFrequencyMinutes,
            breachCountThreshold
          )
          timeAggregation: 'Count'
          operator: 'GreaterThanOrEqual'
          threshold: 1
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: actionGroupId != '' ? {
      actionGroups: [
        actionGroupId
      ]
    } : {}
    autoMitigate: true
  }
}
