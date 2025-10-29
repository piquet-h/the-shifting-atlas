---
description: Quick mnemonic reference for architecture, labels, formatting
applyTo: '**'
---

# Copilot Quickref

Arch: SWA (React+Vite+Tailwind) + Azure Functions + API Mgmt + Service Bus + Cosmos (Gremlin + SQL dual persistence) + App Insights.

Graph (Gremlin): Locations | NPCs (spatial edges). Documents (SQL): Players | Inventory | Description Layers | Events. Edges = semantic (exits: north,south,east,west,up,down,in,out). IDs = GUID.

Function Naming: Http<VerbNoun>, Queue<ProcessThing>. Stateless, single purpose.

Core Scripts: `npm run build`, `npm run test`, `npm run lint`, `npm run typecheck`. (Backend-specific scripts in `backend/package.json`).

Labels:

-   Atomic issue: one `scope:*` + one type (`feature|enhancement|refactor|infra|docs|spike|test`).
-   Epic: one `scope:*` + `epic` (no type label).
    No legacy `area:*`, `phase-*`, `priority:*`.

Milestones: M0 (ID 1) | M1 (ID 2) | M2 (ID 3) | M3 (ID 4) | M4 (ID 5) | M5 (ID 7) | M6 (ID 8). Names: "M4 Layering & Enrichment", "M6 Dungeon Runs". **Search by full name (`milestone:"M1 Traversal"`) not shorthand ("M1").**

Project implementation-order & scheduling automation has been removed (legacy docs referencing it are deprecated).

Telemetry: Use shared constants only; include correlation IDs; no ad-hoc event names.

Formatting: Prettier (140 cols, 4-space indent, single quotes, no semicolons, no trailing commas). ESLint enforces domain/a11y/telemetry rules. (See `./copilot-language-style.md`.)

Do Not: Poll loops | duplicate labels | hardcode telemetry strings | lore walls in code | unchecked duplicate edges | skip direction validation.

Additions: New scope/milestone → update labels + roadmap + compact guide + reference ADR.

Detail: `./copilot-instructions.md` | Language/style: `./copilot-language-style.md`
Last reviewed: 2025-10-29

Commit Policy: PROPOSE ONLY (no auto stage/commit) unless user says: `stage now` / `commit now` / `open PR`.
