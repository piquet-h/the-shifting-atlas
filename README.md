<a name="top"></a>

# The Shifting Atlas

Experimental MMO-style, persistent-world text adventure prototype built on an Azure‑native, event‑driven architecture. The project is in an early exploration phase: code represents scaffolding; many gameplay and systems docs describe future intent.

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

---

## 1. Vision & High-Level Concept

Create a living text-first MMO-style world where player actions, NPC behaviors, factions, trade, and narrative arcs evolve via queued world events rather than real-time tick loops. The persistent graph (rooms, players, NPCs, events) will live in Cosmos DB (Gremlin). Azure Functions + Service Bus orchestrate state changes and narrative progress.

## 2. Architecture Overview

Planned Azure stack (see `docs/architecture/overview.md` + `docs/architecture/mvp-azure-architecture.md`):

- Frontend: Azure Static Web Apps (SWA) serving a Vite + React client, plus co-located lightweight Function API during early phase.
- Backend: Dedicated Azure Functions (HTTP + queue triggers) to be split out from SWA once complexity grows.
- Messaging: Azure Service Bus queue for world + NPC events.
- Data: Azure Cosmos DB (Gremlin API) graph for rooms, players, NPCs, quests, and edges (exits, relationships, dependencies).
- Observability: Application Insights (planned) for traces + custom events (player action, world mutation, quest progression).
- IaC: Bicep modules in `infrastructure/` (currently minimal).

Design Principles:

- Stateless compute; all authoritative world state in graph storage or event records.
- Event-driven progression (no polling loops / cron ticks for core simulation).
- Modular domain boundaries aligned with docs in `docs/modules/`.
- Gradual evolution: co-located API first → split services → richer orchestration.

## 3. Repository Layout

```
frontend/        React SPA + co-located Functions API (`frontend/api`)
backend/         Placeholder for future separated Function Apps (HTTP + queue workers)
infrastructure/  Bicep IaC (storage + placeholder Function Apps)
docs/            Architecture, gameplay, and systems design notes
```

Notable subpaths:

- `frontend/api/HealthCheck` – simple health endpoint.
- `frontend/api/HttpPlayerActions` – stub for player command dispatcher.
- `docs/modules/*` – domain modules (navigation, economy, factions, dialogue, etc.).

## 4. Current Implementation Status

| Area                            | Status                      | Notes                                            |
| ------------------------------- | --------------------------- | ------------------------------------------------ |
| Frontend UI                     | Basic shell + routing       | Landing + minimal pages                          |
| Frontend API (`frontend/api`)   | Health + player action stub | Served via SWA emulator locally (`swa start`)    |
| Standalone backend (`backend/`) | Scaffolding only            | No functions yet                                 |
| Queue / world logic             | Not implemented             | Will use Service Bus + queue triggered Functions |
| Cosmos DB integration           | Not implemented             | Planned Gremlin graph model                      |
| Infrastructure (Bicep)          | Minimal                     | Storage + two empty Function Apps                |
| CI/CD                           | Missing                     | Future GitHub Actions for SWA + Functions + IaC  |

## 5. Quick Start (Local Dev)

Prerequisites:

- Node.js >= 20
- (Optional) Azure Functions Core Tools v4 (`npm i -g azure-functions-core-tools@4 --unsafe-perm true`)

### Option A: Frontend Only

```bash
cd frontend
npm install
npm run dev
```

Visit: http://localhost:5173

### Option B: Unified SWA Emulator (Frontend + API on one origin)

Install once at repo root (includes all workspaces):

```bash
npm install --workspaces
```

Start the full stack (frontend dev server + co-located Functions API + emulator):

```bash
npm run swa   # alias for: swa start dev (uses swa-cli.config.json)
```

The SWA emulator UI + proxy lives at: http://localhost:4280

Underlying dev servers:

- Frontend: http://localhost:5173
- Functions API: http://localhost:7071

Test an API endpoint (health):

```bash
curl http://localhost:4280/api/website/health
```

If you prefer the explicit script names you can still run `npm run swa:start` or a verbose mode with `npm run swa:start:verbose`.

### Split Backend Functions (Future Evolution)

The `backend/` workspace currently contains only scaffolding (`BackendHealth`, `BackendPing`). Once world / queue logic moves out of the co-located `frontend/api` package, start the separated app like:

