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

Order:

1. #<issue> <title>
2. #<issue> <title>

### Slice 2 — <optional>

Order:

1. #<issue> <title>
```

## Automation (recommended)

Because GitHub has no milestone templates, this repo enforces the section on milestone creation via a workflow, and offers a script you can run locally to backfill existing milestones.

- Workflow: `.github/workflows/milestone-created-ensure-template.yml`
- Local backfill: `scripts/ensure-milestone-has-delivery-slices.mjs`
