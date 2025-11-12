# Partition Key Monitoring & Validation

**Purpose**: Monitor partition key distribution and detect hot partitions in Cosmos DB SQL API containers to prevent performance degradation and throttling.

**Related**:
- [ADR-002: Graph Partition Strategy](../adr/ADR-002-graph-partition-strategy.md)
- [Observability Overview](../observability.md)
- [Alerts Catalog](./alerts-catalog.md)

---

## Container Partition Key Strategies

### SQL API Containers (Dual Persistence Architecture)

| Container | Partition Key Path | Strategy | Rationale |
|-----------|-------------------|----------|-----------|
| `players` | `/id` | Player GUID | Naturally distributes by player identity; player-centric operations isolated |
| `inventory` | `/playerId` | Player GUID | Colocates all items for a player; efficient cross-item queries |
| `descriptionLayers` | `/locationId` | Location GUID | Colocates all layers for a location; supports layer composition |
| `worldEvents` | `/scopeKey` | Scope pattern | Partitions by event scope (`loc:<id>` or `player:<id>`) for efficient timelines |

### Partition Key Patterns

**Player-Centric** (`/id`, `/playerId`):
- Pros: Natural distribution matches user activity, prevents hotspots unless single player dominates
- Cons: Cross-player queries expensive (cross-partition), must use partition key in queries
- Monitoring: Track unique player count vs document distribution

**Location-Centric** (`/locationId`):
- Pros: Efficient location-based queries, colocates related data
- Cons: Popular locations become hot partitions (e.g., starter location)
- Monitoring: Track document count per location, alert on >20% concentration

**Scope-Centric** (`/scopeKey`):
- Pros: Flexible partitioning for different scopes (location, player, global)
- Cons: Requires careful scope key design to avoid imbalance
- Monitoring: Track scope key cardinality and distribution

---

## Telemetry Dimensions

All SQL API operations emit `SQL.Query.Executed` and `SQL.Query.Failed` events with partition key context:

| Dimension | Type | Purpose | Example |
|-----------|------|---------|---------|
| `containerName` | string | Container name | `players`, `inventory` |
| `partitionKey` | string | Partition key value used | Player GUID, Location GUID |
| `operationName` | string | Operation name | `players.GetById`, `inventory.Query` |
| `ruCharge` | number | Request Units consumed | `5.2` |
| `latencyMs` | number | Operation latency | `45` |
| `resultCount` | number | Documents returned | `1`, `0`, `10` |
| `crossPartitionQuery` | boolean | Whether query spans partitions | `true` (only for query operations) |
| `httpStatusCode` | number | HTTP status (failures only) | `404`, `429` |

**Note**: `partitionKey` dimension omitted for cross-partition queries (where `crossPartitionQuery=true`).

---

## Kusto Queries for Monitoring

### Partition Key Cardinality by Container

Identify unique partition key count per container (high cardinality = good distribution):

```kusto
let timeRange = 24h;
customEvents
| where timestamp > ago(timeRange)
| where name == 'SQL.Query.Executed'
| extend containerName = tostring(customDimensions.containerName),
         partitionKey = tostring(customDimensions.partitionKey)
| where isnotempty(partitionKey)
| summarize 
    uniquePartitionKeys = dcount(partitionKey),
    totalOperations = count(),
    totalRU = sum(todouble(customDimensions.ruCharge))
  by containerName
| project containerName, uniquePartitionKeys, totalOperations, totalRU,
          avgOpsPerPartition = round(todouble(totalOperations) / uniquePartitionKeys, 1)
| order by uniquePartitionKeys asc
```

**Interpretation**:
- `uniquePartitionKeys < 10`: Very low cardinality, high risk of hotspots
- `avgOpsPerPartition > 100`: Potential uneven distribution, investigate top partitions
- Low cardinality with high RU: Immediate hotspot risk

### Partition Key Distribution (Top Hot Partitions)

Identify partitions consuming most operations and RU:

```kusto
let timeRange = 24h;
let containerFilter = 'players'; // Change to target container
customEvents
| where timestamp > ago(timeRange)
| where name == 'SQL.Query.Executed'
| extend containerName = tostring(customDimensions.containerName),
         partitionKey = tostring(customDimensions.partitionKey),
         ruCharge = todouble(customDimensions.ruCharge)
| where containerName == containerFilter and isnotempty(partitionKey)
| summarize 
    operationCount = count(),
    totalRU = sum(ruCharge),
    avgRU = round(avg(ruCharge), 2),
    p95Latency = percentile(todouble(customDimensions.latencyMs), 95)
  by partitionKey
| extend operationPct = round(100.0 * operationCount / toscalar(
    customEvents
    | where timestamp > ago(timeRange)
    | where name == 'SQL.Query.Executed'
    | where tostring(customDimensions.containerName) == containerFilter
    | count
  ), 2)
| where operationPct > 5.0 // Show partitions with >5% of operations
| order by totalRU desc
| take 20
```

