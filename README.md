<a name="top"></a>

# The Shifting Atlas

---

## Vision (60,000 ft)

**A MMORPG implemented as a text adventure like Zork, but with Generative AI as the dungeon master in a fully open and immersive world.**

Create a living text-first MMO-style world where player actions, NPC behaviors, factions, trade, and narrative arcs evolve via queued world events rather than real-time tick loops. **Generative AI acts as the Dungeon Master**, orchestrating narrative depth, spatial storytelling, humorous guidance and helps drive world expansion. Players traverse a graph-based world enriched by additive description layers, engage with deterministic AI assistance, and influence evolving world history through validated events.

**D&D 5e integration (northstar, optional specialization)**: The long-term direction is a D&D-flavored rules overlay driven by SRD-derived reference data and tool-surface contracts (mechanics lookup → validated outcomes → narration). This is intentionally **not required for the playable MVP loop** (movement/look/interact should remain fun even when AI is unavailable or throttled). See [D&D 5e API Integration](docs/design-modules/dnd5e-foundry-agent-architecture.md).

The platform balances imaginative emergence with architectural discipline: a **dual persistence model** separates immutable world structure (Cosmos Gremlin: locations, exits, spatial relationships) from mutable player/inventory/event state (Cosmos SQL API: authoritative as of ADR-004). Strict telemetry governance and event-driven progression enable replay, observability, and safe extension.

> **Core Tenet**: Accessibility from day one. All features must satisfy baseline WCAG 2.2 AA intent (see [`docs/ux/accessibility-guidelines.md`](docs/ux/accessibility-guidelines.md)) before merge.

---

## Documentation (portal-first)

The canonical documentation portal (including the full MECE “altitude” table and LLM-friendly reading order) is:

- [`docs/README.md`](docs/README.md)

Common entrypoints:

- Tenets (non-negotiables): [`docs/tenets.md`](docs/tenets.md)
- Concepts (immutable semantics & vocabulary): [`docs/concept/`](docs/concept/)
- Design Modules (gameplay systems & invariants): [`docs/design-modules/README.md`](docs/design-modules/README.md)
- Architecture (technical contracts/boundaries): [`docs/architecture/overview.md`](docs/architecture/overview.md)
- Workflows (runtime orchestration & validation gates): [`docs/workflows/README.md`](docs/workflows/README.md)
- Roadmap (milestones/sequencing): [`docs/roadmap.md`](docs/roadmap.md)
- Examples (walkthroughs/templates): [`docs/examples/README.md`](docs/examples/README.md)

**For new contributors**: start with Examples, then Tenets and the relevant Design Modules before changing runtime code.

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

Prerequisites: **Node.js 22.x** (`.nvmrc`). All packages are managed as **npm workspaces** with a single root `package-lock.json` — no registry token or per-folder install is required.

```bash
npm ci
npm run build:shared
npm run dev:fullstack:memory
```

Or run the frontend (`http://localhost:5173`) and backend Functions host (`http://localhost:7071`) in separate terminals:

```bash
npm run dev:frontend
npm run dev:backend
```

Seed anchor locations (idempotent):

```bash
node scripts/seed-anchor-locations.mjs
```

Full setup, health endpoints, Cosmos DB Managed Identity (`az login`), and E2E configuration live in [`docs/developer-workflow/local-dev-setup.md`](docs/developer-workflow/local-dev-setup.md).

---

## Repository Layout

```
frontend/         React SPA (Vite 8 + React 18 + Tailwind CSS)
backend/          Azure Functions v4 App (HTTP endpoints, Service Bus queues, MCP tools)
shared/           Internal npm workspace package (@piquet-h/shared: domain models, schemas, telemetry, prompts)
infrastructure/   Bicep templates (SWA, Flex Consumption Functions, Service Bus, Cosmos DB, Foundry, App Insights)
docs/             MECE documentation hierarchy (portal: docs/README.md)
scripts/          CI/CD scope, standalone Function packager, milestone sweep, board-pulse, and world utilities
```

---

## Current Implementation Status

