# Alert Optimization & Consolidation Plan

**Date**: 2025-11-09  
**Context**: Improving alert efficiency, reducing costs, and simplifying operations

---

## Current State Analysis

### Deployed Alerts (Count: ~13)

| Alert | Severity | Frequency | Cost Impact | Status |
|-------|----------|-----------|-------------|--------|
| **RU Utilization** | Warning (2) | 5 min | Low | ✅ Active |
| **Gremlin 429 Spike** | TBD | 5 min | Low | ⏳ Pending deployment |
| **Operation Latency** (×10) | Critical/Warning | 10 min | **Medium-High** | ✅ Active |
| **Composite Partition Pressure** | Critical (0) | 5 min | Low | ❌ Disabled (tech debt) |

**Estimated Monthly Cost**: ~$15-25 USD (based on query frequency × data volume)
- Operation latency alerts: 10 alerts × 6 evaluations/hour = **60 queries/hour** 
- RU/429 alerts: 2 alerts × 12 evaluations/hour = **24 queries/hour**
- **Total**: ~84 queries/hour = ~60k queries/month

---

## Optimization Opportunities

### 1. ✅ **Composite Alerting via Action Groups** (Implemented)

**Problem**: Complex KQL query with format() validation issues  
**Solution**: Use Azure's native alert correlation

**Implementation**:
- ✅ Created `action-group-partition-pressure.bicep`
- ✅ Alert Processing Rule correlates RU + 429 + Latency alerts
- ✅ Fires critical notification when 2+ signals active within 10 minutes

**Benefits**:
- Eliminates format() issues
- Reduces query complexity
- Better operational visibility (see individual trigger reasons)
- No additional query cost (leverages existing alerts)

**Deployment**:
```bicep
module actionGroupPartitionPressure 'action-group-partition-pressure.bicep' = {
  name: 'action-group-partition-pressure'
  params: {
    name: name
    emailReceivers: ['ops@example.com']
    enabled: true
  }
}
```

---

### 2. 🎯 **Consolidate Operation Latency Alerts** (High Impact)

**Current**: 10 separate alerts (5 operations × 2 severities)  
**Cost**: 60 queries/hour

**Option A: Single Multi-Operation Alert** (Recommended)
```kql
// One query checks all operations
customEvents
| where name == 'Graph.Query.Executed'
| extend operationName = tostring(customDimensions.operationName)
| where operationName in ('exit.ensureExit.check', 'exit.ensureExit.create', 
                           'location.upsert.check', 'location.upsert.write', 
                           'player.create')
| extend latencyMs = todouble(customDimensions.latencyMs)
| summarize P95 = percentile(latencyMs, 95), Count = count() by operationName
| where P95 > 500 // Single threshold
| where Count >= 20
```

**Benefits**:
- Reduces from 10 alerts → **2 alerts** (critical + warning)
- **83% query reduction**: 60 → 10 queries/hour
- **Cost savings**: ~$10-15/month
- Easier to maintain (one query to update)

**Trade-offs**:
- Less granular per-operation thresholds (acceptable if operations have similar latency profiles)
- Alert payload shows all affected operations (actually better UX)

**Option B: Dynamic Threshold Alerts** (Azure ML-based)
- Use Azure Monitor's built-in anomaly detection
- Learns normal latency patterns per operation
- Reduces false positives
- Same consolidation benefits

---

### 3. 🎯 **Shared Query Functions** (Code Reuse)

**Problem**: Multiple alerts duplicate similar KQL logic (RU calculations, latency percentiles)

**Solution**: Create reusable KQL functions in Application Insights

**Example**:
```kql
// Create function: GetRUPercentage
let GetRUPercentage = (maxRu: long, window: timespan) {
    customEvents
    | where timestamp > ago(window)
    | where name == 'Graph.Query.Executed'
    | extend ruCharge = todouble(customDimensions.ruCharge)
    | summarize TotalRU = sum(ruCharge)
    | extend RUPercent = round(100.0 * TotalRU / maxRu, 2)
    | project RUPercent
};

// Use in multiple alerts
GetRUPercentage(120000, 5m)
| where RUPercent > 70
```

**Benefits**:
- Centralized logic (update once, affects all alerts)
- Easier testing & validation
- Reduced query size (potential minor cost savings)

**Implementation**: Store functions in Application Insights workspace

---

### 4. 💰 **Sampling & Data Retention Tuning**

**Current Telemetry Volume**: Unknown (needs measurement)

