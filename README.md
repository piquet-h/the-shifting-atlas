<a name="top"></a>

# The Shifting Atlas

Experimental persistent‑world (MMO‑style) text adventure prototype on an Azure‑native, event‑driven stack. Code today = lightweight scaffolding; most domain depth lives in design docs and roadmap.

> Core Tenet: Accessibility from day one. All features must satisfy baseline WCAG 2.2 AA intent (see `docs/ux/accessibility-guidelines.md`) before merge.

---

## Table of Contents

1. Vision & High-Level Concept
2. Architecture Overview
3. Repository Layout
4. Current Implementation Status
5. Quick Start (Local Dev)
6. Development Workflow
7. Roadmap
8. Documentation Map
9. Known Gaps & Technical Debt
10. Contributing Guidelines
11. License
12. Accessibility (Core Tenet)

---

## 1. Vision & High-Level Concept

Create a living text-first MMO-style world where player actions, NPC behaviors, factions, trade, and narrative arcs evolve via queued world events rather than real-time tick loops. The persistent graph (rooms, players, NPCs, events) will live in Cosmos DB (Gremlin). Azure Functions + Service Bus orchestrate state changes and narrative progress.

## 2. Architecture Overview

Current implemented slice + planned extensions (details in `docs/architecture/mvp-azure-architecture.md`):

Implemented now:

- Static Web App (SWA) hosting React (Vite) + co‑located Azure Functions under `frontend/api`.
- Bicep template provisioning SWA + Cosmos DB (Gremlin) + Key Vault (for Cosmos key) – see `infrastructure/`.

Planned (not yet in code):

- Service Bus (world + NPC event queue).
- Queue‑triggered Functions for world simulation & NPC behaviors (likely moved to `backend/`).
- Application Insights telemetry (player actions, world mutations).
- Managed identity / RBAC graph access (remove raw key usage entirely).

Design principles:

- Stateless Functions; authoritative world state lives in the graph + event stream.
- Event emission drives progression (avoid tight loops / cron ticks).
- Small, modular additions matched to a design doc before coding.
- Start co‑located, then separate concerns when complexity warrants.

## 3. Repository Layout

```
frontend/         React SPA + co‑located Functions API (`frontend/api`)
frontend/api/     Health + player action stub Functions
backend/          Future separated Function App scaffolding
infrastructure/   Bicep (SWA, Cosmos, Key Vault)
docs/             Architecture & domain design modules
```

Notable:

- `frontend/api/websiteHealthCheck.ts` – health endpoint.
- `frontend/api/websiteHttpPlayerActions.ts` – action dispatch placeholder.
- `docs/modules/*` – domain design (future mechanics, keep as roadmap references).

## 4. Current Implementation Status

| Area                            | Status                  | Notes                                                |
| ------------------------------- | ----------------------- | ---------------------------------------------------- |
| Frontend UI                     | Basic shell + routing   | Landing + sample pages (About, DemoForm)             |
| Frontend API (`frontend/api`)   | Health + action stub    | SWA emulator + build workflow                        |
| Standalone backend (`backend/`) | Scaffolding only        | Will host queue/world logic later                    |
| Queue / world logic             | Not implemented         | Planned Service Bus + queue triggers                 |
| Cosmos DB integration           | Provisioned infra only  | No runtime graph code yet                            |
| Key Vault integration           | Provisioned (secrets)   | Cosmos key secret seeded; no identity usage yet      |
| Infrastructure (Bicep)          | Core resources in place | SWA + Cosmos + Key Vault                             |
| CI/CD                           | Partial                 | SWA + infra workflows present; test pipeline missing |

## 5. Quick Start (Local Dev)

Prerequisites:

- Node.js >= 20
- (Optional) Azure Functions Core Tools v4 (for direct Functions host runs)

### Option A: Frontend Only

```bash
cd frontend
npm install
npm run dev
```

Visit: http://localhost:5173

### Option B: Unified SWA Emulator (Frontend + API on one origin)

Install deps once at repo root (workspaces):

```bash
npm install --workspaces
```

Start unified SWA emulator (frontend + Functions):

```bash
npm run swa
```

The SWA emulator UI + proxy lives at: http://localhost:4280

Underlying dev servers:

- Frontend: http://localhost:5173
- Functions API: http://localhost:7071

Health check:
`curl http://localhost:4280/api/website/health`

If you prefer the explicit script names you can still run `npm run swa:start` or a verbose mode with `npm run swa:start:verbose`.

### Split Backend Functions (Planned)

`backend/` is empty scaffolding. Future queue & world processors will live there. Until then all endpoints remain co‑located.

### Build Artifacts

```bash
cd frontend
npm run build
```

Output: `frontend/dist/` (referenced in `swa-cli.config.json` via `outputLocation`).

## 6. Development Workflow

See `docs/developer-workflow/local-dev-setup.md` for environment setup. Guidelines:

- Keep handlers small & stateless; extract shared helpers once they appear twice.
- Link a design doc section when opening a feature PR.
- Prefer enqueueing a world event over cascading direct mutations.

## 7. Roadmap (Near / Mid Term)

(Roadmap retained; see design docs for fuller detail.)

## 8. Documentation Map

Key starting points:

- MVP Azure Architecture: `docs/architecture/mvp-azure-architecture.md`
- World Rules & Lore: `docs/modules/world-rules-and-lore.md`
- Navigation & Traversal: `docs/modules/navigation-and-traversal.md`
- Player Identity & Roles: `docs/modules/player-identity-and-roles.md`
- Quests & Dialogue: `docs/modules/quest-and-dialogue-trees.md`
- Economy & Trade: `docs/modules/economy-and-trade-systems.md`

## 9. Known Gaps & Technical Debt

Current gaps:

- No Service Bus or queue processors.
- No runtime Cosmos DB integration code (graph client, schema bootstrap).
- No Application Insights telemetry.
- Minimal test coverage (none checked in yet).
- No managed identity consumption in Functions (uses key secret placeholder only).

## 10. Contributing Guidelines

1. Open an issue describing the change & referencing design doc section.
2. Keep functions stateless; configuration via env only.
3. Small focused PRs (single domain concern).
4. Update docs/README when adding a new concept.

### Coding Conventions (Early)

- ES Modules everywhere (`"type": "module"`).
- Async/await for all I/O.
- Avoid premature framework additions; keep dependencies lean.

## 11. License

MIT – see `LICENSE`.

## 12. Accessibility (Core Tenet)

Accessibility is treated as a first‑class requirement (not a polish phase). Refer to `docs/ux/accessibility-guidelines.md` for:
- WCAG 2.2 AA mapping to game concerns
- Required skip link, landmarks, focus management
- Live announcement strategy for world events
- Definition of Done checklist additions

### Automated Axe Scan
Run locally:

```bash
npm install --workspaces
npm run a11y  # runs vite dev server then axe scan of http://localhost:5173
```

GitHub Actions workflow `.github/workflows/a11y.yml` executes on PRs touching frontend code. Reports are saved as an artifact (`axe-report`). The command currently fails build on any violation (`--exit 1`). Adjust strategy later for severity filtering.

PRs introducing UI or interaction changes must note: keyboard path validated, no new a11y lint violations, focus order predictable, and contrast checked. Regressions block merge.

---

Return to top: [▲](#top)
