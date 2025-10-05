# Stage 1 Ordering Telemetry & Metrics Completion

## Summary

This implementation completes the revised Stage 1 specification for ordering automation telemetry (#104), adding granular event tracking with strict separation from game domain telemetry.

## Implementation Details

### New Granular Events

Added to `scripts/shared/build-telemetry.mjs`:

```javascript
// Stage 1 ordering events (granular nested structure)
ASSIGN_ATTEMPT: 'build.ordering.assign.attempt',
ASSIGN_APPLY: 'build.ordering.assign.apply',
ASSIGN_SKIP: 'build.ordering.assign.skip',
CONFIDENCE_LOW: 'build.ordering.confidence.low',
OVERRIDE_DETECTED: 'build.ordering.override.detected',
INTEGRITY_SNAPSHOT: 'build.ordering.integrity.snapshot',
METRICS_WEEKLY: 'build.ordering.metrics.weekly'
```

### Helper Function

```javascript
emitOrderingEvent(name, props)
```
- Automatically prefixes event names with `build.ordering.`
- Adds standard metadata (timestamp, telemetrySource, telemetryType, stage)
- Logs to console and buffers for artifact export

### Script Updates

1. **assign-impl-order.mjs**
   - Emits `assign.attempt` before processing
   - Emits `assign.apply` on successful application (with durationMs)
   - Emits `assign.skip` for dry-run, no-op, or low-confidence blocks
   - Emits `confidence.low` when confidence is medium/low
   - Posts GitHub comment explaining recommendation for medium/low confidence (apply mode only)
   - Tracks timing for performance metrics

2. **check-ordering-integrity.mjs**
   - Emits `integrity.snapshot` with:
     - `totalIssues`: count of ordered issues
     - `gaps`: array of missing order numbers
     - `duplicates`: array of duplicate order numbers
     - `isContiguous`: boolean result
   - Exits non-zero on violations

3. **detect-ordering-overrides.mjs**
   - Emits `override.detected` when manual changes occur within 24h
   - Includes both legacy and new granular events

4. **weekly-ordering-metrics.mjs**
   - Emits `metrics.weekly` with aggregated statistics:
     - Total processed
     - Confidence breakdown (high/medium/low)
     - Applied percentage
     - Override rate
     - Low confidence percentage

### New Scripts

**validate-artifact-schema.mjs**
- Validates artifact JSON files match expected schema
- Checks for required keys: `issue`, `recommendedOrder`, `confidence`, `score`, `metadata`
- Detects extraneous keys
- Validates types and metadata structure
- Fails CI on violations

### Event Flow

```
assign.attempt
  ↓
  ├─→ (high confidence + apply) → assign.apply
  ├─→ (medium/low confidence) → confidence.low → assign.skip (reason: lowConfidence)
  ├─→ (dry-run) → assign.skip (reason: dryRun)
  └─→ (no changes) → assign.skip (reason: alreadyOrdered)
```

### Artifact Schema

```json
{
  "issue": 123,
  "recommendedOrder": 42,
  "confidence": "high|medium|low",
  "score": 150,
  "strategy": "auto",
  "changes": 3,
  "rationale": "...",
  "diff": [...],
  "plan": [...],
  "metadata": {
    "scope": "scope:core",
    "type": "feature",
    "milestone": "M0",
    "timestamp": "2025-10-05T..."
  },
  "applied": true
}
```

Retention: ≤200 files, pruned automatically by `assign-impl-order.mjs`.

### GitHub Comments

When confidence is medium or low (and `--apply` is used), the script posts a comment:

```markdown
## 🤖 Implementation Order Automation

**Confidence: low** (manual review recommended)

### Recommendation
- **Recommended Order:** 42
- **Priority Score:** 75
- **Missing:** scope, milestone

### Current Issue Metadata
- **Scope:** ❌ not set
- **Type:** ✅ feature
- **Milestone:** ❌ not set

### Next Steps
To improve automation confidence, please add the missing labels/milestone...
```

## Acceptance Criteria Status

- ✅ Granular build telemetry events in `scripts/shared/build-telemetry.mjs`
- ✅ No additions to `shared/src/telemetryEvents.ts` (guardrail: diff shows no changes)
- ✅ `emitOrderingEvent(name, props)` helper with automatic prefixing
- ✅ Assignment script emits attempt → apply/skip flow
- ✅ Low/medium confidence emits `confidence.low`
- ✅ Override detection emits `override.detected` with 24h lookback
- ✅ Contiguous integrity checker emits `integrity.snapshot` (fails CI if broken)
- ✅ Weekly metrics emits `metrics.weekly` with aggregations
- ✅ Artifact schema validation script with CI integration capability
- ✅ Artifact retention (≤200 files, pruned automatically)
- ✅ GitHub comment for medium/low confidence with rationale summary
- ✅ Separation principle maintained (validation passes)
- ✅ Tests updated to validate granular event structure

## Tests

All ordering telemetry tests pass:

```
Test 1: Build telemetry module... ✅
Test 1a: Granular telemetry events... ✅
Test 2: Artifact pruning... ✅
Test 3: Weekly metrics calculation... ✅
Test 4: Event name constants... ✅
```

Telemetry separation validation passes with no violations.

## Backward Compatibility

Legacy event names are preserved:
- `build.ordering_applied`
- `build.ordering_low_confidence`
- `build.ordering_overridden`

Both legacy and granular events are emitted where applicable, ensuring compatibility with any existing tooling.

## Non-Goals (Out of Scope)

- ❌ Predictive scheduling (Stage 2, issue #106)
- ❌ Application Insights emission for build events (console/workflow logs only)
- ❌ Changes to runtime game telemetry enumeration

## Usage

```bash
# Run weekly metrics
npm run metrics:weekly

# Validate artifact schema
npm run validate:artifact-schema

# Check ordering integrity
npm run check:ordering-integrity

# Detect overrides
npm run detect:ordering-overrides

# Run tests
npm run test:ordering

# Validate telemetry separation
npm run validate:telemetry-separation
```

## Files Changed

**New:**
- `scripts/validate-artifact-schema.mjs`

**Modified:**
- `scripts/shared/build-telemetry.mjs` - Added granular events and helper
- `scripts/assign-impl-order.mjs` - Event flow, timing, comments
- `scripts/check-ordering-integrity.mjs` - Snapshot emission
- `scripts/detect-ordering-overrides.mjs` - Granular override event
- `scripts/weekly-ordering-metrics.mjs` - Weekly metrics emission
- `scripts/test-ordering-telemetry.mjs` - Tests for granular events
- `package.json` - Added `validate:artifact-schema` script

## Event Examples

**assign.attempt:**
```json
{
  "name": "build.ordering.assign.attempt",
  "properties": {
    "issueNumber": 100,
    "existingOrder": null,
    "recommendedOrder": 5,
    "confidence": "high",
    "score": 150,
    "changesRequired": 3
  }
}
```

**integrity.snapshot (failure):**
```json
{
  "name": "build.ordering.integrity.snapshot",
  "properties": {
    "totalIssues": 50,
    "gaps": [23, 24],
    "duplicates": [10],
    "isContiguous": false
  }
}
```

**metrics.weekly:**
```json
{
  "name": "build.ordering.metrics.weekly",
  "properties": {
    "periodDays": 7,
    "totalProcessed": 25,
    "counts": {
      "high": 18,
      "medium": 5,
      "low": 2,
      "applied": 18,
      "overrides": 1
    },
    "appliedPct": 72,
    "overrideRate": 6,
    "lowConfidencePct": 8
  }
}
```

## Next Steps

1. ✅ Stage 1 complete - this implementation
2. Monitor metrics via `npm run metrics:weekly`
3. Consider Stage 2 predictive scheduling (issue #106) when appropriate
4. Review override rate after 2-3 weeks to tune heuristics if needed
