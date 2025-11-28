---
description: GitHub API usage guidance for issue and milestone management
applyTo: '**'
---

# GitHub API Usage Strategy for Issue Management

When working with GitHub issues, milestones, and dependencies, follow this tool selection strategy to maximize success and work around API limitations.

## Tool Selection Priority

### 1. MCP GitHub Tools (Primary)

**Use MCP `mcp_github-remote_*` tools first for**:

- Reading issue details (`mcp_github-remote_issue_read`)
- Creating/updating issues (`mcp_github-remote_issue_write`)
- Managing sub-issues within epics (`mcp_github-remote_sub_issue_write`)
- Searching issues (`mcp_github-remote_search_issues`)
- Adding comments (`mcp_github-remote_add_issue_comment`)

**Why**: MCP tools provide higher-level abstractions and better error handling.

### 2. REST API (Fallback/Specific Cases)

**Use `run_in_terminal` with `curl` for**:

#### Milestone Assignment

```bash
curl -X PATCH \
  -H "Authorization: Bearer $(gh auth token)" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/piquet-h/the-shifting-atlas/issues/{issue_number}" \
  -d '{"milestone": {milestone_number}}'
```

**Milestone numbers**

Avoid hard-coding milestone numbers in documentation — they can drift. Instead lookup the milestone number at runtime using either the GitHub CLI or the REST API and use that value when assigning milestones. Example methods below.

Using the GitHub CLI (recommended interactive flow):

```bash
# List milestones and pick the number for the desired milestone
gh api repos/:owner/:repo/milestones --jq '.[] | {number,title,state}' --repo piquet-h/the-shifting-atlas

# Or find a specific milestone by title (exact match)
MILESTONE_NUMBER=$(gh api repos/:owner/:repo/milestones --repo piquet-h/the-shifting-atlas --jq ".[] | select(.title==\"M2 Observability\") | .number")
echo "MILESTONE_NUMBER=$MILESTONE_NUMBER"

# Then use it in the issue update
curl -X PATCH \
  -H "Authorization: Bearer $(gh auth token)" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/piquet-h/the-shifting-atlas/issues/{issue_number}" \
  -d "{\"milestone\": $MILESTONE_NUMBER}"
```

Using the REST API directly (scripted/CI):

```bash
# List milestones and filter by title using jq
MILESTONE_NUMBER=$(curl -sS -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/piquet-h/the-shifting-atlas/milestones" | \
  jq -r '.[] | select(.title=="M2 Observability") | .number')

curl -X PATCH \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/piquet-h/the-shifting-atlas/issues/{issue_number}" \
  -d "{\"milestone\": $MILESTONE_NUMBER}"
```

Note: If you maintain a stable human-visible milestone catalog in `docs/roadmap.md`, prefer referencing milestone titles (lookup by title) rather than numeric IDs in automation or scripts. This ensures intent remains clear even when numbers change.

#### Issue Dependencies

**Primary**: Use REST API to create formal dependency relationships (correct endpoint & payload per 2022-11-28 API version).

> IMPORTANT: Earlier internal guidance used `dependency_node_id` and the path `/issues/{issue_number}/dependencies` – this is **incorrect**. The official docs require the endpoint suffix `/dependencies/blocked_by` and a JSON body containing `issue_id` (the numeric internal issue id), _not_ the issue number and not the GraphQL `node_id`.

```bash
# Get numeric internal id ("id") of the issue that BLOCKS the current one
BLOCKING_ID=$(curl -sS \
  -H "Authorization: Bearer $(gh auth token)" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/piquet-h/the-shifting-atlas/issues/{blocking_issue_number}" | jq -r '.id')

echo "Blocking issue internal id: $BLOCKING_ID"

# Add the dependency: {blocked_issue_number} is blocked by {blocking_issue_number}
curl -L -X POST \
  -H "Authorization: Bearer $(gh auth token)" \
  -H "Accept: application/vnd.github+json" \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/piquet-h/the-shifting-atlas/issues/{blocked_issue_number}/dependencies/blocked_by" \
  -d "{\"issue_id\":$BLOCKING_ID}"
```

**Remove a dependency** (unblock):

```bash
curl -L -X DELETE \
  -H "Authorization: Bearer $(gh auth token)" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/piquet-h/the-shifting-atlas/issues/{blocked_issue_number}/dependencies/blocked_by/{blocking_issue_internal_id}"
```

