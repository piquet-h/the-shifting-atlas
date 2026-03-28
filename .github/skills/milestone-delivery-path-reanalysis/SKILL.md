---
name: milestone-delivery-path-reanalysis
description: Keeps GitHub milestone descriptions in sync with milestone issue CRUD by reanalyzing delivery slices, inserting gaps, and applying a deterministic ordered plan (with auth + heredoc guardrails). This should be used when there is a change to a milestone or a substantial change to an issue in a milestone.
---

# Milestone delivery path reanalysis

Use this skill when you are asked to:

- Add/remove/move/close/split issues in a GitHub milestone (CRUD), **and** keep the milestone description as the authoritative delivery path.
- Regenerate milestone descriptions from the milestone’s issue/dependency graph.
- Update the milestone description deterministically while avoiding the repo’s common pitfalls:
    - auth context surprises (`GITHUB_TOKEN` precedence)
    - heredoc / quoting failures

## What this skill uses

- GitHub CLI: `gh`
- Optional: `jq` (for formatting / inspection)
- Repo automation script: `scripts/reanalyze-milestone.mjs`

## Preconditions

1. You have GitHub CLI authentication:
    - `gh auth status`

2. **Auth pitfall / guardrail (IMPORTANT):**

`gh api` prefers environment tokens:

- `GH_TOKEN`, then `GITHUB_TOKEN` (in precedence order)

If those tokens lack permission to update milestones, you can get:

- HTTP 403: `Resource not accessible by personal access token`

**Fix:** temporarily unset `GITHUB_TOKEN` so `gh` falls back to the keychain / interactive auth token:

- `unset GITHUB_TOKEN`

(Only do this for the duration of the update command.)

## Inputs

- `owner/repo` (e.g. `piquet-h/the-shifting-atlas`)
- milestone number (recommended) OR milestone title

## Workflow

### Fast path (recommended)

Use the repo script to reanalyze and (optionally) update the milestone description:

- Preview:
    - `node scripts/reanalyze-milestone.mjs --repo <owner>/<repo> --milestone <milestoneNumber> --print`
- Apply:
    - `node scripts/reanalyze-milestone.mjs --repo <owner>/<repo> --milestone <milestoneNumber> --apply`

Bulk mode (all open milestones at once):

- Preview all: `node scripts/reanalyze-milestone.mjs --repo <owner>/<repo> --all --print`
- Apply all: `node scripts/reanalyze-milestone.mjs --repo <owner>/<repo> --all --apply`

The script:

- regenerates a full milestone description from GitHub issue/dependency data
- computes dependency layers from formal GitHub `blocked_by` relationships
- retries milestone updates if token precedence causes 403
- treats closed duplicate/split issues as **superseded** planning noise and reports them for cleanup
- shared parsing/rendering logic lives in `scripts/lib/milestone-delivery-description.mjs` (authoritative module for issue classification, dependency graph, description parsing, and rendering)

### 1) Gather evidence (milestone + issues)

Fetch milestone metadata:

- `unset GITHUB_TOKEN && gh api repos/<owner>/<repo>/milestones/<milestoneNumber> --jq '{number,title,open_issues,closed_issues,updated_at,description}'`

List issues in milestone (open + closed) using the milestone number filter:

- `unset GITHUB_TOKEN && gh api --paginate repos/<owner>/<repo>/issues -f milestone=<milestoneNumber> -f state=all --jq '.[] | {number,title,state,labels:[.labels[].name]}'`

Notes:

- GitHub’s “issues” endpoint includes PRs; filter out items with `pull_request` if you only want issues.
- If you need to preserve PRs in planning, keep them but label them explicitly.

### 2) Gather dependency evidence

Goal: build the plan from formal GitHub data rather than from legacy AI-written slice prose.

Fetch for each issue in the milestone:

- `gh api repos/<owner>/<repo>/issues/<issueNumber>/dependencies/blocked_by`

Classify results into:

- open executable issues
- open coordinator epics
- closed groundwork
- superseded / not planned
- blocked outside this milestone
- dependency conflicts

### 3) Reanalyze and compute the updated delivery path

Produce a new ordered plan that is:

- **deterministic** (same inputs → same output)
- **conservative** (don’t guess when uncertain; instead, surface dependency conflicts)

#### 3a) Classify milestone issues

Compute:

- `open executable issues`
- `open coordinator epics`
- `closed groundwork`
- `superseded / not planned`
- `blocked outside this milestone`
- `dependency conflicts`

#### 3b) Build dependency layers

Topologically layer the open milestone issues using formal `blocked_by` links:

- coordinators (epics) stay in the graph, but render under `Coordinator:` rather than `Order:`
- closed blockers are treated as satisfied
- open blockers outside the milestone are rendered under `Blocked outside this milestone`
- cycles or unresolved graph fragments are rendered under `Dependency conflicts (needs decision)`

Tie-breakers inside a dependency layer:

- `infra`
- `feature|enhancement|refactor|spike`
- `test`
- `docs`
- issue number

#### 3c) Render the canonical description

Use the generated structure from `scripts/lib/milestone-delivery-description.mjs`:

- intro (machine-generated)
- `## Dependency summary`
- `## Closed groundwork`
- `## Delivery slices`
- optional `## Blocked outside this milestone`
- optional `## Dependency conflicts (needs decision)`
- auto-generated impact block

#### 3d) Handle duplicates / splits

If an issue is marked duplicate/superseded (common after splitting):

- Remove it from `Order:` blocks.
- Prefer linking to the replacement issue(s) in an “Archive / Superseded” note.

### 4) Update milestone description (without heredocs)

Because heredocs frequently cause shell trouble, prefer:

1. Write the new description to a temp file using your editor:

- `/tmp/milestone-desc.txt`

2. Update milestone using `-F description=@<file>` (reads file contents):

- `unset GITHUB_TOKEN && gh api -X PATCH repos/<owner>/<repo>/milestones/<milestoneNumber> -F description=@/tmp/milestone-desc.txt`

### 5) Verify

Re-fetch and compare:

- `unset GITHUB_TOKEN && gh api repos/<owner>/<repo>/milestones/<milestoneNumber> --jq '.description'`

Acceptance checks:

- Description contains the generated dependency summary, delivery slices, and impact block.
- Every open issue is either:
    - placed in a dependency layer, or
    - listed under `Blocked outside this milestone`, or
    - listed under `Dependency conflicts (needs decision)`.
- Re-running the command is idempotent.
- `--strict` fails when unresolved blockers/conflicts remain.

## Output template (recommended)

Within the milestone description, use a stable structure:

- Intro (machine-generated)
- `## Dependency summary`
- `## Closed groundwork`
- `## Delivery slices`
    - `### Slice N — Dependency layer N`
    - optional `Depends on:`
    - optional `Coordinator:`
    - `Order:`
- Optional `## Blocked outside this milestone`
- Optional `## Dependency conflicts (needs decision)`

## Notes

- Prefer milestone **number** as the primary identifier (stable). Titles can change.
- Keep ordering rules explicit and minimal; avoid embedding long narratives.

---

Last reviewed: 2026-01-16
