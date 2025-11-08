# Application Insights Workbooks Management

This document describes the process for managing Application Insights workbook definitions in version control.

## Overview

Application Insights workbooks are versioned as JSON files to ensure:
- **Reproducibility**: Dashboard configurations are captured in source control
- **Review Process**: Changes are reviewed in pull requests
- **Drift Prevention**: Automated verification catches uncommitted changes

## Directory Structure

```
docs/observability/
├── workbooks-index.json          # Catalog of all workbooks
└── workbooks/                    # Exported workbook definitions
    ├── movement-navigation-dashboard.workbook.json
    └── performance-operations-dashboard.workbook.json
```

## Workbook Catalog

The `workbooks-index.json` file contains:
- **id**: Azure workbook resource ID (from Azure Portal)
- **name**: Human-readable workbook name
- **slug**: Filename slug (kebab-case)
- **description**: Purpose and scope of the workbook
- **owners**: Responsible teams
- **consolidated**: Flag indicating multi-metric dashboards
- **panels**: List of visualization panels
- **relatedIssues**: GitHub issue numbers
- **telemetryEvents**: Events queried by this workbook

### Getting Workbook Resource IDs

To find a workbook's resource ID in Azure Portal:
1. Navigate to Application Insights → Workbooks
2. Open the target workbook
3. Click "Edit" → "Advanced Editor" (</> icon)
4. Copy the `resourceId` or `id` field from the JSON

Update `workbooks-index.json` with the actual resource ID.

## Export Process

### Manual Export

To export current workbook definitions from Azure:

```bash
# Using npm script (recommended)
npm run workbooks:export

# Or directly
node scripts/observability/export-workbooks.mjs
```

This script:
1. Reads configuration from `workbooks-index.json`
2. Exports workbook definitions from Azure (or local source for MVP)
3. Normalizes JSON:
   - Removes volatile fields (timestamps, user IDs)
   - Sorts top-level keys
   - Applies 2-space indentation
4. Writes to `docs/observability/workbooks/<slug>.workbook.json`

### When to Export

Run the export script after:
- Creating a new workbook in Azure Portal
- Modifying queries, thresholds, or visualizations
- Renaming or reorganizing panels

### Edge Cases

- **Missing Workbook ID**: Logs a warning and skips export
- **Unavailable Workbook**: Skips with summary line (check permissions)
- **Partial Failure**: Writes successful workbooks; exits non-zero only if all fail
- **Renamed Workbook**: New slug file is created; old file must be manually archived

## Verification

To verify that committed files match current export state:

```bash
# Using npm script (recommended)
npm run workbooks:verify

# Or directly
node scripts/observability/verify-workbooks.mjs
```

Use this to:
- Check for drift before committing code
- Validate export process
- Catch uncommitted workbook changes

**Exit Codes:**
- `0`: All workbooks match
- `1`: Drift detected (re-export needed)

## CI Integration (Optional)

To prevent drift, add verification to CI pipeline:

```yaml
# In .github/workflows/ci.yml
- name: Verify workbooks
  run: node scripts/observability/verify-workbooks.mjs
```

_Note: CI integration is deferred to a future issue._

## Import/Update Workflow

### Editing Existing Workbooks

1. **Edit in Azure Portal**
   - Make changes to queries, thresholds, visualizations
   - Test thoroughly

2. **Export Changes**
   ```bash
   npm run workbooks:export
   ```

3. **Review Diff**
   ```bash
   git diff docs/observability/workbooks/
   ```

4. **Commit**
   ```bash
   git add docs/observability/workbooks/
   git commit -m "Update movement dashboard thresholds"
   ```

### Creating New Workbooks

1. **Create in Azure Portal**
   - Build workbook with queries and visualizations
   - Save with descriptive name

2. **Add to Index**
   - Update `docs/observability/workbooks-index.json`
   - Add entry with resource ID, slug, description, related issues

3. **Export**
   ```bash
   npm run workbooks:export
   ```

4. **Commit Both Files**
   ```bash
   git add docs/observability/workbooks-index.json
   git add docs/observability/workbooks/<new-slug>.workbook.json
   git commit -m "Add <workbook-name> dashboard"
   ```

### Archiving Old Workbooks

If a workbook is replaced or deprecated:

1. Remove entry from `workbooks-index.json`
2. Move workbook file to `docs/observability/workbooks/archived/`
3. Update related documentation

The export script will warn about orphaned files.

## Consolidated Workbooks

Workbooks marked with `"consolidated": true` combine multiple related metrics:
- **movement-navigation-dashboard**: Success rate + blocked reasons + trends
- **performance-operations-dashboard**: RU + latency + partition pressure + success/failure rates

These avoid dashboard sprawl and provide a "single pane of glass" for related concerns.

## Related Issues

- [#281](https://github.com/piquet-h/the-shifting-atlas/issues/281): Movement success rate dashboard (closed)
- [#282](https://github.com/piquet-h/the-shifting-atlas/issues/282): Blocked movement reasons panel (closed)
- [#283](https://github.com/piquet-h/the-shifting-atlas/issues/283): Movement latency distribution (closed)
- [#289](https://github.com/piquet-h/the-shifting-atlas/issues/289): RU & latency overview
- [#290](https://github.com/piquet-h/the-shifting-atlas/issues/290): RU vs latency correlation
- [#291](https://github.com/piquet-h/the-shifting-atlas/issues/291): Partition pressure trend
- [#296](https://github.com/piquet-h/the-shifting-atlas/issues/296): Success/failure rate & RU cost
- [#297](https://github.com/piquet-h/the-shifting-atlas/issues/297): Post-baseline threshold tuning
- [#298](https://github.com/piquet-h/the-shifting-atlas/issues/298): Meta: Workbook export automation (this issue)

## Troubleshooting

### Export Script Failures

**Problem**: "Source file not found"
- **Cause**: Slug in `workbooks-index.json` doesn't match file in `infrastructure/workbooks/`
- **Fix**: Verify slug matches filename (without `.workbook.json`)

**Problem**: "Placeholder ID" warning
- **Cause**: Workbook resource ID not updated in index
- **Fix**: Get actual resource ID from Azure Portal and update index

### Verification Failures

**Problem**: "Drift detected"
- **Cause**: Workbook has been modified in Azure but not re-exported
- **Fix**: Run export script and commit changes

**Problem**: "Committed file not found"
- **Cause**: Workbook added to index but never exported
- **Fix**: Run export script to generate initial file

## Best Practices

1. **Always export after Azure changes**: Keep version control in sync
2. **Review diffs carefully**: Ensure changes are intentional
3. **Use descriptive commit messages**: Reference related issues
4. **Update relatedIssues**: Keep traceability current
5. **Test thresholds**: Validate alert conditions before committing
6. **Document threshold rationale**: Add comments in related issues

## Future Enhancements

Potential improvements (separate issues):
- **Automated Azure API Export**: Call Azure Management API directly (requires auth)
- **Weekly Drift Reports**: Scheduled job comparing Azure vs. committed state
- **Auto-export on PR Open**: CI workflow to pull latest definitions
- **Threshold Validation**: Automated checks for reasonable ranges
- **Historical Snapshots**: Archive old versions before major changes

## Notes

- **No Runtime Telemetry**: These scripts are tooling-layer only; they do NOT emit Application Insights events
- **Manual Process**: Export is intentionally manual to avoid accidental overwrites
- **2-Space Indent**: Stable formatting minimizes diff noise
- **Volatile Fields Removed**: Timestamps and user IDs are excluded from exports
