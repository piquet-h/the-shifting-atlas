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
    10.1 Issue Taxonomy (Simplified)
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

| Area                            | Status                     | Notes                                                |
| ------------------------------- | -------------------------- | ---------------------------------------------------- |
| Frontend UI                     | Auth-aware shell + routing | Landing homepage (hero + auth states)                |
| Frontend API (`frontend/api`)   | Health + action stub       | SWA emulator + build workflow                        |
| Standalone backend (`backend/`) | Scaffolding only           | Will host queue/world logic later                    |
| Queue / world logic             | Not implemented            | Planned Service Bus + queue triggers                 |
| Cosmos DB integration           | Provisioned infra only     | No runtime graph code yet                            |
| Key Vault integration           | Provisioned (secrets)      | Cosmos key secret seeded; no identity usage yet      |
| Infrastructure (Bicep)          | Core resources in place    | SWA + Cosmos + Key Vault                             |
| CI/CD                           | Partial                    | SWA + infra workflows present; test pipeline missing |

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

### Authentication (Azure AD / Entra ID) – Single‑Tenant Configuration (MVP Implemented)

The Static Web App uses Azure AD (Entra ID) Easy Auth and is currently locked to a single tenant:

Tenant ID: `fecae6e9-696f-46e4-b1c8-5b471b499a24`

`frontend/public/staticwebapp.config.json` contains a hard‑coded `openIdIssuer` pointing at that tenant (v2.0 endpoint). If multi‑tenant or environment‑specific tenant substitution is required later, reintroduce a `<TENANT_ID>` placeholder and a replacement step in the deploy workflow.

Deployment still provisions / refreshes SWA app settings (`AAD_CLIENT_ID`, `AAD_TENANT_ID`, optional `AAD_CLIENT_SECRET`) using `az staticwebapp appsettings set` before `swa deploy`.

Required GitHub repository (or org) Secrets (Settings → Secrets and variables → Actions):

| Secret Name             | Source (Azure Portal)                                    | Used For                                 |
| ----------------------- | -------------------------------------------------------- | ---------------------------------------- |
| `AZURE_CLIENT_ID`       | App Registration → Overview → Application (client) ID    | Azure OIDC login + passed to SWA setting |
| `AZURE_TENANT_ID`       | Azure AD (Entra) → Tenant / Directory ID                 | Azure OIDC login + tenant substitution   |
| `AZURE_SUBSCRIPTION_ID` | Subscription overview                                    | Azure OIDC login (scopes actions)        |
| `AZURE_CLIENT_SECRET`   | App Registration → Certificates & secrets (secret value) | (Optional) SWA AAD confidential flow     |

SWA App Settings populated (mapped in workflow):

| Setting Key         | Value Source             | Referenced In                                     |
| ------------------- | ------------------------ | ------------------------------------------------- |
| `AAD_CLIENT_ID`     | `AZURE_CLIENT_ID` secret | `staticwebapp.config.json` registration (by name) |
| `AAD_TENANT_ID`     | `AZURE_TENANT_ID` secret | (Optional for app logic / diagnostics)            |
| `AAD_CLIENT_SECRET` | `AZURE_CLIENT_SECRET`    | `staticwebapp.config.json` (by name, optional)    |

Security notes:

- The workflow never echoes secret values; only key names are shown.
- Rotating the client secret requires updating the GitHub secret; the next deploy overwrites the SWA setting.
- If you adopt certificate-based credentials later, remove `AZURE_CLIENT_SECRET` and rely on federated credentials.

Local emulator:

- The SWA CLI local auth emulator is used; if you need to test provider redirects locally you can configure a dev app registration redirect URI pointing to `http://localhost:4280/.auth/login/aad/callback`.

Local auth convenience:

- Run the whole stack (SWA emulator + frontend dev server + API functions defined in `frontend/api`) from the repo root with: `npm run swa`.
- Internally this delegates to the frontend workspace's SWA CLI config (see `swa-cli.config.json`). Use `-w frontend` explicitly if you prefer: `npm run swa -w frontend`.
- Missing `AAD_CLIENT_ID` will simply result in anonymous local sessions.
- For pure public client (PKCE) local usage you may omit `AAD_CLIENT_SECRET`.
- The SPA includes a lightweight `useAuth` hook which fetches `/.auth/me` and drives conditional UI (loading spinner, unauthenticated hero CTA -> provider login, authenticated personalized panel). Sign-out redirects to `/.auth/logout` and broadcasts a cross-tab refresh.

