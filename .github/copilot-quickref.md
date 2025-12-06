---
description: Quick mnemonic reference for architecture, labels, formatting, MECE documentation
applyTo: '**'
---

# Copilot Quickref

Arch: SWA (React+Vite+Tailwind) + Azure Functions + API Mgmt + Service Bus + Cosmos (Gremlin + SQL dual persistence) + App Insights.

Graph (Gremlin): Locations | NPCs (spatial edges). Documents (SQL): Players | Inventory | Description Layers | Events. Edges = semantic (exits: north,south,east,west,up,down,in,out). IDs = GUID.

Function Naming: Http<VerbNoun>, Queue<ProcessThing>. Stateless, single purpose.

Core Scripts: `npm run build`, `npm run test`, `npm run lint`, `npm run typecheck`. (Backend-specific scripts in `backend/package.json`).

**MECE Documentation (7 Layers)**:

1. Vision (60k ft) → README.md | 2. Tenets (50k ft) → docs/tenets.md (WAF-aligned) | 3. Design Modules (40k ft) → docs/design-modules/ | 4. Architecture (30k ft) → docs/architecture/ | 5. Roadmap (20k ft) → docs/roadmap.md | 6. Examples (10k ft) → docs/examples/ | 7. Code (Ground) → backend/, frontend/, shared/, infrastructure/

**Navigation**: Start README.md (Vision) → links to all layers. New contributors: Examples → Tenets → Design Modules → Code.

Labels:

- Atomic issue: one `scope:*` + one type (`feature|enhancement|refactor|infra|docs|spike|test`).
- Epic: one `scope:*` + `epic` (no type label).
  No legacy `area:*`, `phase-*`, `priority:*`.

Milestones: M0 (ID 1) | M1 (ID 2) | M2 (ID 3) | M3 (ID 4) | M4 (ID 5) | M5 (ID 7) | M6 (ID 8). Names: "M4 Layering & Enrichment", "M6 Dungeon Runs". **Search by full name (`milestone:"M1 Traversal"`) not shorthand ("M1").**

Project implementation-order & scheduling automation has been removed (legacy docs referencing it are deprecated).

**TDD Required**: Write failing tests FIRST → implement to pass → refactor. Red → Green → Refactor cycle mandatory for all features/fixes.

Telemetry: Use shared constants only; include correlation IDs; no ad-hoc event names.

Formatting: Prettier (140 cols, 4-space indent, single quotes, no semicolons, no trailing commas). ESLint enforces domain/a11y/telemetry rules. (See `./copilot-language-style.md`.)

Do Not: Poll loops | duplicate labels | hardcode telemetry strings | lore walls in code | unchecked duplicate edges | skip direction validation | duplicate content across MECE layers | **write implementation before tests**.

Additions: New scope/milestone → update labels + roadmap + compact guide + reference ADR.

Detail: `./copilot-instructions.md` | Language/style: `./copilot-language-style.md`
Last reviewed: 2025-12-06

Commit Policy: PROPOSE ONLY (no auto stage/commit) unless user says: `stage now` / `commit now` / `open PR`.
