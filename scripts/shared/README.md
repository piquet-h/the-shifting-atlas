# Shared Automation Scripts (Deprecated Components)

Most automation related to implementation ordering, provisional scheduling, variance calculation, and DI suitability has been deprecated and the underlying scripts stubbed. This README now serves only as a historical pointer; active gameplay / platform code no longer depends on these modules.

## Modules

### Duration Estimation

**File:** `duration-estimation.mjs`

Historical duration analysis and estimation for provisional scheduling.

**Exports:**

- `buildHistoricalDurations(projectItems, startFieldName, targetFieldName)` - Build duration samples from closed issues
- `computeMedians(historicalDurations)` - Calculate median durations by grouping
- `chooseDuration(medians, scope, type, fallback)` - Select duration using fallback hierarchy
- `estimateDuration(projectItems, scope, type, options)` - Complete estimation with confidence
- `DEFAULT_DURATION_DAYS` - Fallback duration constant (2 days)
- `MIN_SAMPLE_SIZE` - Sample thresholds for confidence levels

**Confidence Thresholds:**

- High: ≥5 samples for exact scope|type
- Medium: ≥3 samples for scope OR ≥10 global
- Low: Fallback to DEFAULT_DURATION_DAYS

**Usage:**

```javascript
import { estimateDuration } from './shared/duration-estimation.mjs'

const estimation = estimateDuration(projectItems, 'scope:core', 'feature')
// => { duration: 4, confidence: 'high', basis: 'scope-type', sampleSize: 7, metadata: {...} }
```

---

### (Deprecated) Provisional Comments

**File:** `provisional-comment.mjs`

Generate and manage provisional schedule comments on issues.

**Exports:**

- `generateProvisionalComment(data)` - Generate comment markdown with all substitutions
- `findProvisionalComment(comments)` - Find existing provisional comment by marker
- `shouldPostProvisionalComment(confidence, state)` - Determine if comment should be posted
- `generateBasisDescription(...)` - Format estimation basis for comment
- `PROVISIONAL_MARKER` - Canonical marker `<!-- PROVISIONAL_SCHEDULE:v1 -->`

**Comment Format:**

```markdown
<!-- PROVISIONAL_SCHEDULE:v1 -->

## 📅 Provisional Schedule (Automated)

**Estimated Start:** 2025-01-15
**Estimated Finish:** 2025-01-18
**Duration:** 4 days
**Implementation Order:** #42

### Estimation Basis

- **Confidence:** High
- **Sample Size:** 7 similar issues
- **Basis:** Median of 7 scope:core+feature issues (4 days)
  ...
```

**Usage:**

```javascript
import { generateProvisionalComment, shouldPostProvisionalComment } from './shared/provisional-comment.mjs'

if (shouldPostProvisionalComment(confidence, issueState)) {
    const commentBody = generateProvisionalComment({
        startDate: '2025-01-15',
        finishDate: '2025-01-18',
        duration: 4,
        order: 42,
        confidence: 'high',
        sampleSize: 7,
        basis: 'scope-type',
        scope: 'scope:core',
        type: 'feature'
    })
    // Post or update comment...
}
```

---

### (Deprecated) Provisional Storage

**File:** `provisional-storage.mjs`

GitHub Projects v2 custom field operations for provisional schedule data.

**Exports:**

- `getProjectId(owner, projectNumber, ownerType)` - Get project ID
- `getProjectFields(projectId)` - Fetch all project fields
- `setDateField(projectId, itemId, fieldId, date)` - Set date field value
- `setSingleSelectField(projectId, itemId, fieldId, optionId)` - Set single select value
- `setTextField(projectId, itemId, fieldId, text)` - Set text field value
- `updateProvisionalSchedule(projectId, itemId, scheduleData)` - Update all provisional fields
- `getProvisionalSchedule(itemId)` - Get provisional schedule for an item

**Custom Fields:**

- `Provisional Start` (Date)
- `Provisional Finish` (Date)
- `Provisional Confidence` (Single select: High/Medium/Low)
- `Estimation Basis` (Text)

**Usage:**

