# Ordering Automation Hardening Tests

This document describes the test suite for the ordering automation hardening features implemented in issue #105.

## Test Scripts

### 1. `test:ordering-hardening`

Tests core hardening features:

- Hash calculation reproducibility
- Hash stability (sorted before hashing)
- Integrity checking (gaps and duplicates)
- Artifact directory creation and filename pattern

```bash
npm run test:ordering-hardening
```

**Coverage:**

- ✅ SHA256 hash calculation
- ✅ Integrity violation detection (gaps)
- ✅ Integrity violation detection (duplicates)
- ✅ Artifact filename pattern `decision-<issue>-<timestamp>.json`

### 2. `test:idempotent-comments`

Tests comment marker-based update logic:

- Finding existing comments with marker
- Handling missing markers
- Edge cases (empty arrays, multiple markers)

```bash
npm run test:idempotent-comments
```

**Coverage:**

- ✅ Comment marker identification
- ✅ Update vs create decision logic
- ✅ Edge case handling

## Manual Testing Required

The following scenarios require live GitHub API access or workflow runs:

### Concurrency Conflict Detection

**Setup:**

1. Run assign-impl-order in dry-run mode for an issue
2. Manually modify the issue's order in GitHub Project
3. Run assign-impl-order with --apply

**Expected:** Exit code 3, conflict detected

### Hash Reproducibility

**Setup:**

1. Run dry-run: `npm run assign:impl-order -- --issue 123 --artifact dry-run.json`
2. Run apply: `npm run assign:impl-order -- --issue 123 --apply --artifact apply.json`

**Expected:** Both artifacts have identical `planHash` values

### Idempotent Comment Behavior

**Setup:**

1. Create an issue with low confidence metadata (missing scope/type)
2. Run assign-impl-order with --apply twice

**Expected:** Second run updates existing comment instead of creating new

### Doc-Drift Workflow

**Setup:**

1. Create PR with doc changes to trigger doc-drift job
2. Test with fork (no write permissions)

**Expected:**

- Comment failure produces warning, not error
- Artifacts uploaded regardless of comment success
- Job passes overall

## Exit Codes Validation

Test exit codes manually:

```bash
# Exit 0: Success or no-op
npm run assign:impl-order -- --issue 123

# Exit 2: Configuration error
npm run assign:impl-order -- --issue 123
# (without GITHUB_TOKEN)

# Exit 3: Concurrency conflict
# (requires manual setup - modify ordering between plan & apply)

# Exit 4: Integrity violation
# (would require injecting invalid data - not normally reachable)
```

## Continuous Integration

These tests run automatically on:

- Pull request validation
- Pre-merge checks

Add to CI workflow if needed:

```yaml
- name: Test Ordering Hardening
  run: |
      npm run test:ordering-hardening
      npm run test:idempotent-comments
```

## Test Coverage Summary

| Feature              | Automated | Manual | Status                |
| -------------------- | --------- | ------ | --------------------- |
| Hash calculation     | ✅        | -      | Pass                  |
| Integrity checking   | ✅        | -      | Pass                  |
| Artifact generation  | ✅        | -      | Pass                  |
| Comment markers      | ✅        | -      | Pass                  |
| Concurrency control  | -         | ⚠️     | Requires live API     |
| Hash reproducibility | -         | ⚠️     | Requires live API     |
| Comment updates      | -         | ⚠️     | Requires live API     |
| Doc-drift hardening  | -         | ⚠️     | Requires workflow run |

## Adding New Tests

To add new test cases:

1. Create test script in `scripts/test-*.mjs`
2. Follow existing pattern (simple console output, exit codes)
3. Add npm script in `package.json`
4. Document in this file
5. Consider CI integration if appropriate