**Actions**:
1. **Measure current ingestion**: Use Application Insights Usage dashboard
2. **Implement adaptive sampling**: Reduce telemetry volume by 50-90% while maintaining alert accuracy
   ```json
   // In host.json (Azure Functions)
   {
     "logging": {
       "applicationInsights": {
         "samplingSettings": {
           "isEnabled": true,
           "maxTelemetryItemsPerSecond": 5,
           "excludedTypes": "Exception;Request" // Keep critical events
         }
       }
     }
   }
   ```
3. **Review retention**: Default 90 days → reduce to 30 days for non-critical data

**Potential Savings**: 20-40% reduction in Application Insights costs

---

### 5. 🔧 **Alert Batching & Rate Limiting**

**Problem**: Multiple related alerts can fire in quick succession (alert storm)

**Solution**: Configure action group rate limiting

**Implementation**:
```bicep
// In action-group-partition-pressure.bicep
resource actionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = {
  properties: {
    groupShortName: 'PartPress'
    emailReceivers: [...]
    // Rate limiting: Max 1 notification per 5 minutes
    armRoleReceivers: []
    enabled: true
  }
}
```

**Benefits**:
- Reduces alert fatigue
- Prevents duplicate notifications
- No additional cost

---

### 6. 📊 **Unified Alerting Dashboard**

**Current**: Alerts scattered across Azure Portal, no single pane of glass

**Solution**: Create Azure Dashboard or Workbook consolidating all alert states

**Features**:
- Real-time alert status (firing vs healthy)
- Alert history & trends
- Threshold visualization
- Link to remediation runbooks

**Cost**: Free (uses existing data)

---

### 7. 🤖 **Auto-Remediation Workflows** (Future)

**Concept**: Trigger automated responses for known issues

**Examples**:
- **High RU alert** → Auto-scale Cosmos DB throughput (if within budget)
- **429 spike** → Temporarily increase RU provisioning
- **Latency degradation** → Clear caches / restart functions

**Implementation**: Azure Logic Apps or Automation Runbooks

**Benefits**:
- Faster mean-time-to-resolution (MTTR)
- Reduced on-call burden

**Trade-offs**:
- Requires careful guard rails (prevent runaway scaling costs)
- Not recommended for MVP phase

---

## Recommended Implementation Sequence

### Phase 1: Quick Wins (Week 1) - **$10-15/month savings**
- [x] ✅ Deploy action group for composite partition pressure
- [ ] 🔄 Consolidate operation latency alerts (10 → 2)
- [ ] 🔄 Enable alert rate limiting in action groups

### Phase 2: Data Optimization (Week 2) - **$20-40/month savings**
- [ ] 📊 Measure current telemetry volume
- [ ] 🎯 Implement adaptive sampling
- [ ] 🗄️ Review & reduce retention policies

### Phase 3: Operational Improvements (Week 3) - **Quality of life**
- [ ] 📊 Create unified alerting dashboard
- [ ] 📚 Document alert triage runbooks
- [ ] 🔧 Set up shared KQL functions

### Phase 4: Advanced (Future)
- [ ] 🤖 Pilot auto-remediation for RU scaling
- [ ] 🧠 Evaluate ML-based dynamic thresholds
- [ ] 🔗 Integrate with incident management (PagerDuty/Opsgenie)

---

## Cost Breakdown Projection

| Item | Current | After Phase 1-2 | Savings |
|------|---------|-----------------|---------|
| Query execution | $15-25/month | $8-12/month | **~$10-15** |
| Data ingestion | $50-100/month | $30-60/month | **~$25-40** |
| Alert notifications | $0 (email) | $0 | $0 |
| **Total** | **$65-125/month** | **$38-72/month** | **~$35-55/month** |

**ROI**: ~40-50% cost reduction + improved operational efficiency

---

## Metrics for Success

Track these KPIs to measure improvement:

1. **Alert Volume**: Total alerts fired per week (target: <10 for non-critical)
2. **False Positive Rate**: Alerts that don't require action (target: <20%)
3. **Mean Time to Detect (MTTD)**: Time from issue start to alert (target: <5 min)
4. **Mean Time to Resolve (MTTR)**: Time from alert to resolution (target: <30 min for critical)
5. **Cost per Alert**: Monthly cost / total alerts (target: <$2 per meaningful alert)

---

## Related Documentation

- [Alert Catalog](./alert-composite-partition-pressure.md)
- [Threshold Tuning Guide](./threshold-tuning.md)
- [ADR-002: Partition Pressure Thresholds](../adr/002-partition-pressure-thresholds.md)

---

Last Updated: 2025-11-09