**Alert Thresholds**:
- `operationPct > 20%`: Single partition handling >20% of operations (amber)
- `operationPct > 40%`: Single partition dominant (red, immediate review)
- `p95Latency > 500ms` AND `operationPct > 15%`: Hot partition causing degradation

### Document Count per Partition (Requires Container Scan)

**Note**: This query requires direct container access via Azure Portal or SDK script. Telemetry tracks operations, not static document distribution.

```sql
-- Run in Azure Portal Data Explorer for container
SELECT c.id, COUNT(1) as documentCount
FROM c
GROUP BY c.partitionKey
ORDER BY documentCount DESC
```

### RU Consumption by Partition (5-Minute Intervals)

Track RU consumption patterns to detect sustained pressure:

```kusto
let timeRange = 24h;
let containerFilter = 'players';
let bucketSize = 5m;
customEvents
| where timestamp > ago(timeRange)
| where name == 'SQL.Query.Executed'
| extend containerName = tostring(customDimensions.containerName),
         partitionKey = tostring(customDimensions.partitionKey),
         ruCharge = todouble(customDimensions.ruCharge)
| where containerName == containerFilter and isnotempty(partitionKey)
| summarize totalRU = sum(ruCharge) by partitionKey, bin(timestamp, bucketSize)
| summarize 
    maxRU = max(totalRU),
    avgRU = round(avg(totalRU), 1),
    p95RU = percentile(totalRU, 95)
  by partitionKey
| where maxRU > 1000 // Filter to partitions with significant RU
| order by maxRU desc
| take 20
```

**Capacity Planning**:
- Provisioned RU/s per partition: Total RU/s ÷ partition count
- Target: Max RU per 5-min interval should be <80% of (provisioned RU/s per partition × 300s)
- Example: 1000 RU/s provisioned, 10 partitions → 100 RU/s per partition → <24,000 RU per 5-min

---

## Alert Rules

### Hot Partition Detection Alert

