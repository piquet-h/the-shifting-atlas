# Sub-Issue 3: Specify Provisional Data Storage Schema

**Parent Issue:** #83 - Automation Stage 2: Predictive Scheduling Integration  
**Labels:** `docs`, `enhancement`, `scope:devx`, `M0`  
**Milestone:** M0 Foundation

## Context

Provisional schedule data must be stored in machine-readable format to enable variance calculation and tracking. This storage must be separate from the visible Project fields (Start/Finish) which represent the authoritative daily scheduler output.

## Decision: Storage Location

After evaluating options, **recommendation: GitHub Projects v2 Custom Fields (primary) with repo file fallback**.

### Option Comparison

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| **Project custom field** | Native, queryable, survives issue moves, no file conflicts | Requires GraphQL API, limited to Project context | **Selected for Stage 2** |
| **Repo artifact** | Version controlled, auditable, simple | Requires file commits, potential conflicts | **Fallback if custom fields insufficient** |
| **Issue metadata** | Native to issue | No custom fields on issues (only on Projects) | Not available |
| **External DB** | Scalable, flexible | Adds infrastructure dependency | Overkill for Stage 2 |

### Selected Approach: GitHub Projects v2 Custom Fields

**Location:** Custom fields on Project items in Project #3

**Custom Fields to Add:**
- `Provisional Start` (Date field)
- `Provisional Finish` (Date field)
- `Provisional Confidence` (Single select: High/Medium/Low)
- `Estimation Basis` (Text field)

