# Sub-Issue 6: Extend Scheduler to Emit Telemetry

**Parent Issue:** #83 - Automation Stage 2: Predictive Scheduling Integration  
**Labels:** `scope:observability`, `enhancement`, `M0`  
**Milestone:** M0 Foundation

## Context

The roadmap scheduler needs to emit structured telemetry events to enable monitoring, debugging, and continuous improvement of scheduling accuracy. This aligns with the project's observability goals and provides data for variance analysis.

## Requirements

### 1. Telemetry Event Definition

**Event Name:** `schedule_variance`

**Event Type:** Metric + Dimensions

**Purpose:** Track the difference between provisional and actual schedules for observability and trend analysis.

### 2. Event Schema

**Core Event:**

```javascript
{
    eventName: 'schedule_variance',
    timestamp: '2025-01-15T10:30:00.000Z',
    properties: {
        // Issue Identification
        issueNumber: 123,
        implementationOrder: 42,
        
        // Schedule Data
        provisionalStart: '2025-01-10',
        provisionalFinish: '2025-01-15',
        provisionalDuration: 6,
        actualStart: '2025-01-12',
        actualFinish: '2025-01-18',
        actualDuration: 7,
        
        // Variance Metrics
        startDelta: 2,           // days (positive = actual later)
        finishDelta: 3,          // days
        durationDelta: 1,        // days
        overallVariance: 0.50,   // finish-weighted (50%)
        
        // Classification
        scope: 'scope:core',
        type: 'feature',
        milestone: 'M0',
        confidence: 'high',
        
        // Estimation Context
        sampleSize: 7,
        basis: 'scope-type',
        medianUsed: 6.0,
        
        // Scheduler Context
        schedulerReason: 'new',  // reason from schedule-roadmap.mjs
        status: 'Todo',
        
        // Metadata
        calculationSource: 'daily_scheduler',
        provisionalCalculatedAt: '2025-01-08T14:20:00Z',
        stage: 2
    }
}
```

### 3. Emission Points

**Primary:** After daily scheduler assigns actual dates

**Location:** `scripts/schedule-roadmap.mjs`

**Integration point:**

```javascript
// In main() after applying date field updates

for (const change of changes) {
    await updateDateField(projectId, change.itemId, startField.id, change.start)
    await updateDateField(projectId, change.itemId, targetField.id, change.target)
    console.log(`Applied #${change.issue}`)
    
    // NEW: Emit telemetry if provisional exists
    await emitScheduleVarianceTelemetry(change)
}
```

**Secondary (Future):** When provisional schedule is created
- Emit `provisional_schedule_created` event
- Track provisional schedule quality over time

### 4. Telemetry Integration

**Shared Telemetry Module:** Use existing `shared/src/telemetry.ts`

**Extension Required:**

```typescript
// shared/src/telemetryEvents.ts
export enum TelemetryEvent {
    // ... existing events
    SCHEDULE_VARIANCE = 'schedule_variance',
    PROVISIONAL_SCHEDULE_CREATED = 'provisional_schedule_created',
    VARIANCE_ALERT_CREATED = 'variance_alert_created',
    REBASELINE_TRIGGERED = 'rebaseline_triggered'
}
```

**Wrapper Function:**

```javascript
// scripts/shared/telemetry-helper.mjs
import { trackScheduleVariance } from '@atlas/shared'

export async function emitScheduleVarianceTelemetry(change, provisionalData) {
    if (!provisionalData) return // No provisional to compare
    
    const variance = calculateVariance(provisionalData, change)
    
    await trackScheduleVariance({
        issueNumber: change.issue,
        implementationOrder: change.order,
        provisional: {
            start: provisionalData.start,
            finish: provisionalData.finish,
            duration: provisionalData.duration
        },
        actual: {
            start: change.start,
            finish: change.target,
            duration: calculateDuration(change.start, change.target)
        },
        variance,
        metadata: provisionalData.metadata,
        estimation: provisionalData.estimation,
        schedulerReason: change.reason
    })
}
```

### 5. Telemetry Backend Configuration

**Target:** Application Insights (existing project observability backend)

**Configuration:**

```javascript
// Ensure APPLICATIONINSIGHTS_CONNECTION_STRING is set in workflow
// scripts/schedule-roadmap.mjs will initialize telemetry client

