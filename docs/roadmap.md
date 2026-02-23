# Roadmap (GitHub is the source of truth)

This repo intentionally keeps planning artifacts in **GitHub** (milestones, epics, and dependency links) so they don’t drift.

This file is a **pointer doc** only. If you find yourself adding issue-number lists here, stop and update GitHub metadata instead.

## Where the roadmap lives

- **Milestones** (delivery buckets): https://github.com/piquet-h/the-shifting-atlas/milestones
- **Epics** (coordination shells): issues labeled `epic` with formal sub-issues (not checklists)
- **Dependencies**: GitHub issue dependency links (“blocked by” / “blocking”) where applicable

## Canonical delivery order (within a milestone)

Milestone descriptions use a single enforced format:

- `## Delivery slices`
- Per-slice `Order:` lists (the ordered plan)

Template:

- `docs/examples/milestone-description-template.md`

Automation:

- `scripts/ensure-milestone-has-delivery-slices.mjs` ensures the section exists and keeps issue titles in sync.

## How to answer common questions

- “What’s implemented today?” → `docs/architecture/overview.md`
- “What is the single-turn Foundry flow?” → `docs/workflows/foundry/resolve-player-command.md`
- “What are the AI/MCP boundaries?” → `docs/architecture/agentic-ai-and-mcp.md`
- “What’s next / in what order?” → the relevant GitHub milestone description (`Delivery slices`)

---

_Last updated: 2026-02-23_
