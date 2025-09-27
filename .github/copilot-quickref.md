# Copilot Quickref

Arch: SWA (React+Vite+Tailwind) + Azure Functions + API Mgmt + Service Bus + Cosmos (Gremlin) + App Insights.

Vertices: Locations | Players | NPCs | Events. Edges = semantic (exits: north,south,east,west,up,down,in,out). IDs = GUID.

Function Naming: Http<VerbNoun>, Queue<ProcessThing>. Stateless, single purpose.

Core Scripts:

- Validate order: `npm run sync:impl-order:validate`
- Apply order: `npm run sync:impl-order:apply`
- List next: `npm run sync:impl-order:next`
- Labels reconcile: `npm run sync:labels`

Labels: One `scope:*` + one type (`feature|enhancement|refactor|infra|docs|spike|test`). No legacy `area:*`, `phase-*`, `priority:*`.

Ordering Source: `roadmap/implementation-order.json` (contiguous integers).

Next Up Logic: Non-Done → lowest order → earliest milestone → scope priority (core > world > traversal > ai > others). Avoid parallel starts unless requested.

Telemetry: Use shared constants only; include correlation IDs; no ad-hoc event names.

Do Not: Poll loops | duplicate labels | hardcode telemetry strings | lore walls in code | unchecked duplicate edges | skip direction validation.

Additions: New scope/milestone → update labels + roadmap + compact guide + reference ADR.

Full detail: `./copilot-instructions.full.md` | Compact guide: `./copilot-instructions.md`

Commit Policy: PROPOSE ONLY (no auto stage/commit) unless user says: `stage now` / `commit now` / `open PR`.