**Alert ID**: `alert-sql-hot-partition-{name}`  
**Bicep Module**: `infrastructure/alert-sql-hot-partition.bicep`  
**Status**: Pending implementation (Issue #387)

**Trigger Conditions**:
- Single partition consuming >80% of total RU in 5-minute window
- Container has >1000 documents (suppresses new container false positives)
- Evaluated every 5 minutes

**Alert Payload**:
- `containerName`: Affected container
- `partitionKey`: Hot partition key value
- `ruPercent`: Percentage of total RU consumed by this partition
- `operationCount`: Number of operations in window
- `totalRU`: Total RU consumed by partition
- `p95Latency`: P95 latency for partition operations

**Auto-Resolution**:
- Resolves when partition RU consumption drops below 70% for 3 consecutive intervals (15 minutes)

**Response Actions**:
1. Query partition key distribution (see queries above)
2. Identify if hotspot is expected (e.g., starter location) or anomaly
3. Review operation types (`operationName` dimension) for optimization opportunities
4. Consider partition key migration if persistent hotspot confirmed

**Edge Cases**:
- **New containers** (<1000 documents): Alert suppressed to avoid false positives during bootstrap
- **Player activity spikes**: Expected for player-centric partitions during login storms
- **Starter location**: Known hotspot for location-based partitions; may require special handling

---

## Validation Script

**Script**: `scripts/validate-partition-distribution.ts` (pending creation)

**Purpose**: Analyze partition key distribution across SQL containers and identify potential hotspots.

**Usage**:
```bash
# Dry run (report only, no changes)
npm run validate:partitions --dry-run

# Analyze specific container
npm run validate:partitions --container players

# Export report to CSV
npm run validate:partitions --format csv > partition-report.csv
```

**Output**:
- Partition key cardinality by container
- Top 20 hot partitions by operation count and RU
- Hotspot risk assessment (green/amber/red)
- Recommended actions for identified issues

**Validation Criteria**:
- ✅ **Healthy**: No partition >15% of operations, cardinality >10
- ⚠️ **Warning**: Any partition >15% OR cardinality <5
- 🔴 **Critical**: Any partition >25% OR sustained >80% RU for 1+ hour

---

## Partition Key Migration Guide

### When to Migrate

Migrate partition key strategy if:
1. Single partition consistently >40% of operations for 7+ days
2. Sustained 429 throttling isolated to specific partition key
3. P95 latency >500ms for operations on hot partition
4. Cardinality <5 with >10,000 documents per container

### Migration Process

**Prerequisites**:
- Validated new partition key strategy addresses root cause
- Tested new strategy in non-production environment
- Scheduled maintenance window (downtime required for data migration)

**Steps**:

1. **Export Existing Data**
   ```bash
   # Export all documents from container
   az cosmosdb sql container export \
     --account-name <account> \
     --database-name game \
     --container-name <container> \
     --output-path ./backup/<container>-export.json
   ```

2. **Create New Container with Updated Partition Key**
   ```bash
   # Bicep deployment with new partition key path
   # Update infrastructure/cosmos-sql-containers.bicep
   # Deploy with new partition key definition
   az deployment group create \
     --resource-group <rg> \
     --template-file infrastructure/main.bicep \
     --parameters @parameters.json
   ```

3. **Transform and Import Data**
   ```typescript
   // Script to transform documents for new partition key
   // Example: location-based → player-based migration
   const documents = loadExport('./backup/inventory-export.json')
   const transformed = documents.map(doc => ({
     ...doc,
     partitionKey: doc.playerId // New partition key field
   }))
   await bulkImport(newContainer, transformed)
   ```

4. **Dual-Write Period**
   - Update application code to write to both old and new containers
   - Monitor new container for data consistency
   - Duration: 7 days minimum

5. **Cutover**
   - Update config to point reads to new container
   - Monitor for issues (rollback plan ready)
   - Decommission old container after 30-day soak period

6. **Verify Distribution**
   ```bash
   # Run validation script on new container
   npm run validate:partitions --container <new-container>
   ```

**Rollback Plan**:
- Keep old container active during dual-write period
- Single config change to revert reads to old container
- No data loss if rollback within dual-write window

---

## Best Practices

### Partition Key Design

1. **High Cardinality**: Aim for >100 unique partition keys per 10,000 documents
2. **Predictable Access Patterns**: Partition key should match primary query filters
3. **Avoid Time-Based Keys**: Date/timestamp partitions create hot partitions as time advances
4. **Test with Production-Like Data**: Validate distribution with realistic data volumes

### Monitoring Cadence

- **Daily**: Review partition key cardinality report (automated alert)
- **Weekly**: Analyze top hot partitions trend (manual review)
- **Monthly**: Capacity planning for partition distribution vs growth
- **Quarterly**: Review partition strategy effectiveness, consider optimizations

### Query Optimization

- **Always Include Partition Key**: Point reads dramatically cheaper (5-10x RU savings)
- **Avoid Cross-Partition Queries**: Redesign queries to target single partition when possible
- **Batch Operations**: Group operations by partition key to minimize round trips
- **Index Strategy**: Ensure composite indexes support partition-scoped queries

---

## Troubleshooting

### High RU Consumption on Single Partition

**Symptoms**: Partition >80% RU, 429 throttling, elevated latency

**Root Causes**:
1. Popular entity (e.g., starter location, admin player)
2. Inefficient query patterns (missing indexes, large result sets)
3. Write amplification (frequent updates to same documents)
4. Batch operations not distributed across partitions

**Remediation**:
1. Identify operation types via `operationName` dimension
2. Optimize queries (add indexes, reduce result set size)
3. Consider caching for read-heavy popular entities
4. Evaluate partition key migration if structural issue

### Low Partition Key Cardinality

**Symptoms**: `uniquePartitionKeys < 10`, uneven distribution

**Root Causes**:
1. Partition key design doesn't match data model
2. Limited entity types (e.g., only admin users created)
3. Test/development environment (not representative of production)

**Remediation**:
1. Review partition key strategy (see migration guide)
2. Validate with production-like data volumes
3. Consider synthetic partition key (hash-based) if natural key insufficient

### 429 Throttling Despite Low Partition Count

**Symptoms**: 429 errors, low overall RU consumption, few partitions

**Root Causes**:
1. Provisioned RU/s too low for burst traffic
2. Partition skew (one partition consuming majority)
3. Cross-partition queries (high RU cost)

**Remediation**:
1. Increase provisioned RU/s (temporary)
2. Investigate partition distribution (run validation script)
3. Optimize cross-partition queries or redesign partition key

---

## Related Issues

- **Issue #387**: Partition Key Strategy Validation & Monitoring (this implementation)
- **Issue #386**: Cosmos Dual Persistence Implementation (epic)
- **Issue #292**: Sustained High RU Utilization Alert
- **Issue #293**: Gremlin 429 Spike Detection Alert

---

_Last Updated: 2025-11-12_
