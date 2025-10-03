# Roadmap Folder

## Roadmap Ordering

The implementation order lives **only** in the Project v2 numeric field `Implementation order`.

`docs/roadmap.md` is generated from that field; do not edit it manually.

To change ordering: edit numbers inline in the Project (keep contiguous integers; prefer append over reshuffle). Run `npm run sync:impl-order:apply` locally or wait for scheduled automation to refresh the markdown.

Status, scope, and type come from issue labels & project status field—change them directly on GitHub.

This folder no longer contains an editable ordering file; historical JSON snapshot removed to eliminate drift and merge noise.