import { initializeTelemetry, trackEvent } from './shared/telemetry-helper.mjs'

const telemetryEnabled = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING ? true : false

if (telemetryEnabled) {
    initializeTelemetry()
    console.log('Telemetry enabled')
} else {
    console.log('Telemetry disabled (no connection string)')
}
```

### 6. Event Dimensions for Querying

**Key dimensions for Application Insights queries:**

```kusto
customEvents
| where name == "schedule_variance"
| extend 
    scope = tostring(customDimensions.scope),
    type = tostring(customDimensions.type),
    confidence = tostring(customDimensions.confidence),
    variance = todouble(customDimensions.overallVariance)
| summarize 
    avgVariance = avg(variance),
    p50Variance = percentile(variance, 50),
    p95Variance = percentile(variance, 95),
    count = count()
  by scope, confidence
| order by avgVariance desc
```

**Example Queries:**

1. **Median variance by scope:**
```kusto
customEvents
| where name == "schedule_variance"
| where timestamp > ago(30d)
| extend scope = tostring(customDimensions.scope),
         variance = todouble(customDimensions.overallVariance)
| summarize medianVariance = percentile(variance, 50) by scope
```

2. **High variance issues:**
```kusto
customEvents
| where name == "schedule_variance"
| where todouble(customDimensions.overallVariance) > 0.25
| project timestamp, 
          issueNumber = toint(customDimensions.issueNumber),
          variance = todouble(customDimensions.overallVariance),
          scope = tostring(customDimensions.scope)
```

3. **Variance trend over time:**
```kusto
customEvents
| where name == "schedule_variance"
| where timestamp > ago(90d)
| extend variance = todouble(customDimensions.overallVariance)
| summarize avgVariance = avg(variance) by bin(timestamp, 1d)
| render timechart
```

### 7. Local Testing (No AppInsights)

**Fallback:** Console logging when telemetry backend unavailable

```javascript
function trackScheduleVariance(data) {
    if (telemetryEnabled) {
        appInsights.trackEvent({
            name: 'schedule_variance',
            properties: data
        })
    } else {
        console.log('[TELEMETRY] schedule_variance:', JSON.stringify(data, null, 2))
    }
}
```

**Artifact Output:** Optionally write telemetry events to file

```javascript
// scripts/schedule-roadmap.mjs
const TELEMETRY_ARTIFACT = process.env.TELEMETRY_ARTIFACT || ''

