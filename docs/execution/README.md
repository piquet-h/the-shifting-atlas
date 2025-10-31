# Execution Facet (Implementation Planning)

This facet groups mutable planning artifacts: roadmap, milestone narratives, module implementation clusters. Conceptual invariants live under `../concept/`; technical design lives under `../architecture/`.

## Contents

- `modules-implementation.md` – Atomic issue clusters & sequencing
- `roadmap.md` – Milestone objectives & exit criteria
- `milestones/` – Per-milestone closure summaries (historical + active)

## Change Rules

1. Do not embed conceptual invariants here—link to concept docs instead.
2. Keep milestone exit criteria terse; detailed rationale belongs in ADRs.
3. Archive completed large clusters to prevent bloat (future `execution-archive/`).
4. Cross-folder links must prefer relative paths (`../concept/...`).

## Facet Boundaries

| Facet                             | Purpose                                           | Mutation Frequency |
| --------------------------------- | ------------------------------------------------- | ------------------ |
| Concept (`../concept/`)           | Player experience, narrative, systemic invariants | Low                |
| Architecture (`../architecture/`) | Technical structure, persistence, integration     | Medium             |
| Execution (`./`)                  | Plans, sequencing, milestone narratives           | High               |

---

_Created: 2025-10-31_
