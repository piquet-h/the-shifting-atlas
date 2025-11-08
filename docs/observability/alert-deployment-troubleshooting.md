# Alert Deployment Troubleshooting Guide

**Purpose**: Diagnose and resolve Azure Monitor scheduled query rule deployment failures for The Shifting Atlas observability alerts.

**Target Audience**: Infrastructure operators, DevOps engineers, and developers deploying alert modules.

---

## Quick Diagnosis Checklist

When an alert module deployment fails, check these common issues in order:

- [ ] **KQL Syntax**: Query compiles successfully in Azure Portal Log Analytics
- [ ] **String Interpolation**: All `${...}` placeholders resolved (no leftover template syntax)
- [ ] **Required Properties**: `failingPeriods` block present in `criteria.allOf[]`
- [ ] **Dimension Names**: Telemetry dimensions match query expectations (use `coalesce()` for variants)
- [ ] **Threshold Values**: Realistic values (e.g., `maxRuPerInterval` = 120000 for 400 RU/s, not 2000)
- [ ] **Resource Scopes**: Valid Application Insights resource ID provided
- [ ] **API Version**: Using `Microsoft.Insights/scheduledQueryRules@2023-03-15-preview` or later

---

## Common Failure Categories

### 1. KQL Query Syntax Errors

**Symptoms:**
- Deployment fails with `InvalidQuerySyntax` or `BadRequest` error
- Error message references specific line in KQL query

**Common Causes:**
- Missing semicolons after `let` statements
- Unresolved string interpolation placeholders (`${...}`)
- Invalid KQL operators or function names
- Mismatched parentheses or brackets

**Diagnosis:**
1. Extract the KQL query from the Bicep module
2. Navigate to Azure Portal → Log Analytics workspace → Logs
3. Paste query and manually substitute parameter values
4. Click "Run" to validate syntax

**Example Fix:**
```kql
// Before (broken interpolation):
let maxRuPerInterval = ${maxRuPerIntervalString};  // Variable not defined

// After (direct interpolation):
let maxRuPerInterval = ${maxRuPerInterval};  // Bicep variable interpolated directly
```

**Resolution Steps:**
1. Fix query syntax in Bicep module
2. Validate with `az bicep build --file <module>.bicep`
3. Test query manually in Portal with sample data
4. Redeploy infrastructure

---

### 2. Missing `failingPeriods` Block

**Symptoms:**
- Deployment fails with validation error about missing required property
- Error message references `criteria.allOf[].failingPeriods`

**Common Causes:**
- Scheduled query rule API requires `failingPeriods` since 2023-03-15-preview version
- Older alert examples or templates may omit this property

**Diagnosis:**
Check Bicep module for `failingPeriods` structure:

```bicep
criteria: {
  allOf: [
    {
      query: '...'
      timeAggregation: 'Count'
      operator: 'GreaterThan'
      threshold: 0
      failingPeriods: {  // ← Required block
        numberOfEvaluationPeriods: 1
        minFailingPeriodsToAlert: 1
      }
    }
  ]
}
```

**Resolution Steps:**
1. Add `failingPeriods` block to each `criteria.allOf[]` item
2. Set `numberOfEvaluationPeriods` and `minFailingPeriodsToAlert` appropriately
3. Redeploy infrastructure

---

### 3. Dimension Name Mismatches

**Symptoms:**
- Query deploys but never fires (or fires incorrectly)
- Metrics/dimensions in alert payload show null or unexpected values
- Division by zero errors in logs

**Common Causes:**
- Telemetry emits `latencyMs` but query expects `durationMs`
- Telemetry emits `statusCode` but query expects `httpStatusCode`
- Schema changes over time causing backward compatibility issues

**Diagnosis:**
1. Query Application Insights for recent events:
   ```kql
   customEvents
   | where name == "Graph.Query.Executed"
   | take 10
   | project customDimensions
   ```
2. Compare dimension names in results with query expectations