**Rationale:**
- GitHub Projects v2 supports custom fields ([documentation](https://docs.github.com/en/issues/planning-and-tracking-with-projects/understanding-fields))
- Native integration with existing Start/Finish fields
- No file conflicts or merge issues
- Queryable via GraphQL API
- Survives issue reorganization
- Clean separation from authoritative schedule fields

**Fallback:** If custom fields prove insufficient (e.g., need nested JSON), fall back to `roadmap/provisional-schedules.json` as secondary storage

## Storage Schema

### Primary: GitHub Projects v2 Custom Fields

**Custom Fields on Project Items:**

| Field Name | Type | Values | Purpose |
|------------|------|--------|---------|
| `Provisional Start` | Date | YYYY-MM-DD | Estimated start date from ordering time |
| `Provisional Finish` | Date | YYYY-MM-DD | Estimated finish date from ordering time |
| `Provisional Confidence` | Single Select | High / Medium / Low | Confidence level of estimate |
| `Estimation Basis` | Text | e.g., "7 scope:core\|feature samples" | Human-readable basis description |

**GraphQL Access:**

```graphql
query GetProvisionalSchedule($itemId: ID!) {
  node(id: $itemId) {
    ... on ProjectV2Item {
      fieldValueByName(name: "Provisional Start") {
        ... on ProjectV2ItemFieldDateValue { date }
      }
      provisionalFinish: fieldValueByName(name: "Provisional Finish") {
        ... on ProjectV2ItemFieldDateValue { date }
      }
      provisionalConfidence: fieldValueByName(name: "Provisional Confidence") {
        ... on ProjectV2ItemFieldSingleSelectValue { name }
      }
      estimationBasis: fieldValueByName(name: "Estimation Basis") {
        ... on ProjectV2ItemFieldTextValue { text }
      }
    }
  }
}
```

**Setting Values:**

```graphql
mutation SetProvisionalSchedule($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: ProjectV2FieldValue!) {
  updateProjectV2ItemFieldValue(
    input: {
      projectId: $projectId
      itemId: $itemId
      fieldId: $fieldId
      value: $value
    }
  ) {
    projectV2Item { id }
  }
}
```

### Fallback: Repository File (if custom fields insufficient)

**Location:** `roadmap/provisional-schedules.json`

**File Structure:**

```json
{
    "version": "1.0.0",
    "generatedAt": "2025-01-10T14:23:15Z",
    "description": "Provisional schedule assignments (fallback storage if custom fields insufficient)",
    "schedules": {
        "123": {
            "issueNumber": 123,
            "order": 42,
            "provisional": {
                "start": "2025-01-15",
                "finish": "2025-01-18",
                "duration": 4,
                "calculatedAt": "2025-01-10T14:23:15Z",
                "confidence": "high",
                "basis": "scope-type",
                "sampleSize": 7
            },
            "metadata": {
                "scope": "scope:core",
                "type": "feature",
                "milestone": "M0",
                "strategy": "auto"
            },
            "estimation": {
                "medianByKey": 4.0,
                "medianByScope": 3.5,
                "globalMedian": 3.2,
                "fallback": 2,
                "used": "medianByKey"
            },
            "actual": null,
            "variance": null
        }
    },
    "stats": {
        "totalIssues": 1,
        "highConfidence": 1,
        "mediumConfidence": 0,
        "lowConfidence": 0,
        "averageDuration": 4.0
    }
}
```

### Schema Definition (Fallback File)

#### Root Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | string | Yes | Schema version (semver) |
| `generatedAt` | string | Yes | ISO 8601 timestamp of last update |
| `description` | string | Yes | Human-readable file purpose |
| `schedules` | object | Yes | Map of issue number (string) to schedule record |
| `stats` | object | Yes | Aggregate statistics |

#### Schedule Record

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `issueNumber` | number | Yes | GitHub issue number |
| `order` | number | Yes | Implementation order value |
| `provisional` | object | Yes | Provisional schedule details |
| `metadata` | object | Yes | Issue classification metadata |
| `estimation` | object | Yes | Full estimation breakdown |
| `actual` | object \| null | No | Actual dates from daily scheduler (updated later) |
| `variance` | object \| null | No | Variance metrics (computed after actual scheduling) |

#### Provisional Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `start` | string | Yes | ISO date (YYYY-MM-DD) |
| `finish` | string | Yes | ISO date (YYYY-MM-DD) |
| `duration` | number | Yes | Estimated duration in days |
| `calculatedAt` | string | Yes | ISO 8601 timestamp |
| `confidence` | string | Yes | 'high' \| 'medium' \| 'low' |
| `basis` | string | Yes | 'scope-type' \| 'scope' \| 'global' \| 'fallback' |
| `sampleSize` | number | Yes | Number of historical samples used |

#### Metadata Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `scope` | string | Yes | Scope label (e.g., 'scope:core') |
| `type` | string | Yes | Type label (e.g., 'feature') |
| `milestone` | string | No | Milestone title (e.g., 'M0') |
| `strategy` | string | Yes | Assignment strategy used ('auto', 'append', 'scope-block') |

#### Estimation Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `medianByKey` | number \| null | Yes | Median for scope\|type combination |
| `medianByScope` | number \| null | Yes | Median for scope only |
| `globalMedian` | number \| null | Yes | Global median across all issues |
| `fallback` | number | Yes | Fallback duration constant |
| `used` | string | Yes | Which median was actually used |

#### Actual Object (populated by daily scheduler)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `start` | string | Yes | Actual start date from Project field |
| `finish` | string | Yes | Actual finish date from Project field |
| `duration` | number | Yes | Actual scheduled duration |
| `updatedAt` | string | Yes | ISO 8601 timestamp of last scheduler run |
| `reason` | string | Yes | Scheduler reason code (e.g., 'new', 'rebaseline') |

#### Variance Object (computed after scheduling)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `startDelta` | number | Yes | Days difference (actual - provisional) |
| `finishDelta` | number | Yes | Days difference (actual - provisional) |
| `durationDelta` | number | Yes | Duration difference (actual - provisional) |
| `startDeltaPct` | number | Yes | Start variance as percentage |
| `finishDeltaPct` | number | Yes | Finish variance as percentage |
| `overallVariance` | number | Yes | Combined metric (see sub-issue #4) |
| `calculatedAt` | string | Yes | ISO 8601 timestamp |

#### Stats Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `totalIssues` | number | Yes | Total issues with provisional schedules |
| `highConfidence` | number | Yes | Count of high confidence estimates |
| `mediumConfidence` | number | Yes | Count of medium confidence estimates |
| `lowConfidence` | number | Yes | Count of low confidence estimates |
| `averageDuration` | number | Yes | Mean of all provisional durations |

## File Operations

### Primary: Custom Field Operations

**Script:** `scripts/shared/provisional-storage.mjs`

```javascript
export async function updateProvisionalSchedule(itemId, scheduleData) {
    const projectId = await getProjectId()
    const fields = await getProjectFields(projectId)
    
    // Get field IDs
    const provisionalStartField = fields.find(f => f.name === 'Provisional Start')
    const provisionalFinishField = fields.find(f => f.name === 'Provisional Finish')
    const confidenceField = fields.find(f => f.name === 'Provisional Confidence')
    const basisField = fields.find(f => f.name === 'Estimation Basis')
    
    // Set custom field values
    await setProjectFieldValue(projectId, itemId, provisionalStartField.id, {
        date: scheduleData.start
    })
    await setProjectFieldValue(projectId, itemId, provisionalFinishField.id, {
        date: scheduleData.finish
    })
    
    // Set confidence (single select)
    const confidenceOption = confidenceField.options.find(
        o => o.name.toLowerCase() === scheduleData.confidence
    )
    await setProjectFieldValue(projectId, itemId, confidenceField.id, {
        singleSelectOptionId: confidenceOption.id
    })
    
    // Set estimation basis (text)
    const basisText = generateBasisDescription(
        scheduleData.confidence,
        scheduleData.sampleSize,
        scheduleData.basis,
        scheduleData.scope,
        scheduleData.type,
        scheduleData.duration
    )
    await setProjectFieldValue(projectId, itemId, basisField.id, {
        text: basisText
    })
}
```

### Fallback: File Operations (if custom fields insufficient)

**Script:** `scripts/shared/provisional-storage.mjs`

```javascript
export async function updateProvisionalSchedule(issueNumber, scheduleData) {
    const filePath = 'roadmap/provisional-schedules.json'
    const data = await loadProvisionalSchedules()
    
    data.schedules[String(issueNumber)] = {
        issueNumber,
        order: scheduleData.order,
        provisional: {
            start: scheduleData.start,
            finish: scheduleData.finish,
            duration: scheduleData.duration,
            calculatedAt: new Date().toISOString(),
            confidence: scheduleData.confidence,
            basis: scheduleData.basis,
            sampleSize: scheduleData.sampleSize
        },
        metadata: scheduleData.metadata,
        estimation: scheduleData.estimation,
        actual: null,
        variance: null
    }
    
    data.generatedAt = new Date().toISOString()
    updateStats(data)
    
    await saveProvisionalSchedules(data)
}
```

### Update Actual Schedule

**Called by daily scheduler:**

```javascript
export async function updateActualSchedule(issueNumber, actualData) {
    const data = await loadProvisionalSchedules()
    const key = String(issueNumber)
    
    if (!data.schedules[key]) {
        // Issue not in provisional tracking, skip
        return
    }
    
    data.schedules[key].actual = {
        start: actualData.start,
        finish: actualData.finish,
        duration: actualData.duration,
        updatedAt: new Date().toISOString(),
        reason: actualData.reason
    }
    
    // Compute variance
    data.schedules[key].variance = computeVariance(
        data.schedules[key].provisional,
        data.schedules[key].actual
    )
    
    data.generatedAt = new Date().toISOString()
    await saveProvisionalSchedules(data)
}
```

### Query Functions

```javascript
// Get all provisional schedules
export async function getAllProvisionalSchedules()

// Get single issue schedule
export async function getProvisionalSchedule(issueNumber)

// Get schedules by confidence level
export async function getSchedulesByConfidence(confidence)

// Get schedules with high variance
export async function getHighVarianceSchedules(threshold = 0.25)

// Get statistics
export async function getProvisionalStats()
```

## File Management

### Location
`roadmap/provisional-schedules.json`

### Initialization
If file doesn't exist, create with empty schedules:

```json
{
    "version": "1.0.0",
    "generatedAt": "2025-01-10T00:00:00Z",
    "description": "Provisional schedule assignments computed during implementation order automation",
    "schedules": {},
    "stats": {
        "totalIssues": 0,
        "highConfidence": 0,
        "mediumConfidence": 0,
        "lowConfidence": 0,
        "averageDuration": 0
    }
}
```

### Concurrent Access

**Problem:** Multiple workflow runs may update file simultaneously.

**Solution:** 
1. Use file locking pattern (for now: accept last-write-wins)
2. Stage 3: Consider moving to database if conflicts are frequent
3. Concurrency group in workflow prevents simultaneous ordering assignments

### Cleanup

**When to remove entries:**
- Issue closed AND variance calculated (after 7 days grace period)
- Issue removed from project
- Issue has no implementation order

**Script:** `npm run clean:provisional-schedules`

## Integration Points

### 1. Ordering Assignment (auto-assign-impl-order.yml)

After order assignment, update provisional schedule:

```yaml
- name: Store Provisional Schedule
  if: steps.assign.outputs.applied == 'true'
  run: |
    node scripts/update-provisional-schedule.mjs \
      --issue ${{ steps.issue.outputs.number }} \
      --order ${{ steps.assign.outputs.order }} \
      --start ${{ steps.assign.outputs.provisional_start }} \
      --finish ${{ steps.assign.outputs.provisional_finish }} \
      --data '${{ steps.assign.outputs.estimation_data }}'
```

### 2. Daily Scheduler (roadmap-scheduler.yml)

After scheduling, update actual dates:

```yaml
- name: Update Actual Schedules
  run: npm run update:actual-schedules
```

### 3. Variance Calculator (new workflow)

Periodic job to compute variance for all tracked issues:

```yaml
- name: Calculate Variance
  run: npm run calculate:variance
```

## Acceptance Criteria

- [ ] JSON schema fully specified with all required fields
- [ ] Schema version documented (1.0.0)
- [ ] Storage location decided (`roadmap/provisional-schedules.json`)
- [ ] CRUD operations defined and implemented
- [ ] File initialization logic implemented
- [ ] Stats aggregation function implemented
- [ ] Query functions implemented and tested
- [ ] Concurrent access strategy documented
- [ ] Cleanup strategy documented
- [ ] Integration points with workflows identified
- [ ] Example file with sample data provided
- [ ] Migration path to future storage solution documented

## Testing Strategy

### Unit Tests

**Location:** `scripts/shared/provisional-storage.test.mjs`

Test cases:
1. Create new entry
2. Update existing entry
3. Update actual schedule
4. Compute variance (delegate to sub-issue #4)
5. Query by confidence
6. Query by variance threshold
7. Stats aggregation
8. File initialization
9. Handle missing file
10. Handle corrupt JSON (graceful recovery)

### Integration Tests

1. Full workflow: assign order → store provisional → schedule → update actual → calculate variance
2. Verify file structure matches schema
3. Validate all timestamps in ISO 8601 format
4. Check stats accuracy

## Documentation Impact

### Files to Update

1. **docs/developer-workflow/implementation-order-automation.md**
   - Add "Provisional Data Storage" section
   - Document schema and file location
   - Explain lifecycle (provisional → actual → variance)

2. **docs/developer-workflow/roadmap-scheduling.md**
   - Note integration with provisional storage
   - Document `update:actual-schedules` npm script

3. **README.md**
   - Add provisional-schedules.json to gitignore consideration (or commit it)

## Rollback Procedure

If storage causes issues:
1. Stop updating file (disable workflow steps)
2. File remains for audit but isn't actively used
3. Delete file if needed: `rm roadmap/provisional-schedules.json`
4. Re-initialize with fixes and version bump (1.1.0)

## Dependencies

- Sub-issue #1 (Duration Estimation Module)
- Sub-issue #2 (Comment Format) - provisional comment references this storage

## Estimated Duration

3 days

## Notes

- File size: ~1KB per issue, ~100 issues = 100KB (negligible)
- Consider compressing old entries after 90 days
- Future: Migrate to issue custom fields when GitHub supports them
- Schema designed for forward compatibility (can add fields without breaking)