| Area                           | Status                         | Authoritative Reference                                                                                       |
| ------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Frontend SPA (`frontend/`)     | Deployed                       | [`docs/architecture/frontend-components.md`](docs/architecture/frontend-components.md)                        |
| Backend Functions (`backend/`) | Deployed (HTTP + Queues + MCP) | [`docs/architecture/overview.md`](docs/architecture/overview.md)                                              |
| Persistence (Cosmos DB)        | Gremlin graph + SQL API (MI)   | [`docs/adr/ADR-004-player-store-cutover-completion.md`](docs/adr/ADR-004-player-store-cutover-completion.md)  |
| Infrastructure (`main.bicep`)  | Incremental IaC + Foundry      | [`infrastructure/README.md`](infrastructure/README.md)                                                        |
| Observability                  | Telemetry registry + alerts    | [`docs/observability.md`](docs/observability.md)                                                              |
| Milestones & Delivery Slices   | Live in GitHub Milestones      | [`docs/roadmap.md`](docs/roadmap.md)                                                                          |

---

## Development Workflow

Run workspace build, lint, typecheck, formatting, and test suites from the repository root:

```bash
npm run build        # shared (with prompt bundle) -> backend -> frontend
npm run lint         # ESLint + runtime/atlas invariants across workspaces
npm run typecheck    # tsc --noEmit across workspaces
npm test             # shared + backend + frontend unit & integration tests
npm run format       # Prettier auto-format
```

- **Cross-package changes**: Ship coordinated `shared/` + `backend/`/`frontend/` changes in one atomic PR; see [`docs/developer-workflow/shared-versioning.md`](docs/developer-workflow/shared-versioning.md).
- **Authentication**: SWA Entra EasyAuth configuration and local emulator notes live in [`docs/ux/azure-auth-notes.md`](docs/ux/azure-auth-notes.md).
- **Dependency updates**: Managed via root `npm` workspaces and [`.github/dependabot.yml`](.github/dependabot.yml); keep major framework migrations in dedicated PRs.

---

## CI/CD Pipelines

Workflows live in [`.github/workflows/`](.github/workflows/) and use GitHub Actions on public runners with Azure OIDC authentication:

- **PR Validation (`ci.yml`)**: Merge-candidate checkout, path-scoped parallel legs (`shared`, `backend-unit`, `backend-integration`, `frontend`, `a11y`, offline `infrastructure` Bicep build, `governance`), single `PR validation` summary gate, and `automerge` support.
- **Continuous Delivery**: Sequential non-canceling deploys for Infrastructure (`deploy-infrastructure.yml`), Backend standalone Function archive (`backend-functions-deploy.yml`), and Frontend SWA (`frontend-swa-deploy.yml`), advancing `deployed-<unit>` tags and handing referenced `#NNN` issues to `state:testing`.
- **Closed-Loop Milestone Engine**: `milestone-sweep.yml`, `milestone-sweep-cleanup.yml`, and `board-pulse.yml` refine, dispatch, verify, and close milestone slices.

**Read more**: [`docs/developer-workflow/ci-cd.md`](docs/developer-workflow/ci-cd.md)

---

## Contributing Guidelines

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for mandatory TDD-first workflow and PR gates, and [`docs/developer-workflow/issue-taxonomy.md`](docs/developer-workflow/issue-taxonomy.md) for the single-`scope:` + `type` + `state:*` label taxonomy.

---

## Known Gaps & Technical Debt

Current gaps:

- Temporal mechanics are still in progress (see `docs/roadmap.md` → M3c).
- AI orchestration remains runtime-agnostic by design; hosted runtime wiring may vary by tenant/product surface (see `docs/architecture/agentic-ai-and-mcp.md`).
- World generation + layering depth is intentionally staged (prompt registry/MCP read precede any write/proposal surfaces; see `docs/roadmap.md` → M4/M5).
- More integration/E2E coverage is still desirable (see `docs/developer-workflow/test-strategy.md` and `frontend/e2e/`).
- Backend authorization posture beyond SWA Easy Auth should be validated/expanded as new mutation surfaces are introduced.

**Read more**: [Roadmap](docs/roadmap.md) (milestones M2–M6 address these gaps)

---

## License

MIT – see [`LICENSE`](LICENSE).

---

**Return to top**: [▲](#top)
