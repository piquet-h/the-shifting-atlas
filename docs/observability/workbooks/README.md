# Application Insights Workbooks

This directory contains Azure Application Insights workbook definitions for The Shifting Atlas observability dashboards.

## Overview

Workbooks provide interactive data exploration and visualization for telemetry events emitted by the game backend. Each workbook JSON file can be imported into Azure Application Insights to create live dashboards.

## Available Workbooks

### Movement Blocked Reasons Breakdown

**File:** `movement-blocked-reasons.workbook.json`  
**Issue:** [#282](https://github.com/piquet-h/the-shifting-atlas/issues/282)  
**Purpose:** Analyze `Navigation.Move.Blocked` events by reason to identify primary traversal friction sources.

**Panels:**
1. **Blocked Events by Reason (24h)** - Table showing count and percentage by reason
2. **7-Day Blocked Rate Trend** - Line chart showing blocked rate over time
3. **Summary Statistics** - Quick overview of total blocked events and top reason

**Key Features:**
- Automatic "other" bucket for unknown reasons
- ⚠️ HIGH alert when any reason exceeds 50% threshold
- Empty state handling ("No traversal friction detected ✓")
- Cross-references to related issues and success rate panel

**Reasons Tracked:**
- `invalid-direction` - Direction normalization failed (UX tuning)
- `from-missing` - Player location not found (data integrity)
- `no-exit` - No exit in requested direction (world connectivity)
- `move-failed` - Repository/system error (reliability)

## Importing Workbooks into Azure

### Prerequisites

- Azure subscription with Application Insights resource deployed
- Contributor or Owner role on the Application Insights resource
- Azure Portal access

### Import Steps

1. **Navigate to Application Insights**
   - Open [Azure Portal](https://portal.azure.com)
   - Go to your Application Insights resource (e.g., `appi-atlas`)

2. **Open Workbooks**
   - In the left navigation, under "Monitoring", click **Workbooks**
   - Click **+ New** to create a new workbook

3. **Import JSON**
   - Click **Advanced Editor** (top toolbar, `</>` icon)
   - Select the **Gallery Template** tab
   - Replace the entire JSON content with contents from the `.workbook.json` file
   - Click **Apply**

4. **Save Workbook**
   - Click **Save** (disk icon in toolbar)
   - Enter a title (e.g., "Movement Blocked Reasons Breakdown")
   - Select resource group
   - Choose location
   - Click **Save**

5. **Pin to Dashboard (Optional)**
   - Click **Pin** to add to your Azure Dashboard for quick access

### Alternative: Bicep Deployment (Recommended)

For automated infrastructure-as-code deployment, use the Bicep module included in the repository:

**Location:** `infrastructure/workbook-movement-blocked-reasons.bicep`

The workbook is automatically deployed when you deploy the main infrastructure:

```bash
# Deploy entire infrastructure including workbook
cd infrastructure
az deployment group create \
  --resource-group rg-atlas-game \
  --template-file main.bicep \
  --parameters name=atlas
```

The workbook module automatically:
- Creates the workbook resource in Azure
- Links it to Application Insights
- Loads the JSON definition from `docs/observability/workbooks/`
- Tags it appropriately for M2 Observability milestone

**Manual Bicep deployment** (workbook only):

```bash
cd infrastructure
az deployment group create \
  --resource-group rg-atlas-game \
  --template-file workbook-movement-blocked-reasons.bicep \
  --parameters name=atlas \
  --parameters applicationInsightsId='/subscriptions/{subscription-id}/resourceGroups/{rg-name}/providers/Microsoft.Insights/components/appi-atlas'
```

**Benefits of Bicep deployment:**
- Version controlled infrastructure
- Consistent deployment across environments
- Automatic workbook updates on JSON changes
- Integration with CI/CD pipelines
- Idempotent (safe to re-run)

### Alternative: ARM Template Deployment

For non-Bicep environments, you can also use raw ARM templates. The Bicep file compiles to ARM JSON:

```bash
# Generate ARM template from Bicep
az bicep build --file infrastructure/workbook-movement-blocked-reasons.bicep
```

This creates `workbook-movement-blocked-reasons.json` that can be deployed with:

```bash
az deployment group create \
  --resource-group rg-atlas-game \
  --template-file workbook-movement-blocked-reasons.json
```

## Kusto Query Reference

All workbooks use KQL (Kusto Query Language) to query Application Insights telemetry data.

### Common Patterns

**Filtering by Event Name:**
```kusto
customEvents
| where name == 'Navigation.Move.Blocked'
```

**Extracting Custom Dimensions:**
```kusto
| extend reason = tostring(customDimensions.reason)
| extend playerId = tostring(customDimensions.player_id)
```

**Handling Unknown Values:**
```kusto
let knownReasons = dynamic(['invalid-direction', 'from-missing', 'no-exit', 'move-failed']);
| extend normalizedReason = iff(reason in (knownReasons), reason, 'other')
```

**Percentage Calculations:**
```kusto
| extend TotalCount = toscalar(customEvents | where ... | count)
| extend PercentageShare = round(100.0 * Count / TotalCount, 2)
```

**Time Binning for Trends:**
```kusto
| summarize Count = count() by bin(timestamp, 6h)
```

**Empty State Handling:**
```kusto
print ['Status'] = iff(totalCount == 0, 'No events detected ✓', strcat(totalCount, ' events'))
```

### Testing Queries

Before importing workbooks, test queries in Application Insights:

1. Navigate to **Logs** under Monitoring
2. Paste query from workbook JSON
3. Adjust time range (e.g., Last 24 hours)
4. Click **Run**
5. Verify results match expectations

## Workbook Maintenance

### Versioning

Workbook JSON files follow semantic versioning in commit messages:
- **Major:** Breaking changes to query structure or panel layout
- **Minor:** New panels or non-breaking enhancements
- **Patch:** Query optimization, documentation updates

### Export Workflow

When manually editing workbooks in Azure Portal:

1. Make changes in the Portal editor
2. Open **Advanced Editor** (`</>` icon)
3. Copy entire JSON from **Gallery Template** tab
4. Paste into local `.workbook.json` file
5. Format with 2-space indentation
6. Remove volatile fields (if any): `lastModified`, user IDs
7. Commit to repository with descriptive message

### Automated Export (Future)

See [#298](https://github.com/piquet-h/the-shifting-atlas/issues/298) for planned automation:
- `scripts/observability/export-workbooks.mjs` - Export from Azure
- `scripts/observability/verify-workbooks.mjs` - Detect drift in CI

## Related Documentation

- **Telemetry Catalog:** [docs/observability/telemetry-catalog.md](../telemetry-catalog.md)
- **Event Registry:** `shared/src/telemetryEvents.ts`
- **Dashboard Issues:**
  - [#281](https://github.com/piquet-h/the-shifting-atlas/issues/281) - Movement Success Rate Panel
  - [#282](https://github.com/piquet-h/the-shifting-atlas/issues/282) - Movement Blocked Reasons (this)
  - [#283](https://github.com/piquet-h/the-shifting-atlas/issues/283) - Movement Latency Distribution
  - [#289](https://github.com/piquet-h/the-shifting-atlas/issues/289) - Gremlin RU & Latency Overview
  - [#290](https://github.com/piquet-h/the-shifting-atlas/issues/290) - RU vs Latency Correlation
  - [#291](https://github.com/piquet-h/the-shifting-atlas/issues/291) - Partition Pressure Trend

## Troubleshooting

### Query Returns No Data

**Symptoms:** Empty panels or "No data" messages

**Causes:**
1. Time range too short - Extend to 7d or 30d
2. Events not yet emitted - Deploy backend with telemetry
3. Sampling rate too low - Check Application Insights sampling configuration
4. Wrong Application Insights resource - Verify resource ID in workbook

**Resolution:**
```kusto
// Verify events exist
customEvents
| where timestamp > ago(7d)
| where name startswith "Navigation."
| summarize count() by name
```

### High Query Cost Warnings

**Symptoms:** "Query exceeded resource limits" error

**Causes:**
1. Time range too broad (>30 days)
2. High-cardinality groupings (e.g., by player_id)
3. Complex aggregations without filtering

**Resolution:**
- Reduce time range to 7d or less
- Add `| where` filters early in query
- Use `take` or `top` to limit results
- Consider pre-aggregated metrics (future enhancement)

### Threshold Alerts Not Appearing

**Symptoms:** No ⚠️ HIGH indicators despite high percentages

**Causes:**
1. Grid formatter not applied correctly
2. Alert column name mismatch
3. Threshold logic error in query

**Resolution:**
- Re-import workbook JSON to reset formatters
- Verify `IsHighConcentration` column exists in query result
- Test threshold logic: `print iff(60.0 > 50.0, '⚠️ HIGH', '')`

## Support

For workbook-related issues:
1. Check [Application Insights documentation](https://learn.microsoft.com/azure/azure-monitor/visualize/workbooks-overview)
2. Review [KQL reference](https://learn.microsoft.com/azure/data-explorer/kusto/query/)
3. Open issue with `scope:observability` label
4. Include query + error message in issue description