```bash
cd backend
npm install
npm run build
npm start   # builds then launches Azure Functions host
```

During the transition both `frontend/api` and `backend/` may coexist; the SWA emulator will continue serving only the co-located API unless configured otherwise.

### Build Artifacts

```bash
cd frontend
npm run build
```

Output: `frontend/dist/` (referenced in `swa-cli.config.json` via `outputLocation`).

## 6. Development Workflow

Refer to `docs/developer-workflow/local-dev-setup.md` and `docs/developer-workflow/branching-strategy.md` (branch model + feature isolation). Core guidelines:

- Keep Functions single-purpose; externalize shared logic into `backend/shared` (future) or a utility module.
- Reference a design doc before adding a new gameplay mechanic.
- Prefer event emission + queue processing over direct state mutation chains.

## 7. Roadmap (Near / Mid Term)

Short Term:

- Implement initial HTTP player command handler (parse + enqueue world event).
- Add Service Bus + queue triggered world processor Function.
- Introduce Cosmos DB Gremlin client + basic graph schema bootstrap.
- Add Application Insights + basic custom telemetry events.
- GitHub Actions: build/test → deploy SWA + Functions + IaC validation.

Mid Term:

- NPC behavior scripting + scheduled/event-chained actions.
- Quest & dialogue tree interpreter (per `docs/modules/quest-and-dialogue-trees.md`).
- Faction reputation + economy seed models.
- Extension framework for community modules.

## 8. Documentation Map

Key starting points:

- Architecture Overview: `docs/architecture/overview.md`
- MVP Azure Architecture: `docs/architecture/mvp-azure-architecture.md`
- Cost Optimisation: `docs/architecture/cost-optimisation.md`
- Gameplay Lore & World Rules: `docs/gameplay/lore.md`, `docs/modules/world-rules-and-lore.md`
- Navigation & Traversal: `docs/modules/navigation-and-traversal.md`
- Player Identity & Roles: `docs/modules/player-identity-and-roles.md`
- Quests & Dialogue: `docs/modules/quest-and-dialogue-trees.md`
- Economy & Trade: `docs/modules/economy-and-trade-systems.md`

## 9. Known Gaps & Technical Debt

- No Cosmos DB / Service Bus resources or code.
- Storage connection string placeholder in Function Apps (see `infrastructure/README.md`).
- No secret management / Key Vault integration yet.
- No automated CI/CD; manual local builds only.
- No test suite beyond placeholder (backend `test` script present, but no tests committed).

## 10. Contributing Guidelines

1. Open an issue describing the change or module alignment.
2. Link to the relevant design doc section you are implementing.
3. Keep Functions stateless; use environment configuration for integration endpoints.
4. Prefer small PRs: one domain concern per change.
5. Include README or doc updates when introducing new concepts.

### Coding Conventions (Early)

- ES Modules everywhere (`"type": "module"`).
- Async/await for all I/O.
- Avoid premature framework additions; keep dependencies lean.

## 11. License

MIT – see `LICENSE`.

---

## Infrastructure CI/CD (GitHub Actions)

A GitHub Actions workflow has been added at `.github/workflows/deploy-infrastructure.yml` to validate and deploy the Bicep templates under the `infrastructure/` folder.

Secrets required in the repository settings:

- `AZURE_CREDENTIALS` — JSON service principal credentials for `azure/login` (see Azure docs on creating a service principal and storing it as a secret). This replaces the Azure service connection used in Azure Pipelines.

How it works:

- On push to `main` touching files under `infrastructure/`, the workflow runs a `validate` job which ensures the resource group exists, disconnects any Static Web Apps that would conflict, and runs `az deployment group validate`.
- After validation, a `deploy` job runs (only on `main`) that performs the same pre-deploy cleanup and runs `az deployment group create --mode Complete` to apply the Bicep template.

Manual runs:

- Use the Actions tab and run the `Deploy Infrastructure` workflow manually via `workflow_dispatch`. You can optionally pass the `environment` input (default `prod`).

Notes:

- The workflow expects the Bicep template at `infrastructure/deploy.bicep` and uses `rg-website-<environment>` as the resource group name by default. Adjust the workflow if you need different naming conventions.

Return to top: [▲](#top)
