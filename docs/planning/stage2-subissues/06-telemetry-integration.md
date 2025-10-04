# Sub-Issue 6: Extend Scheduler to Emit Telemetry

**Parent Issue:** #83 - Automation Stage 2: Predictive Scheduling Integration  
**Labels:** `scope:observability`, `enhancement`, `M0`  
**Milestone:** M0 Foundation

## Context

The roadmap scheduler needs to emit structured telemetry events to enable monitoring, debugging, and continuous improvement of scheduling accuracy. 

---

## ⚠️ CRITICAL: Build vs Game Telemetry Separation

**This sub-issue concerns BUILD/AUTOMATION telemetry which MUST be kept separate from game telemetry.**

### Architectural Rule

| Telemetry Type | Module Location | Purpose | Event Format |
|----------------|-----------------|---------|--------------|
| **Game Telemetry** | `shared/src/telemetry.ts`<br/>`shared/src/telemetryEvents.ts` | In-game events (player actions, world generation) | `Domain.Subject.Action` |
| **Build Telemetry** | `scripts/shared/build-telemetry.mjs` | CI/automation (scheduler, ordering, variance) | `build.<component>_<action>` |

### Critical Requirements

1. **DO NOT** add build/automation events to `shared/src/telemetryEvents.ts`
2. **DO NOT** use `shared/src/telemetry.ts` for scheduler metrics
3. **DO NOT** mix game and build events in the same module
4. The `shared/` folder is **exclusively for game domain code**
5. Build automation uses `scripts/shared/` for all tooling

### Rationale

- **Separation of concerns:** Game telemetry tracks player experience; build telemetry tracks development workflows
- **Different audiences:** Game telemetry for designers/players; build telemetry for developers
- **Cleaner queries:** Prevents game dashboards from being polluted with CI noise
- **Architectural integrity:** Maintains `shared/` as pure game domain code

---

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

**Build Telemetry Module:** Create NEW module `scripts/shared/build-telemetry.mjs` (NOT `shared/src/telemetry.ts`)

**Separation Rationale:**
- `shared/src/` is for **game domain code only** (player actions, world events)
- `scripts/shared/` is for **build/automation tooling** (scheduler, ordering, CI)
- Different Application Insights instances (or separate custom dimensions)
- Prevents pollution of game telemetry with build metrics

**Event Definition:**

```javascript
// scripts/shared/build-telemetry.mjs
// Build/automation telemetry events (NOT game events)

export const BUILD_EVENT_NAMES = [
    'build.schedule_variance',
    'build.provisional_schedule_created',
    'build.variance_alert_created',
    'build.rebaseline_triggered',
    'build.ordering_assigned'
] as const

export type BuildEventName = typeof BUILD_EVENT_NAMES[number]
```

**DO NOT add to shared/src/telemetryEvents.ts:**

```javascript
// ❌ WRONG - Do not add build events here
export const GAME_EVENT_NAMES = [
    // ... game events only
    'schedule_variance',  // ❌ NO - this is build telemetry
]

// ✅ CORRECT - Keep game events only
export const GAME_EVENT_NAMES = [
    'Player.Get',
    'Location.Move',
    // ... other game events
]
```

**Wrapper Function:**

```javascript
// scripts/shared/build-telemetry.mjs
import appInsights from 'applicationinsights'

let buildTelemetryClient = null

export function initializeBuildTelemetry() {
    const connString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING
    if (!connString) return
    
    // Separate client or use custom dimension to distinguish from game telemetry
    if (!appInsights.defaultClient) {
        appInsights.setup(connString).start()
    }
    buildTelemetryClient = appInsights.defaultClient
}

export function trackBuildEvent(name, properties) {
    if (!buildTelemetryClient) {
        console.log('[BUILD_TELEMETRY]', name, properties)
        return
    }
    
    // Add custom dimension to distinguish from game events
    buildTelemetryClient.trackEvent({
        name,
        properties: {
            ...properties,
            telemetrySource: 'build-automation',  // Key differentiator
            telemetryType: 'ci-workflow'
        }
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

**Location:** `scripts/shared/build-telemetry.mjs` (NEW - separate from game telemetry)

**Exports:**

```javascript
export {
    initializeBuildTelemetry,
    trackScheduleVariance,
    trackProvisionalCreated,
    trackVarianceAlert,
    trackRebaseline,
    isBuildTelemetryEnabled
}
```

**Implementation:**

```javascript
// scripts/shared/build-telemetry.mjs
// Build/automation telemetry - SEPARATE from game telemetry in shared/src/
import appInsights from 'applicationinsights'

