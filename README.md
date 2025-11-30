<a name="top"></a>

# The Shifting Atlas

---

## Vision (60,000 ft)

**A MMORPG implemented as a text adventure like Zork, but with Generative AI as the dungeon master in a fully open and immersive world.**

Create a living text-first MMO-style world where player actions, NPC behaviors, factions, trade, and narrative arcs evolve via queued world events rather than real-time tick loops. **Generative AI acts as the Dungeon Master**, orchestrating narrative depth, spatial storytelling, and humorous guidance. Players traverse a graph-based world enriched by additive description layers, engage with deterministic AI assistance, and influence evolving world history through validated events.

The platform balances imaginative emergence with architectural discipline: a **dual persistence model** separates immutable world structure (Cosmos Gremlin: locations, exits, spatial relationships) from mutable player/inventory/event state (Cosmos SQL API: authoritative as of ADR-004). Strict telemetry governance and event-driven progression enable replay, observability, and safe extension.

> **Core Tenet**: Accessibility from day one. All features must satisfy baseline WCAG 2.2 AA intent (see [`docs/ux/accessibility-guidelines.md`](docs/ux/accessibility-guidelines.md)) before merge.

---

## Documentation Hierarchy (MECE: Mutually Exclusive, Collectively Exhaustive)

Navigate the documentation by altitude—each layer serves a distinct purpose with no overlap:

| Layer                 | Altitude     | Purpose                                                     | Key Documents                                                                                                |
| --------------------- | ------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **1. Vision**         | 60,000 ft    | Inspire and set direction                                   | This README (Vision section above)                                                                           |
| **2. Tenets**         | 50,000 ft    | Non-negotiable decision-making rules                        | [Tenets](docs/tenets.md) (adapted from Microsoft Well-Architected Framework)                                 |
| **3. Design Modules** | 40,000 ft    | Translate Vision + Tenets into concrete gameplay systems    | [Design Modules](docs/design-modules/README.md) (world rules, navigation, AI, quests)                        |
| **4. Architecture**   | 30,000 ft    | Technical design implementing modules and respecting tenets | [MVP Azure Architecture](docs/architecture/mvp-azure-architecture.md), [ADRs](docs/adr/)                     |
| **5. Roadmap**        | 20,000 ft    | Staged progression from Vision to Code (milestones M0–M6)   | [Roadmap](docs/roadmap.md)                                                                                   |
| **6. Examples**       | 10,000 ft    | Practical code walkthroughs and onboarding aids             | [Examples](docs/examples/README.md) (function endpoints, Gremlin queries, seed scripts, a11y tests)          |
| **7. Code**           | Ground Level | Runnable implementation                                     | [`backend/`](backend/), [`frontend/`](frontend/), [`shared/`](shared/), [`infrastructure/`](infrastructure/) |

**For New Contributors**: Start at Layer 6 (Examples), then read Layer 2 (Tenets) and Layer 3 (Design Modules) before contributing code.

---

## Table of Contents