**Example Fix:**
```kql
// Before (assumes single dimension name):
| extend latencyMs = todouble(customDimensions.durationMs)

// After (handles both variants):
| extend latencyMs = todouble(coalesce(customDimensions.latencyMs, customDimensions.durationMs))
```

**Resolution Steps:**
1. Use `coalesce()` to handle dimension name variants
2. Update all queries in affected alert modules
3. Test queries manually in Portal to verify dimension extraction
4. Redeploy infrastructure

---

### 4. Unrealistic Parameter Values

**Symptoms:**
- Alert deploys successfully but never fires (or fires constantly)
- Calculated percentages are nonsensical (e.g., 6000% RU utilization)
- Alert payload shows extreme or unexpected values

**Common Causes:**
- `maxRuPerInterval` set too low (e.g., 2000 instead of 120000)
- Threshold percentages inverted (e.g., resolve threshold > fire threshold)
- Baseline sample requirements too high for actual traffic volume

**Diagnosis:**
1. Check parameter values in `main.bicep` module invocations
2. Calculate expected values:
   - `maxRuPerInterval` = `provisionedRuPerSecond` × 300 (5 minutes in seconds)
   - For 400 RU/s: 400 × 300 = 120,000 RU per 5-minute interval

**Example Fix:**
```bicep
// Before (unrealistic value):
module alertCompositePartitionPressure 'alert-composite-partition-pressure.bicep' = {
  params: {
    maxRuPerInterval: 2000  // Too low!
  }
}

// After (correct calculation):
module alertCompositePartitionPressure 'alert-composite-partition-pressure.bicep' = {
  params: {
    maxRuPerInterval: 120000  // 400 RU/s × 300 seconds
  }
}
```

**Resolution Steps:**
1. Recalculate parameter values based on actual resource provisioning
2. Update `main.bicep` module invocations
3. Redeploy infrastructure
4. Verify alert fires correctly with synthetic load test

---

### 5. Query Row Emission Logic Errors

**Symptoms:**
- Alert fires continuously despite conditions not being met
- Alert never auto-resolves
- Suppression logic emits diagnostic rows that trigger alert

**Common Causes:**
- Query returns rows for both fire and suppression states
- Conditional logic uses `case()` or `iff()` but doesn't filter final results
- Diagnostic branches not properly separated from fire conditions

**Diagnosis:**
1. Run query manually in Portal with sample data
2. Check if query returns rows when conditions NOT met
3. Verify final `| where` clause filters correctly

**Example Fix:**
```kql
// Before (returns rows for all states):
let alertCondition = ...
  | extend Status = case(
      SustainedHighCount >= 3, 'alert',
      ResolvedCount >= 2, 'resolved',
      'normal'
    )
  | project Timestamp, RUPercent, Status;  // ← Returns 'normal' rows!

// After (only returns rows for fire condition):
let alertCondition = ...
  | extend Status = case(
      SustainedHighCount >= 3, 'alert',
      ResolvedCount >= 2, 'resolved',
      'normal'
    )
  | where Status == 'alert'  // ← Only fire condition rows
  | project Timestamp, RUPercent;
```

**Resolution Steps:**
1. Add final `| where` clause to filter non-fire states
2. Ensure query returns zero rows for suppression/resolved states
3. Test with synthetic data covering all states
4. Redeploy infrastructure

---

## Verification Queries

### Check Alert Deployment Status

```bash
# List all scheduled query rules in resource group
az monitor scheduled-query list \
  --resource-group rg-atlas-game \
  --query "[].{Name:name, Enabled:enabled, Severity:severity}" \
  --output table

# Get detailed info for specific alert
az monitor scheduled-query show \
  --resource-group rg-atlas-game \
  --name alert-ru-utilization-atlas
```

### Test Alert Query Manually

1. Navigate to Azure Portal → Application Insights → Logs
2. Paste alert query (substitute parameter values)
3. Adjust time range to include recent data
4. Click "Run" and verify results