if (TELEMETRY_ARTIFACT) {
    const events = []
    // ... collect events during run
    writeFileSync(TELEMETRY_ARTIFACT, JSON.stringify(events, null, 2))
    console.log(`Telemetry artifact written: ${TELEMETRY_ARTIFACT}`)
}
```

### 8. Additional Telemetry Events

**Provisional Schedule Created:**

```javascript
{
    eventName: 'provisional_schedule_created',
    timestamp: '2025-01-08T14:20:00Z',
    properties: {
        issueNumber: 123,
        order: 42,
        start: '2025-01-10',
        finish: '2025-01-15',
        duration: 6,
        confidence: 'high',
        basis: 'scope-type',
        sampleSize: 7,
        scope: 'scope:core',
        type: 'feature',
        milestone: 'M0',
        strategy: 'auto',
        stage: 2
    }
}
```

**Variance Alert Created:**

```javascript
{
    eventName: 'variance_alert_created',
    timestamp: '2025-01-15T00:30:00Z',
    properties: {
        periodKey: '2025-W03',
        alertIssueNumber: 456,
        medianVariance: 0.32,
        sampleSize: 12,
        alertLevel: 'red',
        topContributorCount: 5,
        stage: 2
    }
}
```

**Rebaseline Triggered:**

```javascript
{
    eventName: 'rebaseline_triggered',
    timestamp: '2025-01-15T10:00:00Z',
    properties: {
        issueNumber: 123,
        order: 42,
        statusChange: 'Todo -> In progress',
        downstreamCount: 8,
        stage: 2
    }
}
```

## Acceptance Criteria

- [ ] `schedule_variance` event defined in telemetryEvents.ts
- [ ] Event schema documented with all dimensions
- [ ] Telemetry emission integrated into schedule-roadmap.mjs
- [ ] Telemetry only emitted when provisional data exists
- [ ] Graceful degradation when AppInsights unavailable (console log)
- [ ] Telemetry artifact output supported (for CI)
- [ ] Application Insights queries documented
- [ ] Additional events defined (provisional_created, alert_created, rebaseline)
- [ ] Unit tests for telemetry helper functions
- [ ] Integration test verifies telemetry emitted during scheduling
- [ ] Workflow configured with APPLICATIONINSIGHTS_CONNECTION_STRING
- [ ] Documentation updated with telemetry schema

## Technical Specifications

### Telemetry Helper Module

**Location:** `scripts/shared/telemetry-helper.mjs`

**Exports:**

```javascript
export {
    initializeTelemetry,
    trackScheduleVariance,
    trackProvisionalCreated,
    trackVarianceAlert,
    trackRebaseline,
    isTelemetryEnabled
}
```

**Implementation:**

```javascript
import { trackEvent } from '@atlas/shared'

let telemetryEnabled = false
let eventBuffer = []

export function initializeTelemetry() {
    const connString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING
    telemetryEnabled = !!connString
    
    if (telemetryEnabled) {
        // Initialize AppInsights client (already done in @atlas/shared)
        console.log('Telemetry enabled (Application Insights)')
    } else {
        console.log('Telemetry disabled (no connection string)')
    }
}

export function trackScheduleVariance(data) {
    const event = {
        name: 'schedule_variance',
        properties: {
            ...data,
            timestamp: new Date().toISOString(),
            stage: 2
        }
    }
    
    if (telemetryEnabled) {
        trackEvent(event)
    } else {
        console.log('[TELEMETRY]', JSON.stringify(event, null, 2))
    }
    
    eventBuffer.push(event)
}

export function isTelemetryEnabled() {
    return telemetryEnabled
}

export function flushTelemetryArtifact(filepath) {
    if (!filepath || !eventBuffer.length) return
    
    writeFileSync(filepath, JSON.stringify(eventBuffer, null, 2))
    console.log(`Telemetry artifact written: ${filepath} (${eventBuffer.length} events)`)
    eventBuffer = []
}
```

### Schedule-Roadmap Integration

**Modification to schedule-roadmap.mjs:**

```javascript
// At top of file
import { 
    initializeTelemetry, 
    trackScheduleVariance,
    flushTelemetryArtifact
} from './shared/telemetry-helper.mjs'