1. [Quick Start (Local Dev)](#quick-start-local-dev)
2. [Repository Layout](#repository-layout)
3. [Current Implementation Status](#current-implementation-status)
4. [Development Workflow](#development-workflow)
5. [CI/CD Pipelines](#cicd-pipelines)
6. [Contributing Guidelines](#contributing-guidelines)
7. [Known Gaps & Technical Debt](#known-gaps--technical-debt)
8. [License](#license)

---

## Quick Start (Local Dev)

---

## Repository Layout

```
frontend/         React SPA (Vite + Tailwind CSS)
backend/          Azure Functions App (HTTP + queue endpoints)
shared/           Shared domain models, telemetry, utilities (published to GitHub Packages)
infrastructure/   Bicep templates (Azure resources: SWA, Functions, Cosmos DB, Key Vault, App Insights)
docs/             Documentation (MECE hierarchy: vision → tenets → modules → architecture → roadmap → examples)
scripts/          Automation (seed data, validation, deployment helpers)
```

**Notable**:

- `backend/src/functions/*` – HTTP endpoints (player, location, movement, health)
- `backend/src/handlers/*` – Business logic (separated from routing)
- `shared/src/` – Domain models, telemetry constants, direction normalizer
- `docs/design-modules/` – Gameplay mechanics (world rules, navigation, quests, economy)
- `docs/examples/` – Practical code walkthroughs (function endpoints, Gremlin queries, seed scripts)

**Learn more**: [Local Development Setup](docs/developer-workflow/local-dev-setup.md)

---

## Current Implementation Status

| Area                           | Status                         | Notes                                                                                 |
| ------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------- |
| Frontend UI                    | Auth-aware shell + routing     | Landing homepage (hero + auth states); game view in M3b                               |
| Backend Functions (`backend/`) | Player + location endpoints    | Source of all HTTP game actions (migrated from SWA)                                   |
| Frontend API (co‑located)      | Removed                        | Replaced by unified backend Function App                                              |
| Queue / world logic            | M3a complete (Event Backbone)  | Event schema, processor implemented; Service Bus integration and DLQ/replay validated |
| Cosmos DB integration          | Dual persistence operational   | SQL API authoritative for players (ADR-004); Gremlin for world structure              |
| Key Vault integration          | Provisioned (secrets)          | Non‑Cosmos secrets only; Cosmos uses Managed Identity                                 |
| Infrastructure (Bicep)         | Core resources deployed        | SWA + Functions + Cosmos (Gremlin + SQL) + Key Vault + App Insights                   |
| CI/CD                          | Workflows operational          | See `.github/workflows/` (YAML is source of truth)                                    |
| Tracing (OpenTelemetry)        | Enriched telemetry operational | Span lifecycle + correlation IDs (M2 #312); M3 adds event correlation                 |

**Read more**:

- [Architecture Overview](docs/architecture/mvp-azure-architecture.md) (Current vs Planned)
- [Roadmap](docs/roadmap.md) (Milestone status: M0–M1 ✅ closed, M2 ✅ closed 2025-11-23, M3 split into M3a/M3b/M3c — M3a ✅ closed 2025-11-30; M3b/M3c active, M4–M7 planned)
- [Examples](docs/examples/README.md) (Practical code walkthroughs)

---

## Development Workflow

Prerequisites:

- Node.js >= 22 (Azure Functions currently supports 22.x; do not use 24.x yet)
- (Optional) Azure Functions Core Tools v4 (for direct Functions host runs)
- **GitHub Personal Access Token** with `read:packages` scope (for accessing `@piquet-h/shared` from GitHub Packages)

### GitHub Packages Authentication (Required)

The project uses the private `@piquet-h/shared` package from GitHub Packages. Before installing dependencies, you need to authenticate:

1. **Create a Personal Access Token (PAT)**:
    - Go to: https://github.com/settings/tokens
    - Click "Generate new token (classic)"
    - Select scopes: `read:packages` (and `write:packages` if you need to publish)
    - Generate and copy the token

2. **Configure npm authentication** (choose one method):

    **Option A: Environment variable (recommended)**

    ```bash
    export NODE_AUTH_TOKEN=ghp_your_token_here
    ```

    Add to your shell profile (`~/.bashrc`, `~/.zshrc`) to make it permanent:

    ```bash
    echo 'export NODE_AUTH_TOKEN=ghp_your_token_here' >> ~/.bashrc
    source ~/.bashrc
    ```

    **Option B: User-level .npmrc** (alternative)

    ```bash
    echo "//npm.pkg.github.com/:_authToken=ghp_your_token_here" >> ~/.npmrc
    ```

The repository `.npmrc` file already contains the scope mapping (`@piquet-h:registry=https://npm.pkg.github.com`), so you only need to provide authentication.

### Option A: Frontend Only

```bash
cd frontend
npm install
npm run dev
```

Visit: http://localhost:5173

### Backend Functions (Unified)

Install dependencies for each package:

```bash
cd shared && npm install
cd ../backend && npm install
cd ../frontend && npm install
```

Run frontend & backend separately during development:

```bash
cd frontend && npm run dev   # Vite dev server (http://localhost:5173)
cd backend && npm start      # Azure Functions host (http://localhost:7071)
```

Health check (example):

```bash
curl http://localhost:7071/api/ping
```

The SWA CLI can still serve the static frontend, but API proxying is no longer required since Functions are decoupled; use simple CORS or a local reverse proxy if needed.

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

- Run the whole stack via two terminals (frontend + backend). Add a lightweight proxy later if same-origin local testing is required.
- Missing `AAD_CLIENT_ID` will simply result in anonymous local sessions in the frontend.
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

### Seeding World Data

An idempotent seed script is available for initializing anchor locations and exits:

```bash
node scripts/seed-anchor-locations.mjs
```

The script is safe to re-run and outputs a summary of locations and exits processed. See [`docs/examples/seed-script-usage.md`](docs/examples/seed-script-usage.md) for detailed usage.

**Guidelines**:

- Keep handlers small & stateless; extract shared helpers once they appear twice
- Link a design doc section when opening a feature PR
- Prefer enqueueing a world event over cascading direct mutations

**Read more**: [Local Development Setup](docs/developer-workflow/local-dev-setup.md)

---

## CI/CD Pipelines

All workflows are defined in `.github/workflows/` and use GitHub Actions with Azure OIDC authentication (no raw secrets).

**Key workflows**:

- **CI**: Lint, typecheck, test, accessibility scans (triggered on PRs/pushes)
- **Infrastructure Deploy**: Bicep templates → Azure resources (Cosmos, Functions, SWA, Key Vault)
- **Publish Shared**: Publish `@piquet-h/shared` to GitHub Packages
- **Backend Deploy**: Build + deploy Functions (depends on shared package)
- **Frontend Deploy**: Build + deploy Static Web App

**Deployment order**: Infrastructure → Shared → Backend → Frontend

**Read more**: [CI/CD Documentation](docs/developer-workflow/ci-cd.md) (links to all workflow files)

---

## Contributing Guidelines

1. Open an issue describing the change & referencing design doc section
2. Keep functions stateless; configuration via env only
3. Small focused PRs (single domain concern)
4. Follow [Tenets](docs/tenets.md) (reliability, security, cost, operational excellence, performance, accessibility, narrative consistency)
5. Review [Design Modules](docs/design-modules/README.md) for gameplay contracts before implementing features
6. Use [Examples](docs/examples/README.md) as templates for common patterns

### Issue Taxonomy (Simplified)

Project planning uses a deliberately **minimal label + milestone scheme** (see `docs/developer-workflow/issue-taxonomy.md` for full details). Only these axes exist (former numeric implementation ordering / predictive scheduling removed):

- `scope:` one of `core|world|traversal|ai|mcp|systems|observability|devx|security`
- Type (no prefix) one of `feature|enhancement|refactor|infra|docs|spike|test`
- Milestone (no label): `M0 Foundation`, `M1 Traversal`, `M2 Observability`, `M3 AI Read`, `M4 AI Enrich`, `M5 Systems`

Rules:

- Exactly one of each labeled axis (`scope:`, Type). No `priority:` labels.
- No `area:*`, `phase-*`, `status:*`, or `priority:*` labels—remove if encountered.
- Internal module sub‑phases (e.g. traversal normalization N1..N5) stay in docs, not labels.

Migration (2025-09-27): Old Phase 0/1/2 terminology maps to Milestones `M3 AI Read`, `M4 AI Enrich`, `M5 Systems` respectively. Remove deprecated labels during triage.
Migration (2025-09-27 later): Removed the `kind:` prefix; existing `kind:feature|…` labels replaced with bare type labels.
Migration (2025-09-27 final): Removed `priority:` axis (ordering automation since deprecated). Subsequent cleanup (2025-10-09): removed legacy predictive scheduling / numeric ordering artifacts.

### Coding Conventions (Early)

- ES Modules everywhere (`"type": "module"`)
- Async/await for all I/O
- Avoid premature framework additions; keep dependencies lean
- Formatting (indentation, quotes, commas) is auto-enforced by Prettier/ESLint; run `npm run format` locally before pushing

**Read more**: [Developer Workflow](docs/developer-workflow/) | [Issue Taxonomy](docs/developer-workflow/issue-taxonomy.md)

---

## Known Gaps & Technical Debt

Current gaps:

- No Service Bus or queue processors
- No runtime Cosmos DB integration code (graph client, schema bootstrap)
- Limited test coverage (backend + shared scaffolding present; expansion planned)
- No managed identity consumption in Functions (uses key secret placeholder only)
- Auth currently client-only: backend Functions do not yet enforce role/claim authorization beyond SWA default

**Read more**: [Roadmap](docs/roadmap.md) (milestones M2–M6 address these gaps)

---

## License

MIT – see [`LICENSE`](LICENSE).

---

**Return to top**: [▲](#top)
