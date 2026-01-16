---
name: milestone-delivery-path-reanalysis
description: Keeps GitHub milestone descriptions in sync with milestone issue CRUD by reanalyzing delivery slices, inserting gaps, and applying a deterministic ordered plan (with auth + heredoc guardrails). This should be used when there is a change to a milestone or a substantial change to an issue in a milestone.
---

# Milestone delivery path reanalysis

Use this skill when you are asked to:

- Add/remove/move/close/split issues in a GitHub milestone (CRUD), **and** keep the milestone description as the authoritative delivery path.
- Detect “gaps”: issues that are in the milestone but not represented in the milestone’s slice ordering.
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

The script:

- treats existing `Order:` blocks as the planned delivery path
- detects milestone “gaps” and updates supporting sections deterministically
- retries milestone updates if token precedence causes 403
- treats closed duplicate/split issues as **superseded** planning noise and reports them for cleanup

### 1) Gather evidence (milestone + issues)

Fetch milestone metadata:

- `unset GITHUB_TOKEN && gh api repos/<owner>/<repo>/milestones/<milestoneNumber> --jq '{number,title,open_issues,closed_issues,updated_at,description}'`

List issues in milestone (open + closed) using the milestone number filter:

- `unset GITHUB_TOKEN && gh api --paginate repos/<owner>/<repo>/issues -f milestone=<milestoneNumber> -f state=all --jq '.[] | {number,title,state,labels:[.labels[].name]}'`

Notes:

- GitHub’s “issues” endpoint includes PRs; filter out items with `pull_request` if you only want issues.
- If you need to preserve PRs in planning, keep them but label them explicitly.

### 2) Parse existing slice ordering from milestone description

Goal: treat the milestone description as the “planned order” and compare it to reality.

Look for a structure like:

- `## Slice ...`
- `Order:` followed by lines containing `#<issueNumber>`

Extract:

- slice names
- slice order lists (issue numbers)
- optional “Coordinator” / “Epic” references

### 3) Reanalyze and compute the updated delivery path

Produce a new ordered plan that is:

- **deterministic** (same inputs → same output)
- **conservative** (don’t guess when uncertain; instead, surface “Unplaced gaps”)

#### 3a) Detect gaps

Compute:

- `inMilestone`: all issue numbers currently assigned to the milestone
- `inDescriptionOrder`: all issue numbers referenced in any `Order:` block

Gaps:

- `gaps = inMilestone - inDescriptionOrder`

Also detect drift:

- `missingFromMilestone = inDescriptionOrder - inMilestone` (remove from ordering or flag)

#### 3b) Place gaps (heuristics, in priority order)

1. **Prerequisites / Infra slice**
    - If issue has label `infra` OR title prefix `infra(` OR mentions “Provision”, “RBAC”, “app settings wiring” → place into `Slice 0 — Prerequisites (infra)`.

2. **Coordinator / Epic**
    - If issue has label `epic` → place under a `Coordinator:` section for the slice it clearly governs.
    - Do not interleave epics into `Order:` unless your repo treats epics as executable tasks.

3. **Testing / Docs**
    - If label `test` → near the end of its relevant slice (after the behavior change it validates).
    - If label `docs` → last or near-last in its slice.

4. **Scope-based placement**
    - `scope:observability` after core behavior exists but before closing the slice.
    - `scope:world` vs `scope:ai` vs `scope:mcp` should usually follow the milestone’s slice taxonomy.

5. **Uncertain placement**
    - If a gap can’t be confidently placed, list it in an explicit “Unplaced gaps (needs decision)” section.

#### 3c) Handle duplicates / splits

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

- Description contains all slices and their `Order:` blocks.
- Every issue in milestone is either:
    - placed in an `Order:` block, or
    - referenced as a coordinator, or
    - listed under “Unplaced gaps”.

## Output template (recommended)

Within the milestone description, use a stable structure:

- Intro (1–2 lines)
- `## Slice 0 — Prerequisites (infra)`
- `## Exit criteria ...`
- `## Delivery slices`
    - `### Slice 1 ...` (+ optional `Coordinator:`)
    - `### Slice 2 ...`
    - ...
- Optional `## Unplaced gaps (needs decision)`

## Notes

- Prefer milestone **number** as the primary identifier (stable). Titles can change.
- Keep ordering rules explicit and minimal; avoid embedding long narratives.

---

Last reviewed: 2026-01-16
