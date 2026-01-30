# AGENTS.md (Docs)

This file provides **documentation-specific** guidance for AI coding agents.

It is intended to apply when editing anything under `docs/`.

## Scope

- **Allowed:** create/update markdown documentation under `docs/`.
- **Avoid by default:** editing runtime code (`backend/`, `frontend/`, `shared/`, `infrastructure/`) unless the user explicitly requests code changes.
- **Doc philosophy:** describe intent and contracts; avoid duplicating implementation details that will drift.

## Documentation hierarchy (MECE)

This repository uses altitude-based documentation layers to prevent duplication and planning leakage.

| Layer               | Altitude  | Location                                              | Purpose                                            | Mutation frequency |
| ------------------- | --------- | ----------------------------------------------------- | -------------------------------------------------- | ------------------ |
| 1. Vision           | 60,000 ft | `README.md` (Vision section)                          | Inspire and set strategic direction                | Very low           |
| 2. Tenets           | 50,000 ft | `docs/tenets.md`                                      | Non-negotiable decision-making rules (WAF-aligned) | Very low           |
| 3. Concepts (facet) | 45,000 ft | `docs/concept/`                                       | Immutable semantics & vocabulary                   | Very low           |
| 4. Design Modules   | 40,000 ft | `docs/design-modules/`                                | Gameplay systems translating Vision + Tenets       | Low                |
| 5. Architecture     | 30,000 ft | `docs/architecture/`                                  | Technical design implementing modules              | Medium             |
| 6. Roadmap          | 20,000 ft | `docs/roadmap.md`                                     | Milestone progression                              | High               |
| 7. Examples         | 10,000 ft | `docs/examples/`                                      | Practical walkthroughs (no logic duplication)      | Medium             |
| 8. Code             | Ground    | `backend/`, `frontend/`, `shared/`, `infrastructure/` | Runnable implementation                            | High               |

### Allowed vs prohibited (Design Modules / Concept)

`docs/concept/` is a **facet**: use it for stable definitions/invariants that multiple Design Modules depend on. If the content is about runtime mechanics (pipelines, caching, telemetry payload shapes), it belongs in `docs/architecture/`.

**Allowed** in `docs/design-modules/` and `docs/concept/`:

- Gameplay mechanics and experiential rules
- Player-facing systemic invariants (e.g., exits, dungeon logic)
- Narrative voice and tone guidelines
- Cross-module integration contracts
- Rationale for immutable gameplay constraints

**Prohibited** in `docs/design-modules/` and `docs/concept/`:

- Implementation sequencing (milestones, sprints, backlogs) → use `docs/roadmap.md`
- Technical architecture details (Cosmos partitions, function triggers) → use `docs/architecture/`
- Telemetry enumeration plans → use `docs/observability.md`
- Performance tuning specifics → use ADRs or `docs/architecture/`
- Inline acceptance criteria / task checklists

**Planning / leakage indicator verbs** (treat as blockers in Design Modules/Concept):
`implement`, `sequence`, `schedule`, `sprint`, `backlog`, `dependency`, `milestone`, `roadmap`, `optimize`, `telemetry task`, `story points`, `spike`.

## Editing rules

- Prefer **relative links** to other repo files (e.g. `../architecture/event-classification-matrix.md`).
- Do **not** paste large blocks across layers; link instead.
- Use headings, tables, and lists for scannability; prefer Mermaid over ASCII diagrams.
- Keep diffs minimal and localized to the goal.

## Guardrails

- If a docs change alters a gameplay invariant, schema expectation, or cross-system contract, ensure the change is reflected in the appropriate layer (and consider whether an ADR is required).
- If you must include an exception for automation, annotate the specific line with `<!-- concept-automation:ignore -->`.

## Quick check before you finish a docs edit

- Does this content belong in this layer (MECE)?
- Did you avoid duplicating implementation details?
- Did you avoid planning leakage in Design Modules/Concept?
- Are links relative and correct?
