# Sub-Issue 3: Specify Provisional Data Storage Schema

**Parent Issue:** #83 - Automation Stage 2: Predictive Scheduling Integration  
**Labels:** `docs`, `enhancement`, `scope:devx`, `M0`  
**Milestone:** M0 Foundation

## Context

Provisional schedule data must be stored in machine-readable format to enable variance calculation and tracking. This storage must be separate from the visible Project fields (Start/Finish) which represent the authoritative daily scheduler output.

## Decision: Storage Location

**Decision: Use GitHub Projects v2 Custom Fields.**

GitHub Projects v2 natively supports custom fields ([official documentation](https://docs.github.com/en/issues/planning-and-tracking-with-projects/understanding-fields)), making them the correct choice for provisional schedule data.

### Option Comparison

| Option                   | Pros                                                       | Cons                                             | Decision                                 |
| ------------------------ | ---------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------- |
| **Project custom field** | Native, queryable, survives issue moves, no file conflicts | Requires GraphQL API, limited to Project context | **✅ SELECTED**                          |
| **Repo artifact**        | Version controlled, auditable, simple                      | Requires file commits, potential conflicts       | ❌ Not needed - custom fields sufficient |
| **Issue metadata**       | Native to issue                                            | No custom fields on issues (only on Projects)    | ❌ Not available                         |
| **External DB**          | Scalable, flexible                                         | Adds infrastructure dependency                   | ❌ Overkill                              |

### Implementation: GitHub Projects v2 Custom Fields

**Location:** Custom fields on Project items in Project #3

**Custom Fields to Add:**

- `Provisional Start` (Date field)
- `Provisional Finish` (Date field)
- `Provisional Confidence` (Single select: High/Medium/Low)
- `Estimation Basis` (Text field)

**Rationale:**

- GitHub Projects v2 natively supports custom fields
- Native integration with existing Start/Finish fields
- No file conflicts or merge issues
- Queryable via GraphQL API
- Survives issue reorganization
- Clean separation from authoritative schedule fields

**Note:** A repo file approach (`roadmap/provisional-schedules.json`) was considered but is unnecessary given native custom field support.

## Storage Schema

### Primary: GitHub Projects v2 Custom Fields

**Custom Fields on Project Items:**

| Field Name               | Type          | Values                                | Purpose                                  |
| ------------------------ | ------------- | ------------------------------------- | ---------------------------------------- |
| `Provisional Start`      | Date          | YYYY-MM-DD                            | Estimated start date from ordering time  |
| `Provisional Finish`     | Date          | YYYY-MM-DD                            | Estimated finish date from ordering time |
| `Provisional Confidence` | Single Select | High / Medium / Low                   | Confidence level of estimate             |
| `Estimation Basis`       | Text          | e.g., "7 scope:core\|feature samples" | Human-readable basis description         |

**GraphQL Access:**

```graphql
query GetProvisionalSchedule($itemId: ID!) {
    node(id: $itemId) {
        ... on ProjectV2Item {
            fieldValueByName(name: "Provisional Start") {
                ... on ProjectV2ItemFieldDateValue {
                    date
                }
            }
            provisionalFinish: fieldValueByName(name: "Provisional Finish") {
                ... on ProjectV2ItemFieldDateValue {
                    date
                }
            }
            provisionalConfidence: fieldValueByName(name: "Provisional Confidence") {
                ... on ProjectV2ItemFieldSingleSelectValue {
                    name
                }
            }
            estimationBasis: fieldValueByName(name: "Estimation Basis") {
                ... on ProjectV2ItemFieldTextValue {
                    text
                }
            }
        }
    }
}
```

**Setting Values:**

```graphql
mutation SetProvisionalSchedule($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: ProjectV2FieldValue!) {
    updateProjectV2ItemFieldValue(input: { projectId: $projectId, itemId: $itemId, fieldId: $fieldId, value: $value }) {
        projectV2Item {
            id
        }
    }
}
```

## Custom Field Operations

**Script:** `scripts/shared/provisional-storage.mjs`

```javascript
export async function updateProvisionalSchedule(itemId, scheduleData) {
    const projectId = await getProjectId()
    const fields = await getProjectFields(projectId)

    // Get field IDs
    const provisionalStartField = fields.find((f) => f.name === 'Provisional Start')
    const provisionalFinishField = fields.find((f) => f.name === 'Provisional Finish')
    const confidenceField = fields.find((f) => f.name === 'Provisional Confidence')
    const basisField = fields.find((f) => f.name === 'Estimation Basis')

    // Set custom field values
    await setProjectFieldValue(projectId, itemId, provisionalStartField.id, {
        date: scheduleData.start
    })
    await setProjectFieldValue(projectId, itemId, provisionalFinishField.id, {
        date: scheduleData.finish
    })

    // Set confidence (single select)
    const confidenceOption = confidenceField.options.find((o) => o.name.toLowerCase() === scheduleData.confidence)
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

## Variance Tracking

Variance data will be calculated by comparing provisional custom fields against actual Start/Finish fields set by the daily scheduler.

**Variance Calculation:**

- Read provisional values from custom fields (Provisional Start, Provisional Finish)
- Read actual values from standard fields (Start, Finish)
- Compute deltas and store results (implementation details in sub-issue #4)

**Storage approach for variance metrics:** To be determined in sub-issue #4 (may use additional custom fields or separate tracking mechanism).

## Integration Points

### 1. Ordering Assignment (auto-assign-impl-order.yml)

After order assignment, set provisional custom fields:

```yaml
- name: Set Provisional Schedule Fields
  if: steps.assign.outputs.applied == 'true'
  run: |
      node scripts/set-provisional-fields.mjs \
        --item-id ${{ steps.assign.outputs.item_id }} \
        --start ${{ steps.assign.outputs.provisional_start }} \
        --finish ${{ steps.assign.outputs.provisional_finish }} \
        --confidence ${{ steps.assign.outputs.confidence }} \
        --basis "${{ steps.assign.outputs.basis_description }}"
```

### 2. Daily Scheduler (roadmap-scheduler.yml)

Scheduler sets actual Start/Finish fields (no change needed - these are existing fields).

### 3. Variance Calculator (new workflow)

Periodic job to compute variance by reading both provisional and actual fields:

```yaml
- name: Calculate Variance
  run: npm run calculate:variance
```

## Acceptance Criteria

- [ ] Custom field names specified (Provisional Start, Provisional Finish, Provisional Confidence, Estimation Basis)
- [ ] GraphQL API examples provided for reading/writing custom fields
- [ ] Field types documented (Date, Date, Single Select, Text)
- [ ] Custom field operations defined and implemented
- [ ] Query functions implemented and tested
- [ ] Integration points with workflows identified
- [ ] Variance tracking approach specified

## Testing Strategy

### Unit Tests

**Location:** `scripts/shared/provisional-storage.test.mjs`

Test cases:

1. Set custom field values (Provisional Start, Finish, Confidence, Basis)
2. Read custom field values for a project item
3. Query items by confidence level
4. Validate field value formats
5. Handle missing custom fields (field not yet created in project)
6. Handle API errors gracefully

### Integration Tests

1. Full workflow: assign order → set provisional fields → scheduler runs → read actual dates → calculate variance
2. Verify custom fields are properly set in Project
3. Validate field values are queryable via GraphQL
4. Check field values persist across workflow runs

## Documentation Impact

### Files to Update

1. **docs/developer-workflow/implementation-order-automation.md**
    - Add "Provisional Data Storage" section
    - Document custom fields approach
    - Explain lifecycle (provisional → actual → variance)

2. **docs/developer-workflow/roadmap-scheduling.md**
    - Note integration with provisional custom fields
    - Explain relationship between provisional and actual fields

3. **README.md**
    - Document required Project custom fields
    - Link to GitHub custom fields documentation

## Rollback Procedure

If custom fields cause issues:

1. Stop setting provisional custom field values (disable workflow steps)
2. Custom fields remain in Project but aren't actively used
3. Can remove custom fields from Project if needed
4. Re-enable after fixing with any necessary adjustments

## Dependencies

- Sub-issue #1 (Duration Estimation Module)
- Sub-issue #2 (Comment Format) - provisional comment references this data

## Estimated Duration

3 days

## Notes

- Custom fields are native to GitHub Projects v2 (officially supported)
- No file size concerns (fields are stored by GitHub)
- Clean separation from authoritative Start/Finish fields
- Can add additional custom fields in future without breaking existing ones