```javascript
import { getProjectId, updateProvisionalSchedule } from './shared/provisional-storage.mjs'

const projectId = await getProjectId('piquet-h', 3, 'user')
await updateProvisionalSchedule(projectId, itemId, {
    start: '2025-01-15',
    finish: '2025-01-18',
    confidence: 'high',
    basis: 'Median of 7 scope:core+feature issues'
})
```

---

### (Scoped) Build Telemetry

**File:** `build-telemetry.mjs`

Telemetry for build automation events (separate from game telemetry).

**Exports:**

- `initBuildTelemetry()` - Initialize build telemetry (GitHub artifacts mode)
- `trackScheduleVariance(data)` - Track variance between provisional and actual
- `trackProvisionalCreated(data)` - Track provisional schedule creation
- `trackVarianceAlert(data)` - Track variance alert events
- `isBuildTelemetryEnabled()` - Check if telemetry is active (always true)
- `getBufferedEvents()` - Get event buffer (for artifacts)
- `flushBuildTelemetry(artifactPath)` - Flush events to artifact file

**Event Names:**

- `build.schedule_variance` - Variance comparison
- `build.provisional_schedule_created` - Provisional created
- `build.variance_alert` - Alert created/updated/closed

**Separation from Game Telemetry:**

- Build events use `build.` prefix
- Custom dimension: `telemetrySource: 'build-automation'`
- Module located in `scripts/` (not `shared/src/`)
- **Application Insights is ONLY for game telemetry**
- Build telemetry stays within GitHub ecosystem (logs + artifacts)
- Game telemetry: `shared/src/telemetry.ts` (domain events only)

**Usage:**

```javascript
import { initBuildTelemetry, trackProvisionalCreated, flushBuildTelemetry } from './shared/build-telemetry.mjs'

initBuildTelemetry() // Call once at startup

trackProvisionalCreated({
    issueNumber: 123,
    implementationOrder: 42,
    provisionalStart: '2025-01-15',
    provisionalFinish: '2025-01-18',
    duration: 4,
    confidence: 'high',
    sampleSize: 7,
    basis: 'scope-type'
})

// At end of script, optionally flush to artifact
await flushBuildTelemetry(process.env.TELEMETRY_ARTIFACT)
```

---

## Architecture Principles (Updated)

### Telemetry Separation

**Critical Rule:** Build automation and game domain telemetry are strictly separated.

- **Build telemetry:** `scripts/shared/build-telemetry.mjs`
    - Purpose: CI/automation events (limited — legacy scheduler/ordering/variance events no longer produced)
    - Prefix: `build.`
    - Destination: GitHub Actions logs + artifacts
    - **Does NOT use Application Insights**

- **Game telemetry:** `shared/src/telemetry.ts`
    - Purpose: Game domain events (player, world, navigation)
    - Destination: Application Insights
    - Location: `shared/` folder (exclusively for game code)

**Rationale:** Prevents mixing infrastructure and domain concerns, ensures clean separation of build and runtime telemetry. Application Insights is reserved exclusively for game events.

### Module Design

- **ES Modules:** All scripts use `import`/`export` (`.mjs` extension)
- **Single Responsibility:** Each module focuses on one concern
- **Composable:** Modules can be combined in scripts and workflows
- **Testable:** Functions are pure where possible, side effects isolated
- **Graceful Degradation:** Features degrade gracefully if optional dependencies unavailable

### Environment Variables

All modules respect these environment variables:

- `GITHUB_TOKEN` / `GH_TOKEN` - GitHub API authentication (required)
- `PROJECT_OWNER` - Project owner (default: 'piquet-h')
- `PROJECT_NUMBER` - Project number (default: 3)
- `TELEMETRY_ARTIFACT` - Path to write build telemetry artifact (optional)

Build telemetry uses GitHub-native features (logs + artifacts). Application Insights is reserved exclusively for game telemetry.

## Testing

Modules are designed for testability:

1. **Dry-run mode:** Scripts default to dry-run, showing what would happen
2. **Apply flag:** Use `--apply` to execute changes
3. **Artifact export:** Use `--artifact` to save decision data
4. **Console fallback:** Telemetry falls back to console if AppInsights unavailable

Historical usage examples removed; associated scripts are deprecated.

## Related Documentation

Legacy Stage 2 scheduling documentation references retained in version control history but no longer active.

---

_Last updated: 2025-10-06 – legacy automation deprecated_
