# Roadmap (GitHub is the source of truth)

This repo intentionally keeps planning artifacts in **GitHub** (milestones, epics, and dependency links) so they don’t drift.

This file is a **pointer doc** only. If you find yourself adding issue-number lists here, stop and update GitHub metadata instead.

## Where the roadmap lives

- **Milestones** (delivery buckets): https://github.com/piquet-h/the-shifting-atlas/milestones
- **Epics** (coordination shells): issues labeled `epic` with formal sub-issues (not checklists)
- **Dependencies**: GitHub issue dependency links (“blocked by” / “blocking”) where applicable

## Canonical delivery order (within a milestone)

Milestone descriptions are machine-generated from GitHub milestone membership plus formal dependency links and use a single enforced format:

- `## Dependency summary`
- `## Closed groundwork`
- `## Delivery slices`
- Per-slice `Coordinator:` and `Order:` blocks (the ordered plan)
- Optional external-blocker / dependency-conflict sections when the graph is not fully runnable

Template:

- `docs/examples/milestone-description-template.md`

Automation:

- `scripts/ensure-milestone-has-delivery-slices.mjs` bootstraps a deterministic generated milestone description when a milestone is created.
- `scripts/sync-open-milestones-delivery-slices.mjs` re-syncs open milestone descriptions when issue membership or titles change.
- `scripts/reanalyze-milestone.mjs` is the follow-up tool after milestone CRUD (issues added/removed/reordered/split); it regenerates dependency-first slices and can run in bulk via `--all --state <open|closed|all>`.
- `scripts/lib/milestone-delivery-description.mjs` is the shared engine (issue classification, dependency graph, parsing helpers, rendering) consumed by the milestone scripts.

## How to answer common questions

- “What’s implemented today?” → `docs/architecture/overview.md`
- “What is the single-turn Foundry flow?” → `docs/workflows/foundry/resolve-player-command.md`
- “What are the AI/MCP boundaries?” → `docs/architecture/agentic-ai-and-mcp.md`
- “What’s next / in what order?” → the relevant GitHub milestone description (`Delivery slices`)

---

_Last updated: 2026-02-23_