**Example substitutions:**
```kql
// Original Bicep interpolation:
let maxRuPerInterval = ${maxRuPerInterval};

// Manual testing substitution:
let maxRuPerInterval = 120000;
```

### Verify Telemetry Dimensions

```kql
// Check recent Graph.Query.Executed events
customEvents
| where timestamp > ago(1h)
| where name == "Graph.Query.Executed"
| take 10
| project 
    timestamp,
    ruCharge = customDimensions.ruCharge,
    latencyMs = customDimensions.latencyMs,
    durationMs = customDimensions.durationMs,
    statusCode = customDimensions.statusCode,
    httpStatusCode = customDimensions.httpStatusCode
| evaluate bag_unpack(customDimensions)
```

### Check Alert Firing History

```kql
// Query alert events from Application Insights
traces
| where timestamp > ago(7d)
| where message contains "Alert fired" or message contains "Alert resolved"
| project timestamp, message, severityLevel
| order by timestamp desc
```

---

## Step-by-Step Deployment Validation

### Pre-Deployment

1. **Validate Bicep Syntax:**
   ```bash
   cd infrastructure
   az bicep build --file alert-gremlin-429-spike.bicep
   az bicep build --file alert-ru-utilization.bicep
   az bicep build --file alert-composite-partition-pressure.bicep
   az bicep build --file main.bicep
   ```

2. **Review Parameter Values:**
   - Check `main.bicep` module invocations
   - Verify `maxRuPerInterval` matches provisioned RU/s
   - Confirm threshold values are realistic

3. **Test Queries in Portal:**
   - Extract KQL from Bicep modules
   - Substitute parameter values manually
   - Run in Log Analytics to verify syntax and results

### Deployment

```bash
# Deploy infrastructure (dry-run first)
az deployment group create \
  --resource-group rg-atlas-game \
  --template-file infrastructure/main.bicep \
  --parameters name=atlas location=eastus \
  --what-if

# Deploy for real
az deployment group create \
  --resource-group rg-atlas-game \
  --template-file infrastructure/main.bicep \
  --parameters name=atlas location=eastus
```

### Post-Deployment

1. **Verify Alert Resources Created:**
   ```bash
   az monitor scheduled-query list --resource-group rg-atlas-game
   ```

2. **Check Alert Enabled State:**
   ```bash
   az monitor scheduled-query show \
     --resource-group rg-atlas-game \
     --name alert-ru-utilization-atlas \
     --query "{Name:name, Enabled:enabled, Severity:severity}"
   ```

3. **Test Alert with Synthetic Load:**
   - Generate sustained high RU load (>70% for 15 minutes)
   - Force throttling (429 responses)
   - Verify alert fires within expected evaluation window

4. **Verify Auto-Resolution:**
   - Clear condition (reduce RU load or fix throttling)
   - Wait for expected resolve window duration
   - Confirm alert auto-resolves (check Portal or query history)

---

## Rollback Procedure

If deployment introduces regressions:

1. **Identify Last Known Good Commit:**
   ```bash
   git log --oneline infrastructure/
   ```

2. **Revert Infrastructure Changes:**
   ```bash
   git revert <commit-sha>
   ```

3. **Redeploy Previous Version:**
   ```bash
   az deployment group create \
     --resource-group rg-atlas-game \
     --template-file infrastructure/main.bicep
   ```

4. **Document Rollback Reason:**
   - Note issue causing rollback in PR or issue tracker
   - Link to deployment logs or error messages
   - Plan fix for next iteration

---

## Related Documentation

- [Alerts Catalog](./alerts-catalog.md) — Alert definitions and configuration
- [Threshold Tuning Report](./threshold-tuning.md) — Parameter tuning methodology
- [Composite Partition Pressure Alert](./alert-composite-partition-pressure.md) — Multi-signal alert details
- [ADR-002: Graph Partition Strategy](../adr/ADR-002-graph-partition-strategy.md) — Partition pressure thresholds

---

**Last Updated:** 2025-11-08  
**Maintained By:** M2 Observability milestone team
