# Milestone Description Template (Generated Delivery Slices)

GitHub does **not** provide a native milestone-description template. In this repo, milestone descriptions are **machine-generated** from:

- milestone membership
- formal GitHub issue dependencies
- issue labels and states

The source of truth is therefore the **issues and dependency graph**, not hand-written milestone prose.

## Generated shape

The shared engine in `scripts/lib/milestone-delivery-description.mjs` produces this stable structure:

```markdown
<milestone title> delivery plan is machine-generated from GitHub milestone membership and formal dependencies.

Edit issues, epics, and dependency links; rerun the milestone scripts instead of hand-editing this description.

## Dependency summary

- Open coordinator epics: <n>
- Closed groundwork: <n>
- Dependency layers: <n>
- Blocked outside this milestone: <n>
- Dependency conflicts: <n>

## Closed groundwork

- #<issue> <title>

## Delivery slices

### Slice 1 — Dependency layer 1

Coordinator:

- #<epic> <title>

Order:

1. #<issue> <title>
2. #<issue> <title>

### Slice 2 — Dependency layer 2

Depends on:

- Slice 1 complete

Order:

1. #<issue> <title>

## Blocked outside this milestone

- #<issue> <title>
    - blocked by #<external issue> <title>

## Dependency conflicts (needs decision)

- #<issue> <title>

<!-- AUTO-GENERATED: milestone-impact-report:start -->

## Delivery impact report (auto)

Milestone: **<title>** (#<number>) — state: **open|closed**

Issue summary (excluding PRs):

- Open: <n>
- Closed groundwork: <n>
- Superseded / not planned: <n>

<!-- AUTO-GENERATED: milestone-impact-report:end -->
```

## Notes

- `Coordinator:` is optional per slice and is used for open epics that govern a dependency layer.
- `Order:` lists are machine-generated in dependency-safe order.
- Blank lines immediately after `Order:` are allowed.
- Closed completed issues are rendered under `## Closed groundwork`.
- Closed `not_planned` or duplicate/split issues are treated as superseded planning noise and summarized only in the auto-generated block.
- Do **not** hand-edit the `AUTO-GENERATED` block.

## Automation

Because GitHub has no milestone templates, this repo bootstraps and regenerates milestone descriptions with scripts/workflows.

- Workflow: `.github/workflows/milestone-created-ensure-template.yml`
- Workflow: `.github/workflows/issues-sync-open-milestones-delivery-slices.yml`
- Workflow: `.github/workflows/milestone-closed-reanalysis.yml`
- Create/bootstrap one milestone: `scripts/ensure-milestone-has-delivery-slices.mjs`
- Reanalyze one milestone: `node scripts/reanalyze-milestone.mjs --repo <owner>/<repo> --milestone <N> --apply`
- Reanalyze all milestones: `node scripts/reanalyze-milestone.mjs --repo <owner>/<repo> --all --state all --apply`
- Strict validation: add `--strict` to fail if external blockers, dependency conflicts, or within-slice dependency-order violations remain
