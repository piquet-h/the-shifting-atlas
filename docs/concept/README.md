# Concept Facet

Authoritative source for player experience, narrative tone, systemic invariants, and non‑mutable gameplay semantics. Implementation sequencing and architectural mechanics are intentionally excluded.

## Purpose

Keep long‑term truths (invariants, tone, normalization rules, dungeon run intent) stable while execution plans iterate elsewhere.

## Contents

| Doc                             | Focus                                             |
| ------------------------------- | ------------------------------------------------- |
| `exits.md`                      | Exit edge invariants & traversal expectations     |
| `direction-resolution-rules.md` | Canonical direction normalization rules           |
| `dungeons.md`                   | Dungeon run concept (episodic instance rationale) |
| `dm-persona-parsing.md`         | Humorous action interpretation principles         |
| `dungeon-master-style-guide.md` | Narration tone & style guide                      |

## Boundaries

Excluded: milestone tables, atomic issue lists, deployment scripts, persistence implementation details (see `../execution/` and `../architecture/`).

## Change Rules

1. Modify only when an invariant genuinely evolves; avoid speculative future mechanics (archive speculative drafts instead).
2. If a concept shifts enough to alter technical contracts, add or update an ADR and cross‑link.
3. Do not add implementation step checklists—create execution issues instead.

## Related Facets

| Facet           | Directory                 | Purpose                                            |
| --------------- | ------------------------- | -------------------------------------------------- |
| Architecture    | `../architecture/`        | Technical persistence, integration, mapping        |
| Execution       | `../execution/`           | Mutable milestone planning & atomic issue clusters |
| Vision & Tenets | `../vision-and-tenets.md` | High-level rationale & decision principles         |

---

_Created: 2025-10-31_
