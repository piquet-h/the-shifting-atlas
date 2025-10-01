# Issue Status Management

This document describes the automated issue status management system that ensures issues are properly tracked in the GitHub Project Board.

## Overview

The system automatically updates issue status in the Project Board based on work activity:

- **Todo** → **In progress** when Copilot or developers start working on issues
- **In progress** → **Done** when work is completed (PR merged)
- **In progress** → **Todo** when work is paused (PR closed without merge)

## Components

### 1. Status Update Script (`scripts/update-issue-status.mjs`)

A standalone utility for updating issue status in the project board.

**Usage:**

```bash
# Update specific issue status
npm run update:issue-status -- --issue-number 123 --status "In progress"

# Available statuses (case-sensitive):
# - "Todo"
# - "In progress"
# - "Done"
```

**Environment Variables:**

- `GITHUB_TOKEN` - Required for GitHub API access
- `PROJECT_OWNER` - Project owner (defaults to repo owner)
- `PROJECT_NUMBER` - Project number (defaults to 3)
- `PROJECT_OWNER_TYPE` - 'user' | 'org' (auto-detect if unset)

### 2. Auto-Assignment Workflow Integration

The existing `auto-assign-impl-order.yml` workflow now automatically sets issues to "In progress" when Copilot starts working on them (i.e., when implementation order is assigned or updated).

### 3. PR-Based Status Updates (`auto-update-issue-status-on-pr.yml`)

Automatically updates status based on PR lifecycle:

- **PR opened/ready for review** → Referenced issues set to "In progress"
- **PR merged** → Referenced issues set to "Done"
- **PR closed without merge** → Referenced issues set to "Todo"

The workflow detects issue references in PR titles and descriptions using common patterns:

- `#123`
- `fixes #123`
- `closes #123`
- `resolves #123`
- etc.

### 4. Manual Status Update Workflow (`update-issue-status.yml`)

A reusable workflow for manual status updates or integration with other workflows.

**Manual Usage:**

1. Go to Actions → Update Issue Status
2. Enter issue number and desired status
3. Optionally provide a reason for the change

**Workflow Integration:**

```yaml
- name: Set issue in progress
  uses: ./.github/workflows/update-issue-status.yml
  with:
      issue_number: '123'
      status: 'In progress'
      reason: 'Starting development work'
```

## Status Transitions

```
┌─────────┐    Copilot/PR opened    ┌──────────────┐    PR merged    ┌──────┐
│  Todo   │ ────────────────────── │ In progress  │ ──────────────── │ Done │
└─────────┘                        └──────────────┘                  └──────┘
     ▲                                      │                           │
     │               PR closed              │                           │
     └──────────────────────────────────────┘                           │
     ▲                                                                   │
     │                        Manual reset                               │
     └───────────────────────────────────────────────────────────────────┘
```

## Error Handling

- Scripts gracefully handle missing issues or project access
- Failed status updates are logged but don't fail workflows
- Proper fallbacks when project fields are not found

## Integration Points

### When Issues Move to "In Progress"

1. **Copilot Analysis**: Auto-assignment workflow triggers when Copilot analyzes and assigns order to issues
2. **PR Creation**: When PRs are opened that reference issues
3. **Manual Assignment**: When team members are assigned to issues (future enhancement)

### When Issues Move to "Done"

1. **PR Merge**: When PRs that reference issues are merged
2. **Manual Completion**: Using the manual workflow or script

### When Issues Return to "Todo"

1. **PR Closure**: When PRs are closed without merging
2. **Work Suspension**: Manual status change when work is paused

## Troubleshooting

### Issue Not Found in Project

- Ensure the issue is added to the GitHub Project Board
- Check PROJECT_NUMBER environment variable matches your project

### Status Options Not Available

- Verify the project has a "Status" field with options: "Todo", "In progress", "Done"
- Options are case-sensitive

### Token Permissions

- `GITHUB_TOKEN` needs `repository-projects: write` permission
- For user-owned projects, may need `PROJECTS_TOKEN` with project scope

## Testing

Run the test suite to validate functionality:

```bash
node scripts/test-update-issue-status.mjs
```

## Future Enhancements

- Integration with issue assignments
- Automatic status based on code activity
- Custom status transitions per project
- Integration with milestone completion
