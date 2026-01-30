# Documentation Portal

This repository is intentionally documentation-heavy. The goal is high fidelity without duplication: each doc lives in exactly one “altitude layer” (MECE) and other layers link to it.

## Start here (pick your path)

### I’m trying to understand what this project _is_

- Vision: `../README.md` (top-level README)
- Tenets (non-negotiables): `tenets.md`
- Roadmap (milestones and sequencing): `roadmap.md`

### I’m implementing gameplay rules (not infrastructure)

- Design Modules index: `design-modules/README.md`
- Design Module docs (system semantics): `design-modules/`

### I’m implementing runtime code

- Architecture overview (high-level, stable): `architecture/overview.md`
- Architecture index (curated): `architecture/README.md`
- Developer workflow (local dev, CI/CD, conventions): `developer-workflow/`
- Examples (walkthroughs and templates): `examples/README.md`

### I’m working on AI/agents/MCP

- Canonical AI + MCP architecture: `architecture/agentic-ai-and-mcp.md`
- MCP deployment + auth setup: `deployment/mcp-auth-setup.md`
- Prompt authoring + hygiene: `developer-workflow/lore-authoring.md` and `design-modules/ai-prompt-engineering.md`

### I’m working on observability / dashboards / alerts

- Observability overview: `observability.md`
- Telemetry catalog: `observability/telemetry-catalog.md`
- Workbooks: `architecture/workbook-parameter-guidelines.md` and `../infrastructure/workbooks/`

## LLM-friendly reading order (high signal first)

If you are an LLM (or a human doing “repo ingestion”), read in this order to minimize cross-link chasing:

1. `../README.md` (vision + repo layout)
2. `tenets.md` (constraints that govern every decision)
3. `architecture/overview.md` (what is implemented vs planned, in one place)
4. `architecture/README.md` (index into the deep dives)
5. `roadmap.md` (milestones and sequencing; GitHub milestone assignments remain source of truth)

Then branch based on the question:

- **Data model / persistence** → `architecture/mvp-azure-architecture.md`, `architecture/cosmos-sql-containers.md`, `architecture/sql-repository-pattern.md`
- **Events / async** → `architecture/world-event-contract.md`, `architecture/event-classification-matrix.md`
- **Frontend ↔ backend contract** → `architecture/frontend-api-contract.md`

## Documentation hierarchy (MECE by altitude)

| Layer          | Altitude  | Location                                              | Purpose                                     |
| -------------- | --------- | ----------------------------------------------------- | ------------------------------------------- |
| Vision         | 60,000 ft | `../README.md`                                        | Why this exists                             |
| Tenets         | 50,000 ft | `tenets.md`                                           | Non-negotiable constraints                  |
| Design Modules | 40,000 ft | `design-modules/`                                     | Gameplay systems and invariants             |
| Architecture   | 30,000 ft | `architecture/`                                       | Technical design and contracts              |
| Roadmap        | 20,000 ft | `roadmap.md`                                          | Milestones and dependency-driven sequencing |
| Examples       | 10,000 ft | `examples/`                                           | Walkthroughs and templates                  |
| Code           | Ground    | `backend/`, `frontend/`, `shared/`, `infrastructure/` | Runnable implementation                     |

## What not to do (to keep fidelity)

- Don’t duplicate large blocks across layers; link instead.
- Don’t put implementation sequencing in `design-modules/` or `concept/` (use `roadmap.md`).
- Don’t move “source of truth” definitions into docs if they already exist in code; document the contract and link to code.
