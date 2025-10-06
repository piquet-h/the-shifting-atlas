# Copilot Quickref

Arch: SWA (React+Vite+Tailwind) + Azure Functions + API Mgmt + Service Bus + Cosmos (Gremlin + SQL dual persistence) + App Insights.

Graph (Gremlin): Locations | NPCs (spatial edges). Documents (SQL): Players | Inventory | Description Layers | Events. Edges = semantic (exits: north,south,east,west,up,down,in,out). IDs = GUID.

Function Naming: Http<VerbNoun>, Queue<ProcessThing>. Stateless, single purpose.

Core Scripts (current): `npm run seed:world`, `npm run validate:telemetry-separation`, `npm run test:build-telemetry-guard`.

Labels:

- Atomic issue: one `scope:*` + one type (`feature|enhancement|refactor|infra|docs|spike|test`).
- Epic: one `scope:*` + `epic` (no type label).
  No legacy `area:*`, `phase-*`, `priority:*`.

Project implementation-order & scheduling automation has been removed (legacy docs referencing it are deprecated).

Telemetry: Use shared constants only; include correlation IDs; no ad-hoc event names.

Formatting: Prettier (140 cols, 4-space indent, single quotes, no semicolons, no trailing commas). ESLint enforces domain/a11y/telemetry rules. (See `./copilot-language-style.md`.)

Do Not: Poll loops | duplicate labels | hardcode telemetry strings | lore walls in code | unchecked duplicate edges | skip direction validation.

Additions: New scope/milestone → update labels + roadmap + compact guide + reference ADR.

Detail: `./copilot-instructions.md` | Language/style: `./copilot-language-style.md`

Commit Policy: PROPOSE ONLY (no auto stage/commit) unless user says: `stage now` / `commit now` / `open PR`.