// In main()
async function main() {
    initializeTelemetry()
    
    // ... existing logic ...
    
    for (const ch of changes) {
        await updateDateField(projectId, ch.itemId, startField.id, ch.start)
        await updateDateField(projectId, ch.itemId, targetField.id, ch.target)
        console.log(`Applied #${ch.issue}`)
        
        // NEW: Check for provisional and emit telemetry
        const provisional = await getProvisionalSchedule(ch.issue)
        if (provisional) {
            trackScheduleVariance({
                issueNumber: ch.issue,
                implementationOrder: provisional.order,
                provisional: {
                    start: provisional.provisional.start,
                    finish: provisional.provisional.finish,
                    duration: provisional.provisional.duration
                },
                actual: {
                    start: ch.start,
                    finish: ch.target,
                    duration: wholeDayDiff(
                        new Date(ch.start + 'T00:00:00Z'),
                        new Date(ch.target + 'T00:00:00Z')
                    )
                },
                variance: calculateVarianceMetrics(provisional.provisional, {
                    start: ch.start,
                    finish: ch.target
                }),
                metadata: provisional.metadata,
                estimation: provisional.estimation,
                schedulerReason: ch.reason,
                status: extractFieldValue(ch.item, 'Status') || ''
            })
        }
    }
    
    // Flush artifact if requested
    const artifactPath = process.env.TELEMETRY_ARTIFACT
    if (artifactPath) {
        flushTelemetryArtifact(artifactPath)
    }
}
```

### Workflow Configuration

**Update roadmap-scheduler.yml:**

```yaml
- name: Schedule (apply)
  if: ${{ github.event_name == 'schedule' || inputs.apply == 'true' }}
  env:
    GITHUB_TOKEN: ${{ steps.token.outputs.value }}
    RESEAT_EXISTING: ${{ steps.reseat.outputs.value }}
    APPLICATIONINSIGHTS_CONNECTION_STRING: ${{ secrets.APPLICATIONINSIGHTS_CONNECTION_STRING }}
    TELEMETRY_ARTIFACT: telemetry-schedule-variance.json
  run: npm run schedule:roadmap -- apply

- name: Upload Telemetry Artifact
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: schedule-telemetry
    path: telemetry-schedule-variance.json
    retention-days: 30
```

## Testing Strategy

### Unit Tests

**Location:** `scripts/shared/telemetry-helper.test.mjs`

Test cases:
1. Initialize telemetry (with connection string)
2. Initialize telemetry (without connection string)
3. Track schedule_variance event
4. Track provisional_created event
5. Flush telemetry artifact
6. Event buffer accumulation
7. Graceful handling when AppInsights unavailable

### Integration Tests

1. **End-to-end telemetry flow:**
   - Run scheduler with provisional data
   - Verify schedule_variance events emitted
   - Check artifact file created
   - Validate event schema

2. **Multiple events:**
   - Schedule multiple issues
   - Verify one event per issue with provisional
   - Verify no events for issues without provisional

3. **Telemetry disabled:**
   - Run without APPLICATIONINSIGHTS_CONNECTION_STRING
   - Verify console logging fallback
   - Verify no errors

### Manual Testing

1. Configure AppInsights connection string locally
2. Run scheduler: `npm run schedule:roadmap -- apply`
3. Check Application Insights portal for events
4. Verify dimensions present and queryable
5. Test example Kusto queries

## Documentation Impact

### Files to Update

1. **docs/developer-workflow/roadmap-scheduling.md**
   - Add "Telemetry" section
   - Document emitted events
   - Provide example queries

2. **docs/developer-workflow/implementation-order-automation.md**
   - Document Stage 2 telemetry integration
   - Link to observability dashboard (if created)

3. **shared/src/telemetryEvents.ts**
   - Add TSDoc comments for new events
   - Document event schema

4. **README.md**
   - Note telemetry configuration requirement
   - Link to observability documentation

## Rollback Procedure

If telemetry causes issues:
1. Remove telemetry emission from schedule-roadmap.mjs (comment out trackScheduleVariance calls)
2. Telemetry helper functions remain (no-op)
3. Re-enable after fixing with updated logic
4. Historical telemetry data preserved in Application Insights

## Dependencies

- Existing `shared/src/telemetry.ts` module
- Application Insights connection string (secret)
- Sub-issue #3 (Provisional Storage) - need provisional data to compare

## Estimated Duration

2 days

## Notes

- Telemetry is non-blocking; failures should be logged but not halt scheduling
- Consider sampling if event volume becomes high (>1000 events/day)
- Application Insights has daily ingestion limits (varies by plan)
- Keep event payload under 8KB (not an issue with current schema)
- Future: Add custom metrics for Grafana/Prometheus if needed