**List dependencies an issue is blocked by**:

```bash
curl -L \
  -H "Authorization: Bearer $(gh auth token)" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/piquet-h/the-shifting-atlas/issues/{issue_number}/dependencies/blocked_by"
```

**List dependencies an issue is blocking**:

```bash
curl -L \
  -H "Authorization: Bearer $(gh auth token)" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/piquet-h/the-shifting-atlas/issues/{issue_number}/dependencies/blocking"
```

**Fallback**: If the dependencies API returns 404 (feature not available for the repo or temporary service issue), add a structured comment as a workaround:

```markdown
## Dependencies

This issue depends on:

- #{issue_number} {issue_title}

**Rationale**: {why this dependency exists}
```

Use `mcp_github-remote_add_issue_comment` for the fallback approach, but **always attempt the REST API first**.

**API Reference**: [Add a dependency (blocked by)](https://docs.github.com/en/rest/issues/issue-dependencies?apiVersion=2022-11-28#add-a-dependency-an-issue-is-blocked-by)

## Common Workflows

### Adding Dependencies Between Issues

**Goal**: Document that Issue A is blocked by Issue B

**Steps**:

1. **Try REST API first** (preferred - creates formal relationship):

    ```bash
    BLOCKING_ID=$(curl -sS -H "Authorization: Bearer $(gh auth token)" \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      "https://api.github.com/repos/piquet-h/the-shifting-atlas/issues/{blocking_issue_number}" | jq -r '.id')

    curl -L -X POST \
      -H "Authorization: Bearer $(gh auth token)" \
      -H "Accept: application/vnd.github+json" \
      -H "Content-Type: application/json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      "https://api.github.com/repos/piquet-h/the-shifting-atlas/issues/{blocked_issue_number}/dependencies/blocked_by" \
      -d "{\"issue_id\":$BLOCKING_ID}"
    ```

2. **Fallback to comment only if API returns 404**:
    - Use `mcp_github-remote_add_issue_comment`
    - Add "## Dependencies" section
    - Note in comment that formal relationship creation failed

### Assigning Milestone to Issue

**Goal**: Assign issue #123 to M2 Observability (milestone 3)

**Steps**:

1. Use REST API via `run_in_terminal`:
    ```bash
    curl -X PATCH \
      -H "Authorization: Bearer $(gh auth token)" \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      "https://api.github.com/repos/piquet-h/the-shifting-atlas/issues/123" \
      -d '{"milestone": 3}'
    ```
2. Verify with `mcp_github-remote_issue_read`

**Why REST API**: MCP issue_write doesn't expose milestone parameter.

**API Reference**: [Update an issue](https://docs.github.com/en/rest/issues/issues?apiVersion=2022-11-28#update-an-issue)

**Request body shape**:

```json
{
    "milestone": 3, // milestone number (required)
    "title": "...", // optional: update title
    "body": "...", // optional: update body
    "state": "open" // optional: "open" or "closed"
}
```

**Response**: Returns full issue object with updated milestone.

### Managing Epic Sub-Issues

**Goal**: Add issue #456 as sub-issue of epic #100

**Steps**:

1. Use `mcp_github-remote_sub_issue_write`:
    - method: "add"
    - issue_number: 100 (parent epic)
    - sub_issue_id: {node_id from API, not issue number}

**Note**: Sub-issues require the GitHub node_id, not the issue number. Fetch via REST if needed:

```bash
curl -H "Authorization: Bearer $(gh auth token)" \
  "https://api.github.com/repos/piquet-h/the-shifting-atlas/issues/456" | \
  jq -r '.node_id'
```

**API Reference**: GitHub's sub-issues feature uses GraphQL internally; MCP tool abstracts this.

**Request parameters**:

- `sub_issue_id`: Must be the `node_id` (e.g., "I_kwDOPvMjxM7U-hJq"), not issue number
- `method`: "add" | "remove" | "reprioritize"
- For reprioritize: provide `after_id` or `before_id`

## Authentication

All API calls use GitHub CLI token:

```bash
$(gh auth token)
```

Ensure `gh` CLI is authenticated before making API calls.

## Error Handling

### MCP Tool Failures

- Read error message carefully
- If "Not Found" or permission error, verify issue exists and is accessible
- Fall back to REST API for unsupported operations

### REST API 404s

- **Dependencies endpoint**: If returning 404, it's a temporary GitHub service issue. Fall back to structured comments until resolved.
- **Other endpoints**: Verify URL structure and authentication

### Rate Limiting

- GitHub API: 5000 requests/hour for authenticated users
- If hitting limits, batch operations or add delays

## API Shape References

Quick links to official GitHub REST API documentation for request/response schemas:

- **[Issues API](https://docs.github.com/en/rest/issues/issues?apiVersion=2022-11-28)**: Create, update, list issues
- **[Milestones API](https://docs.github.com/en/rest/issues/milestones?apiVersion=2022-11-28)**: Manage milestones
- **[Issue Dependencies API](https://docs.github.com/en/rest/issues/issue-dependencies?apiVersion=2022-11-28)**: Add/remove blocking relationships
- **[Comments API](https://docs.github.com/en/rest/issues/comments?apiVersion=2022-11-28)**: Add issue comments

Each endpoint documentation includes:

- Full request body schema with required/optional fields
- Response object structure
- Error codes and meanings
- Rate limit information

## Reference

- **MCP Tools Documentation**: Built-in GitHub remote MCP server
- **REST API Docs**: https://docs.github.com/en/rest
    - [Issues](https://docs.github.com/en/rest/issues/issues?apiVersion=2022-11-28)
    - [Milestones](https://docs.github.com/en/rest/issues/milestones?apiVersion=2022-11-28)
    - [Issue Dependencies](https://docs.github.com/en/rest/issues/issue-dependencies?apiVersion=2022-11-28)
    - [Comments](https://docs.github.com/en/rest/issues/comments?apiVersion=2022-11-28)
- **Milestone Reference**: See table above or `docs/roadmap.md`

## Examples from This Repo

### Successful Patterns

✅ **Adding formal dependency via REST API** (preferred – corrected syntax):

```bash
# Issue #297 depends on #289 (i.e. 297 is blocked by 289)
BLOCKING_ID=$(curl -sS -H "Authorization: Bearer $(gh auth token)" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/piquet-h/the-shifting-atlas/issues/289" | jq -r '.id')

curl -L -X POST \
  -H "Authorization: Bearer $(gh auth token)" \
  -H "Accept: application/vnd.github+json" \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/piquet-h/the-shifting-atlas/issues/297/dependencies/blocked_by" \
  -d "{\"issue_id\":$BLOCKING_ID}"
```

✅ **Assigning milestone via REST** (Issue #347):

```bash
curl -X PATCH \
  -H "Authorization: Bearer $(gh auth token)" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/piquet-h/the-shifting-atlas/issues/347" \
  -d '{"milestone": 3}'
```

✅ **Fallback dependency comment** (only when API unavailable):

```markdown
## Dependencies

This issue depends on the following being completed first:

**Dashboards**:

- #289 Dashboard: Performance Operations (Consolidated Workbook)
- #283 Dashboard: Movement Latency Distribution (P95/P99)

**Rationale**: Threshold tuning requires observing baseline metrics...

_Note: Formal dependency relationship creation via API failed with 404; tracked as comment until service restored._
```

### Temporary Issues

⚠️ **Dependencies API returning 404**:

Possible causes:

1. Incorrect endpoint (ensure `/dependencies/blocked_by` suffix is present).
2. Repository lacks feature availability (issue dependencies may be rolling out; retry later).
3. Private repository + token lacks "Issues: write" permission (use a fine‑grained PAT or app token).

**Action**: After verifying endpoint syntax, if 404 persists, fall back to structured comment approach and re‑attempt in a later session.

## Decision Tree

```
Need to work with GitHub issues?
│
├─ Reading data?
│  └─ Use MCP tools (search_issues, issue_read, etc.)
│
├─ Creating/updating issues?
│  └─ Use MCP issue_write
│
├─ Assigning milestone?
│  └─ Use REST API PATCH /issues/{number}
│
├─ Adding dependencies?
│  ├─ Try REST API POST /issues/{number}/dependencies first
│  └─ Fallback: Use MCP add_issue_comment with "## Dependencies" only if API fails
│
└─ Managing epic sub-issues?
   └─ Use MCP sub_issue_write (requires node_id)
```

## Maintenance

**Update this file when**:

- New milestones are created (add to table)
- GitHub API changes affect tool selection
- MCP tools gain new capabilities
- Workarounds are discovered or become obsolete

Last updated: 2025-11-07
