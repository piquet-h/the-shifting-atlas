# Concept Facet

Authoritative source for player experience, narrative tone, systemic invariants, and non‑mutable gameplay semantics. Delivery timelines and architectural mechanics are intentionally excluded.

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
| (automation)                    | Issue generation governance (see below)           |

## Boundaries

Excluded: progress stage tables, atomic issue lists, deployment scripts, persistence technical details (see `../architecture/` and `../roadmap.md`).

## Change Rules

1. Modify only when an invariant genuinely evolves; avoid speculative future mechanics (archive speculative drafts instead).
2. If a concept shifts enough to alter technical contracts, add or update an ADR and cross‑link.
3. Do not add delivery step checklists—create execution issues instead.
4. Automation will propose atomic issues for invariant / scope changes; review before merging.

Reference: Full documentation layering and boundaries live in `../AGENTS.md`.

## Automation Governance

Concept changes are monitored by `scripts/generate-concept-issues.mjs` and GitHub Action workflow `concept-issue-generator.yml`:
| Trigger | Action |
| ------- | ------ |
| Pull Request (concept paths) | Draft comment listing proposed atomic issues (dry-run) |
| Push to `main` (concept paths) | Issues created automatically (deduplicated) |

Issue classification heuristics:

- Added invariant → feature issue (risk: RUNTIME-BEHAVIOR)
- Removed invariant → refactor issue
- New section heading → feature issue (system scope expansion)
- Tenet line change in `../tenets.md` → docs issue
- Planning verbs detected in concept doc → refactor (CrossFacetLeak) issue

Review Guidelines:

1. Reject issues if wording is purely editorial (tone, grammar) without semantic change.
2. Merge PR only after confirming no accidental planning leakage.
3. If multiple new headings describe one cohesive system, convert generated issues into a single epic manually.

Opt-Out:
Add string `<!-- concept-automation:ignore -->` to a changed line to suppress detection for that line.

---

## Related Documentation

| Layer        | Document           | Purpose                                  |
| ------------ | ------------------ | ---------------------------------------- |
| Vision       | Root `README.md`   | High-level vision and narrative          |
| Tenets       | `../tenets.md`     | Non-negotiable decision principles       |
| Architecture | `../architecture/` | Technical persistence, integration       |
| Roadmap      | `../roadmap.md`    | Milestone planning and progress tracking |

---

_Created: 2025-10-31 • Automation section added 2025-10-31_
