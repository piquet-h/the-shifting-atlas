---
description: Documentation editing rules for files under docs/
applyTo: 'docs/**'
---

## Scope

- Work only in documentation files under `docs/`.
- Do not modify runtime code (`backend/`, `frontend/`, `shared/`, `infrastructure/`) unless explicitly requested.

## Documentation hierarchy (MECE by altitude)

This repository uses altitude-based layers to prevent duplication and planning leakage.

| Layer            | Altitude  | Location                                              | Purpose                                     |
| ---------------- | --------- | ----------------------------------------------------- | ------------------------------------------- |
| Vision           | 60,000 ft | `README.md`                                           | Why this exists                             |
| Tenets           | 50,000 ft | `docs/tenets.md`                                      | Non-negotiable constraints                  |
| Concepts (facet) | 45,000 ft | `docs/concept/`                                       | Immutable semantics & vocabulary            |
| Design Modules   | 40,000 ft | `docs/design-modules/`                                | Gameplay systems and invariants             |
| Architecture     | 30,000 ft | `docs/architecture/`                                  | Technical design and contracts              |
| Workflows        | 25,000 ft | `docs/workflows/`                                     | Runtime orchestration & validation gates    |
| Roadmap          | 20,000 ft | `docs/roadmap.md`                                     | Milestones and dependency-driven sequencing |
| Examples         | 10,000 ft | `docs/examples/`                                      | Walkthroughs and templates                  |
| Code             | Ground    | `backend/`, `frontend/`, `shared/`, `infrastructure/` | Runnable implementation                     |

Reference entrypoint for humans/LLMs: `docs/README.md`.

## Allowed vs prohibited (Design Modules / Concept)

`docs/concept/` is a **facet**: use it for stable definitions/invariants that multiple Design Modules depend on. If content is about runtime mechanics (pipelines, caching, telemetry payload shapes), it belongs in `docs/architecture/`.

Allowed in `docs/design-modules/` and `docs/concept/`:

- Gameplay mechanics and experiential rules
- Player-facing systemic invariants (exits, dungeon logic)
- Narrative voice and tone guidelines
- Cross-module integration contracts
- Rationale for immutable gameplay constraints

Prohibited in `docs/design-modules/` and `docs/concept/`:

- Implementation sequencing (milestones, sprints, backlogs) → use `docs/roadmap.md`
- Technical architecture details (Cosmos partitions, function triggers) → use `docs/architecture/`
- Telemetry enumeration plans → use `docs/observability.md`
- Inline acceptance criteria / task checklists

Planning/leakage indicator verbs (treat as blockers in Design Modules/Concept):
`implement`, `sequence`, `schedule`, `sprint`, `backlog`, `dependency`, `milestone`, `roadmap`, `optimize`, `telemetry task`, `story points`, `spike`.

## Editing rules

- Prefer relative links within the repo.
- Don’t duplicate large blocks across layers; link instead.
- Keep diffs minimal and scannable (headings/tables/bullets).

---

Last reviewed: 2026-01-30
