---
description: Quick mnemonic reference for architecture, labels, formatting, MECE documentation
applyTo: '**'
---

# Copilot Quickref

Arch: SWA (React+Vite+Tailwind) + Azure Functions + Azure ServiceBus + Cosmos (Gremlin + SQL) + App Insights.

Graph (Gremlin): Locations | NPCs (spatial edges). Documents (SQL): Players | Inventory | Description Layers | Events. Edges = semantic (exits: north,south,east,west,up,down,in,out). IDs = GUID.

Function Naming: Http<VerbNoun>, Queue<ProcessThing>. Stateless, single purpose.

Core Scripts: `npm run build`, `npm test`, `npm run lint`, `npm run typecheck`, `npm run package:backend`, `npm run board:snapshot`.

**MECE Documentation**: Canonical altitude table & reading order live in `docs/README.md` (Vision `README.md` → Tenets `docs/tenets.md` → Concepts `docs/concept/` → Design Modules `docs/design-modules/` → Architecture `docs/architecture/` → Workflows `docs/workflows/` → Roadmap `docs/roadmap.md` → Examples `docs/examples/` → Code).

Labels:

- Atomic issue: one `scope:*` + one type (`feature|enhancement|refactor|infra|docs|spike|test`).
- Epic: one `scope:*` + `epic` (no type label).
  No legacy `area:*`, `phase-*`, `priority:*`.

Milestones change over time. Prefer `docs/roadmap.md` as the human source-of-truth.
When searching, use the milestone title (for example: `milestone:"M1 Traversal"`) rather than shorthand strings.

Project implementation-order & scheduling automation has been removed (legacy docs referencing it are deprecated).

**TDD Required**: Write failing tests FIRST → implement to pass → refactor. Red → Green → Refactor cycle mandatory for all features/fixes.

Telemetry: Use shared constants only; include correlation IDs; no ad-hoc event names.

Formatting: Prettier (140 cols, 4-space indent, single quotes, no semicolons, no trailing commas). ESLint enforces domain/a11y/telemetry rules. (See `./copilot-language-style.md`.)

Do Not: Poll loops | duplicate labels | hardcode telemetry strings | lore walls in code | unchecked duplicate edges | skip direction validation | duplicate content across MECE layers | **write implementation before tests**.

Additions: New scope/milestone → update labels + roadmap + compact guide + reference ADR.

Detail: `./copilot-instructions.md` | Language/style: `./copilot-language-style.md`
Last reviewed: 2026-11-14

Commit Policy: PROPOSE ONLY (no auto stage/commit) unless user says: `stage now` / `commit now` / `open PR`.