let buildTelemetryEnabled = false
let buildTelemetryClient = null
let eventBuffer = []

export function initializeBuildTelemetry() {
    const connString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING
    buildTelemetryEnabled = !!connString
    
    if (buildTelemetryEnabled) {
        if (!appInsights.defaultClient) {
            appInsights.setup(connString).start()
        }
        buildTelemetryClient = appInsights.defaultClient
        console.log('Build telemetry enabled (Application Insights)')
    } else {
        console.log('Build telemetry disabled (no connection string)')
    }
}

export function trackScheduleVariance(data) {
    const event = {
        name: 'build.schedule_variance',  // Prefixed to distinguish from game events
        properties: {
            ...data,
            timestamp: new Date().toISOString(),
            telemetrySource: 'build-automation',
            telemetryType: 'scheduler',
            stage: 2
        }
    }
    
    if (buildTelemetryEnabled && buildTelemetryClient) {
        buildTelemetryClient.trackEvent(event)
    } else {
        console.log('[BUILD_TELEMETRY]', JSON.stringify(event, null, 2))
    }
    
    eventBuffer.push(event)
}

export function isBuildTelemetryEnabled() {
    return buildTelemetryEnabled
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
    initializeBuildTelemetry, 
    trackScheduleVariance,
    flushTelemetryArtifact
} from './shared/build-telemetry.mjs'  // NEW - separate from game telemetry

// In main()
async function main() {
    initializeBuildTelemetry()  // Separate from game telemetry initialization
    
    // ... existing logic ...
    
    for (const ch of changes) {
        await updateDateField(projectId, ch.itemId, startField.id, ch.start)
        await updateDateField(projectId, ch.itemId, targetField.id, ch.target)
        console.log(`Applied #${ch.issue}`)
        
        // NEW: Check for provisional and emit build telemetry
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

**Note:** Do NOT import from `@atlas/shared` for build telemetry. Keep game and build telemetry completely separate.

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
   - **Add note:** Build telemetry is separate from game telemetry

2. **docs/developer-workflow/implementation-order-automation.md**
   - Document Stage 2 telemetry integration
   - Link to observability dashboard (if created)
   - **Add note:** Build telemetry uses `scripts/shared/build-telemetry.mjs`

3. **NEW: docs/developer-workflow/build-telemetry.md**
   - **Document separation:** Build vs game telemetry
   - `scripts/shared/build-telemetry.mjs` (CI/automation events)
   - `shared/src/telemetry.ts` (game domain events only)
   - Event naming conventions (prefix with `build.` for automation)
   - Application Insights custom dimensions for filtering

4. **README.md**
   - Note telemetry configuration requirement
   - Link to observability documentation
   - **Clarify:** Two separate telemetry systems (build + game)

## Rollback Procedure

If telemetry causes issues:
1. Remove telemetry emission from schedule-roadmap.mjs (comment out trackScheduleVariance calls)
2. Telemetry helper functions remain (no-op)
3. Re-enable after fixing with updated logic
4. Historical telemetry data preserved in Application Insights

## Dependencies

- Sub-issue #1 (Duration Estimation Module)
- Sub-issue #3 (Provisional Storage) - need provisional data to compare
- Application Insights connection string (secret)
- **New module:** `scripts/shared/build-telemetry.mjs` (separate from game telemetry)

## Estimated Duration

2 days

## Notes

- Telemetry is non-blocking; failures should be logged but not halt scheduling
- Consider sampling if event volume becomes high (>1000 events/day)
- Application Insights has daily ingestion limits (varies by plan)
- Keep event payload under 8KB (not an issue with current schema)
- Future: Add custom metrics for Grafana/Prometheus if needed