Next steps (future hardening):

- Optional: revert to placeholder + dynamic substitution for multi‑environment builds.
- Manage Entra app via IaC (Bicep/Terraform) and output identifiers automatically.
- Add a preflight script validating required app settings before deploy.

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
- Minimal test coverage (none checked in yet).
- No managed identity consumption in Functions (uses key secret placeholder only).
- Auth currently client-only: backend Functions do not yet enforce role/claim authorization beyond SWA default.

## 10. Contributing Guidelines

1. Open an issue describing the change & referencing design doc section.
2. Keep functions stateless; configuration via env only.
3. Small focused PRs (single domain concern).
4. Update docs/README when adding a new concept.

### 10.1 Issue Taxonomy (Simplified)

Project planning uses a deliberately **minimal label + milestone scheme** (see `docs/developer-workflow/issue-taxonomy.md` for full details). Only these axes exist:

- `scope:` one of `core|world|traversal|ai|mcp|systems|observability|devx|security`
- Type (no prefix) one of `feature|enhancement|refactor|infra|docs|spike|test`
- Milestone (no label): `M0 Foundation`, `M1 Traversal`, `M2 Observability`, `M3 AI Read`, `M4 AI Enrich`, `M5 Systems`
- Implementation Order (Project field, numeric): positive integers (1 = earliest planned execution)

Rules:

- Exactly one of each labeled axis (`scope:`, Type). No `priority:` labels (replaced by Implementation Order field in Project).
- No `area:*`, `phase-*`, `status:*`, or `priority:*` labels—remove if encountered.
- Internal module sub‑phases (e.g. traversal normalization N1..N5) stay in docs, not labels.

Migration (2025-09-27): Old Phase 0/1/2 terminology maps to Milestones `M3 AI Read`, `M4 AI Enrich`, `M5 Systems` respectively. Remove deprecated labels during triage.
Migration (2025-09-27 later): Removed the `kind:` prefix; existing `kind:feature|…` labels replaced with bare type labels.
Migration (2025-09-27 final): Removed `priority:` axis; replaced with Project numeric field "Implementation Order" (lower number = earlier). Existing `priority:P0` items seeded 1..N.

### Coding Conventions (Early)

- ES Modules everywhere (`"type": "module"`).
- Async/await for all I/O.
- Avoid premature framework additions; keep dependencies lean.
- Formatting (indentation, quotes, commas) is auto-enforced by Prettier/ESLint; run `npm run format` locally before pushing.

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

### Telemetry (Application Insights)

Infrastructure now provisions an Application Insights resource and exposes its connection string as a deployment output.

Backend (Functions): Automatic collection (requests, dependencies, exceptions, traces) is enabled when the environment variable `APPLICATIONINSIGHTS_CONNECTION_STRING` is present. The Static Web App's integrated Functions runtime receives this via app settings (set in Bicep). Local development: populate `backend/local.settings.json` with the connection string to enable telemetry; leave blank to disable.

Frontend (React SPA): The web SDK initializes if `VITE_APPINSIGHTS_CONNECTION_STRING` is defined (e.g. in Static Web App configuration or a local `.env.local`). It auto-tracks page views, route changes, fetch/XHR, and JavaScript errors. No connection string = graceful no‑op.

Local example `.env.local` (frontend):

```bash
VITE_APPINSIGHTS_CONNECTION_STRING="InstrumentationKey=...;IngestionEndpoint=...;LiveEndpoint=..."
```

Custom events (backend): import `trackEvent` from `backend/src/shared/telemetry.ts`.
Custom events (frontend): import `{ trackEvent }` from `src/services/telemetry.ts`.

Sampling and PII: default 100% sampling; IP masking / personally identifying data not manually collected. Adjust later via SDK config (e.g. `setAutoCollectConsole(false)` or processor filters) before production scale.

---

Return to top: [▲](#top)
