---
name: epic-health-audit
description: Audits epic structural integrity — sub-issue wiring, dependency completeness, acceptance criteria quality, label correctness, and tracking-issue overlap. Use when reviewing epic planning, after creating/splitting child issues, or when epic health looks suspect.
---

# Epic health audit

Use this skill when you are asked to:

- Audit an epic's planning quality (structure, AC, deps, labels)
- Validate parent/child wiring after issue creation or splitting
- Check dependency graph completeness for an epic and its children
- Detect tracking-issue overlap (progenitor AC duplicated in children)
- Review epic readiness before starting implementation work

## What this skill uses

- GitHub CLI: `gh`
- GitHub REST API (dependencies, sub-issues endpoints)
- Repo conventions: `.github/copilot-instructions.md` Sections 8, 17
- Companion skill: `milestone-delivery-path-reanalysis` (for fixing milestone descriptions after changes)

## Preconditions

1. GitHub CLI authenticated: `gh auth status`
2. Know the epic issue number

## Workflow

### Step 1: Gather the epic

```bash
gh api "repos/{owner}/{repo}/issues/{epicNumber}" --jq '{number,title,state,labels:[.labels[].name],milestone:.milestone.title}'
```

Verify:

- Label `epic` is present
- Exactly 1 `scope:*` label
- No type label (`feature`, `enhancement`, etc.) — epics use `epic` only

### Step 2: Fetch sub-issues

```bash
gh api "repos/{owner}/{repo}/issues/{epicNumber}/sub_issues" --jq '.[] | {number,title,state}'
```

Compare to the epic body's "Child Issues Planned" checklist:

- Every unchecked body item should have a corresponding sub-issue attached
- Checked items should either be closed issues or explicitly noted as delivered

**Flag**: Body lists children that aren't attached as formal sub-issues.

### Step 3: Fetch dependency graph

For the epic itself:

```bash
gh api "repos/{owner}/{repo}/issues/{epicNumber}/dependencies/blocked_by" --jq '.[] | {number,title,state}'
gh api "repos/{owner}/{repo}/issues/{epicNumber}/dependencies/blocking" --jq '.[] | {number,title,state}'
```

For each child issue:

```bash
for N in <child_numbers>; do
  echo -n "#$N: blocked_by="
  gh api "repos/{owner}/{repo}/issues/$N/dependencies/blocked_by" --jq '[.[] | .number] | sort'
  echo -n "  blocking="
  gh api "repos/{owner}/{repo}/issues/$N/dependencies/blocking" --jq '[.[] | .number] | sort'
done
```

Check for:

- **Missing deps**: Children with no `blocked_by` links that logically depend on siblings (data model before behavior, behavior before telemetry, telemetry before tests)
- **Orphan children**: Sub-issues with no dependency links at all — verify they're truly independent entry points
- **Cross-epic deps**: Children blocking/blocked-by issues in other epics — verify those links are intentional and correct

### Step 4: Audit acceptance criteria quality (Section 17.11)

For each child issue, read the body and check:

| Gate             | Requirement                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------- |
| AC count         | ≤10 acceptance checkboxes                                                                     |
| Edge cases       | ≥1 edge case bullet                                                                           |
| Risk tag         | Exactly 1 risk tag present (`LOW`, `DATA-MODEL`, `RUNTIME-BEHAVIOR`, `BUILD-SCRIPT`, `INFRA`) |
| Out of Scope     | Section present                                                                               |
| Prohibited words | Body does NOT contain: "Phase", "Stage", "Groundwork", "Follow-up Task Checklist"             |
| Single trigger   | Does not define more than one new function trigger or script                                  |

**Tip**: Use an Explore subagent to batch-read all children and produce a summary table.

### Step 5: Check labels

For each child:

- Exactly 1 `scope:*` label
- Exactly 1 type label (`feature`, `enhancement`, `refactor`, `infra`, `docs`, `spike`, `test`)
- If an issue spans two scopes (e.g., telemetry + world), the secondary scope should be added as a co-label

For the epic:

- Label `epic` + exactly 1 `scope:*` label
- NO type label

### Step 6: Detect tracking-issue overlap

If any issue in the milestone has checked AC that overlap with unchecked children's AC:

- The progenitor issue should be annotated (comment explaining delegation)
- Or its AC should be trimmed to only the delta not covered by children

### Step 7: Report findings

Produce a structured summary:

```
## Epic #{number} Health Report

### Structure
- Sub-issues attached: X/Y (Y = body checklist unchecked items)
- Missing sub-issues: [list]

### Dependencies
- Total links: X
- Missing deps: [list with rationale]
- Orphan children (no deps): [list]

### AC Quality
| Issue | AC ✓ | Edge Cases | Risk | Out of Scope | Issues |
|-------|------|------------|------|--------------|--------|
| #NNN  | 6   | ✓ 3       | ✓    | ✓            | None   |

### Labels
- Violations: [list]

### Overlap
- Progenitor issues needing delegation: [list]

### Recommended Actions
| # | Action | Priority |
|---|--------|----------|
| 1 | ...    | High     |
```

### Step 8: Apply fixes (if authorized)

After reporting, offer to:

1. Add missing dependency links via REST API
2. Add missing labels
3. Create missing sub-issues from unchecked body items
4. Add delegation comments to progenitor issues
5. Reanalyze milestone (invoke `milestone-delivery-path-reanalysis` skill)

**Do not auto-apply fixes without user confirmation** — the report is the primary deliverable.

## Dependency ordering heuristics

When checking for missing dependency links, use this precedence:

1. **Data model** issues (schema, atlas data, seed files) → come first
2. **Runtime behavior** issues (resolvers, handlers, batch logic) → blocked by data model
3. **Telemetry** issues → blocked by the behavior they instrument
4. **Test-only** issues → blocked by the behavior they test
5. **Documentation** issues → blocked by the data/behavior they document, or parallel if spec is stable

## Common anti-patterns to flag

- Epic body says "Child Issues Planned" but no formal sub-issues are attached
- Tracking issue with partially-delivered AC whose remaining items are fully covered by children
- Child issues with `blocked_by` linking to issues outside the milestone without explicit cross-milestone rationale
- Children whose title starts with "Phase" or "Stage" (violates Section 17.11)
- More than one risk tag on a single issue

## Integration with other skills

- After applying fixes, run `milestone-delivery-path-reanalysis` to update slice ordering
- If new issues are created, ensure they follow Section 17.3 (atomic issue template)
- If AC changes affect runtime code, the `tdd-first-workflow` skill applies when implementing

---

Last reviewed: 2026-03-22
