# Implementation Order Automation

This document describes the automated implementation order assignment system for new GitHub issues.

## Overview

When a new issue is created or significantly updated (labels, milestones), GitHub Copilot automatically:

1. **Analyzes** the issue content, labels, and metadata
2. **Determines** the appropriate priority and implementation order
3. **Updates** the `roadmap/implementation-order.json` file
4. **Resequences** existing issues if necessary
5. **Syncs** changes with GitHub Project and regenerates documentation

## How It Works

### Automatic Triggers

The automation runs on these GitHub events:
- `issues.opened` - New issues are automatically assigned implementation order
- `issues.labeled` - Label changes may affect priority
- `issues.unlabeled` - Label removal may affect priority  
- `issues.milestoned` - Milestone assignment affects priority
- `issues.demilestoned` - Milestone removal affects priority

### Priority Analysis

The system calculates a priority score based on:

**Scope Labels** (primary factor):
- `scope:core` - Highest priority (foundation work)
- `scope:world` - High priority (core game mechanics)
- `scope:traversal` - Medium-high priority
- `scope:security` - Medium-high priority
- `scope:ai` - Medium priority
- `scope:mcp` - Medium-low priority
- `scope:systems` - Lower priority
- `scope:observability` - Lower priority
- `scope:devx` - Lowest priority

**Roadmap Path Dependencies** (NEW - major factor):
- **Navigation Phase 1**: Core traversal foundation (locations, exits, graph) - Highest weight
- **World Foundation**: World rules, lore, biomes, player identity - Very high weight  
- **Navigation Phase 2**: Normalization, direction handling, caching - High weight
- **AI Stages M3-M4**: MCP read-only tools integration - Medium-high weight
- **AI Stage M5+**: MCP mutation tools, advanced AI - Medium weight
- **Navigation Phase 3**: AI-driven exit generation - Medium weight
- **Infrastructure**: Telemetry, observability, testing, DevX - Lower weight

The system analyzes issue content against the implementation phases documented in `docs/modules/` to determine which roadmap path the issue supports. This ensures issues are prioritized based on the logical delivery sequence for MVP and beyond.

**Type Labels**:
- `feature` - Standard feature work
- `infra` - Infrastructure changes
- `enhancement` - Improvements to existing features
- `refactor` - Code quality improvements
- `spike` - Research/investigation work
- `test` - Testing improvements
- `docs` - Documentation updates (lowest priority)

**Milestones**:
- `M0` - Foundation (highest priority)
- `M1` - Core Systems
- `M2` - World Building
- `M3` - Traversal
- `M4` - AI Integration
- `M5` - Systems Polish (lowest priority)

**Content Keywords**:
- High priority: "foundation", "bootstrap", "persistence", "core", "essential", "database", "security"
- Medium priority: "command", "api", "utility", "feature", "enhancement"
- Low priority: "documentation", "polish", "cleanup", "maintenance"

**Dependencies**:
- Issues that block others get higher priority
- Issues blocked by others get slightly lower priority

### Decision Logic

Based on the priority score, the system:

- **High scores (200+)**: Insert near beginning, requires resequencing
- **Medium scores (100-199)**: Insert in middle, may require resequencing  
- **Low scores (<100)**: Append at end, no resequencing needed

For existing issues, the system skips updates if the current position is within ±2 positions of the recommended position.

### Race Condition Prevention

The automation includes several safeguards:

- **Concurrency control**: Only one workflow runs at a time using GitHub's concurrency groups
- **Atomic updates**: File operations use backup/restore patterns
- **Validation**: All changes are validated before committing
- **Error recovery**: Failed operations preserve backups and log detailed errors

## Manual Overrides

Maintainers can override automation by:

1. **Direct editing**: Modify `roadmap/implementation-order.json` directly
2. **Force resequencing**: Use workflow dispatch with `force_resequence: true`
3. **Manual sync**: Run `npm run sync:impl-order:apply` locally

The automation respects manual changes and won't override recent manual edits.

## Audit Trail

All automated changes are tracked via:

- **Git commits**: Each assignment creates a commit with issue reference
- **Workflow logs**: Detailed analysis and rationale in GitHub Actions logs
- **Issue comments**: Low/medium confidence assignments get explanatory comments
- **Project updates**: GitHub Project fields are automatically synced

## Edge Cases

### Insufficient Issue Detail
If an issue lacks sufficient information for analysis:
- It's assigned low priority and appended to the end
- A comment explains the assignment and requests more detail

### Multiple Simultaneous Issues
The concurrency control prevents race conditions, but issues may be processed sequentially rather than simultaneously.

### Manual vs Automatic Conflicts
The system detects and respects recent manual changes to prevent conflicts.

### Closed Issues
Closed issues are ignored unless explicitly forced via workflow dispatch.

## Monitoring and Troubleshooting

### Workflow Logs
Check the "Auto Assign Implementation Order" workflow for detailed logs of:
- Issue analysis results
- Priority calculations
- Assignment decisions
- Any errors or warnings

### Common Issues

**Issue not assigned order**:
- Check if issue is closed
- Verify labels are correctly formatted (`scope:core` not `core`)
- Look for workflow errors in Actions tab

**Wrong priority assigned**:
- Review the analysis rationale in workflow logs
- Consider if labels/milestone need adjustment
- Manual override if needed

**Race condition errors**:
- Retry the workflow dispatch manually
- Check for concurrent workflow runs

### Testing

Run the test suite to validate functionality:
```bash
node scripts/test-impl-order-automation.mjs
```

## Configuration

### Workflow Settings
Edit `.github/workflows/auto-assign-impl-order.yml` to:
- Adjust timeout values
- Modify trigger conditions
- Change comment thresholds

### Priority Weights
Modify `scripts/analyze-issue-priority.mjs` to:
- Adjust priority score calculations
- Add new scope/type categories
- Change keyword classifications

### Assignment Logic
Update `scripts/apply-impl-order-assignment.mjs` to:
- Change insertion point algorithms
- Modify resequencing thresholds
- Adjust validation rules

## Integration with Existing Workflows

The automation works alongside existing implementation order management:

- **Preserves** existing sync workflows
- **Extends** the current JSON-based system
- **Maintains** compatibility with manual processes
- **Integrates** with GitHub Project fields

## Future Enhancements

Planned improvements include:
- Machine learning for priority prediction
- Integration with dependency tracking
- Automated milestone assignment
- Historical analysis for better accuracy