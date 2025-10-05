# Sub-Issue 1: Extract Duration Estimation as Shared Module

**Parent Issue:** #83 - Automation Stage 2: Predictive Scheduling Integration  
**Labels:** `scope:devx`, `refactor`, `M0`  
**Milestone:** M0 Foundation

## Context

The `schedule-roadmap.mjs` script contains duration estimation logic that needs to be extracted into a reusable module. This will allow the ordering assignment workflow to provide provisional schedules at ordering time without duplicating estimation logic.

## Current State

Duration estimation logic exists in `scripts/schedule-roadmap.mjs`:

- **Function:** `buildHistoricalDurations(projectItems, startFieldName, targetFieldName)`
    - Lines: 155-190
    - Computes durations from closed issues (Start/Finish fields or createdAt/closedAt)
    - Groups by `scope|type`, scope-only, and global
- **Function:** `chooseDuration(medians, scope, type, fallback)`
    - Lines: 253-259
    - Selects median with fallback hierarchy
- **Function:** `median(nums)`
    - Lines: 118-123
    - Standard median calculation
- **Constants:**
    - `DEFAULT_DURATION_DAYS = 2`

## Requirements

### 1. Create Shared Module

**Location:** `scripts/shared/duration-estimation.mjs`

**Exports:**

```javascript
export { buildHistoricalDurations, computeMedians, chooseDuration, estimateDuration, DEFAULT_DURATION_DAYS, MIN_SAMPLE_SIZE }
```

### 2. Function Specifications

#### `buildHistoricalDurations(projectItems, startFieldName, targetFieldName)`

Extract as-is from schedule-roadmap.mjs.

**Returns:**

```javascript
{
    byKey: Map<string, number[]>,    // 'scope:core|feature' -> [3,4,5,...]
    byScope: Map<string, number[]>,  // 'scope:core' -> [2,3,4,...]
    all: number[]                     // [1,2,3,4,5,...]
}
```

#### `computeMedians(historicalDurations)`

New function that computes medians from historical durations.

**Returns:**

```javascript
{
    byKey: Map<string, number>,      // 'scope:core|feature' -> 3.5
    byScope: Map<string, number>,    // 'scope:core' -> 4.2
    global: number                    // 3.8
}
```

#### `chooseDuration(medians, scope, type, fallback)`

Extract as-is from schedule-roadmap.mjs.

**Returns:** `number` - chosen duration in days

#### `estimateDuration(projectItems, scope, type, options = {})`

New convenience function that combines the above.

**Parameters:**

```javascript
{
    projectItems,        // Array of project items
    scope,              // 'scope:core', etc.
    type,               // 'feature', 'enhancement', etc.
    options: {
        startFieldName: 'Start',
        targetFieldName: 'Finish',
        fallback: DEFAULT_DURATION_DAYS,
        minSamples: MIN_SAMPLE_SIZE
    }
}
```

**Returns:**

```javascript
{
    duration: number,           // Estimated duration in days
    confidence: string,         // 'high', 'medium', 'low'
    basis: string,              // 'scope-type', 'scope', 'global', 'fallback'
    sampleSize: number,         // Number of samples used
    metadata: {
        scope,
        type,
        medianByKey: number | null,
        medianByScope: number | null,
        globalMedian: number | null
    }
}
```

**Confidence Levels:**

- **High:** ≥5 samples for exact scope|type key
- **Medium:** ≥3 samples for scope-only OR ≥10 samples globally
- **Low:** Fallback to DEFAULT_DURATION_DAYS

### 3. Constants

```javascript
export const DEFAULT_DURATION_DAYS = 2
export const MIN_SAMPLE_SIZE = 3 // Minimum samples before using a median
```

### 4. Utility Functions

Keep private (not exported):

- `median(nums)` - median calculation
- `classifyIssue(issue)` - extract scope/type from labels (if needed)

### 5. Unit Tests

**Location:** `scripts/shared/duration-estimation.test.mjs`

Test cases:

1. **buildHistoricalDurations**
    - Handles issues with Start/Finish fields
    - Falls back to createdAt/closedAt
    - Groups correctly by scope|type, scope, global
    - Ignores non-CLOSED issues
    - Handles missing dates gracefully

2. **computeMedians**
    - Calculates correct median for odd/even length arrays
    - Handles empty arrays (returns 0)
    - Preserves grouping structure

3. **chooseDuration**
    - Selects scope|type median if available
    - Falls back to scope median
    - Falls back to global median
    - Uses fallback when all are empty

4. **estimateDuration**
    - Returns high confidence with sufficient scope|type samples
    - Returns medium confidence with scope or global samples
    - Returns low confidence with fallback
    - Provides correct basis string
    - Includes all metadata

### 6. Update schedule-roadmap.mjs

Replace inline implementations with imports:

```javascript
import { buildHistoricalDurations, computeMedians, chooseDuration, DEFAULT_DURATION_DAYS } from './shared/duration-estimation.mjs'
```

Verify no functional change:

```bash
npm run schedule:roadmap -- dry-run
# Should produce identical output to pre-refactor
```

## Acceptance Criteria

- [ ] Module created at `scripts/shared/duration-estimation.mjs`
- [ ] All functions extracted with documented exports
- [ ] Unit tests achieve ≥90% coverage for new module
- [ ] `schedule-roadmap.mjs` imports and uses module functions
- [ ] Dry-run output unchanged from baseline (regression test)
- [ ] Constants documented with rationale for thresholds
- [ ] JSDoc comments for all exported functions
- [ ] MIN_SAMPLE_SIZE threshold documented with examples

## Technical Specifications

### Duration Calculation Units

**Calendar days** (not working days). Weekend/holiday handling deferred to Stage 3.

### Fallback Hierarchy

Explicit order with minimum sample requirements:

1. **Exact key** (`scope|type`): Requires ≥5 samples
2. **Scope-only**: Requires ≥3 samples
3. **Global median**: Requires ≥10 samples
4. **Fallback constant**: DEFAULT_DURATION_DAYS (2 days)

### Sample Size Rationale

- 5 for scope|type: Ensures median is representative of specific work
- 3 for scope: Broader category, less precision needed
- 10 for global: High threshold prevents noisy early estimates

## Rollback Procedure

If extraction causes issues:

1. Revert commits introducing the module
2. Keep tests for future re-attempt
3. Document discovered issues in parent #83

## Dependencies

None - purely internal refactoring.

## Estimated Duration

3 days (based on similar refactoring tasks)

## Notes

- Keep helper functions like `wholeDayDiff()`, `extractFieldValue()` in schedule-roadmap.mjs for now (may be extracted in future refactoring)
- Focus on duration estimation only; scheduling logic stays in schedule-roadmap.mjs
- Version the module with a comment header indicating it's v1 for Stage 2
