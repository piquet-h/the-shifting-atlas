# Milestone Description Template (Delivery Slices)

GitHub does **not** provide a native “milestone description template” feature (unlike issue/PR templates). To keep milestone descriptions consistent and automation-friendly, this repo uses a **Delivery slices** section with deterministic **Order:** lists.

This format is required for:

- Automated delivery-order updates when issues close (agent-assisted)
- Keeping milestone descriptions as a single concise source of truth

## Template

Copy/paste the following into the milestone description (or let automation apply it):

```markdown
<1–3 lines: focus / why this milestone exists>

## Delivery slices

### Slice 1 — <short slice name>

Coordinator: #<epic-issue> <epic title>

Order:

1. #<issue> <title>
2. #<issue> <title>

### Slice 2 — <optional>

Order:

1. #<issue> <title>

<!-- AUTO-GENERATED: milestone-impact-report:start -->
## Delivery impact report (auto)

> Last updated by `reanalyze-milestone.mjs` on <date>

| # | Title | State | Labels |
|---|-------|-------|--------|
| #N | issue title | open | scope:x, feature |

<!-- AUTO-GENERATED: milestone-impact-report:end -->
```

Notes:

- `Coordinator:` is optional per slice. Use it for epics that govern a slice but are not in the `Order:` list.
- The `AUTO-GENERATED` block is managed by `scripts/reanalyze-milestone.mjs`. Do not edit it manually.
- Blank lines within an `Order:` block are allowed and do not terminate parsing.

## Automation (recommended)

Because GitHub has no milestone templates, this repo enforces the section on milestone creation via a workflow, and offers a script you can run locally to backfill existing milestones.

- Workflow: `.github/workflows/milestone-created-ensure-template.yml`
- Local backfill: `scripts/ensure-milestone-has-delivery-slices.mjs`
- Reanalysis (single): `node scripts/reanalyze-milestone.mjs --repo <owner>/<repo> --milestone <N> --apply`
- Reanalysis (all open): `node scripts/reanalyze-milestone.mjs --repo <owner>/<repo> --all --apply`
- Shared engine: `scripts/lib/milestone-delivery-description.mjs`
