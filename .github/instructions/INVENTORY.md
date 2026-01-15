---
description: Inventory & rationalization of instruction files
applyTo: '**'
---

# Instruction Set Inventory & Rationalization

> Purpose: Single overview of all Copilot / generation instruction artifacts under `.github/` to reduce duplication, keep context lean, and guide future maintenance.

## Summary Hierarchy (Proposed)

1. Core Operating Layer
    - `copilot-quickref.md` (fast mnemonic, <150 lines target)
    - `copilot-instructions.md` (compact operating guide; authoritative process + taxonomy)
    - `copilot-language-style.md` (language & formatting rules)
2. Module Delta Layer (ONLY rules unique to that module)
    - `instructions/backend/.instructions.md` (Azure Functions specifics NOT already in core)
    - `instructions/frontend/.instructions.md` (frontend architecture deltas: SWA, React state, API access)
    - `instructions/world/.instructions.md` (world & lore generation constraints)
    - `instructions/docs.instructions.md` (docs folder authoring constraints; delegates to `docs/AGENTS.md`)
3. Auxiliary / Patterns
    - `copilot-commit-message-instructions.md` (commit hygiene)
    - `instructions/inversify-di-patterns.md` (DI pattern – candidate for deprecation / merge)
4. Index & Metadata
    - `instructions/README.md` (brief pointer)
    - `instructions/INVENTORY.md` (this file – periodically updated)

## Non-.github Instruction Artifacts

- `docs/AGENTS.md` — documentation-specific agent guidance for anything under `docs/` (MECE layering + anti-duplication rules).
- `backend/AGENTS.md` — backend-specific agent guidance for anything under `backend/` (delegates to `.github/instructions/backend/.instructions.md`).
- `frontend/AGENTS.md` — frontend-specific agent guidance for anything under `frontend/` (delegates to `.github/instructions/frontend/.instructions.md`).
- `infrastructure/AGENTS.md` — infrastructure-specific agent guidance for anything under `infrastructure/` (Bicep guardrails; points to `infrastructure/README.md`).

## Retention Criteria

Keep an instruction file ONLY if:

- ≥60% of its content is NOT already expressed in a higher layer.
- It defines executable constraints (naming, architecture, safety, anti‑patterns) that guide generation.
- It is referenced by other docs OR enforced by lint/test.

Deprecate / merge if:

- > 30% of lines duplicate another file verbatim conceptually (not necessarily exact text).
- Content is historical / explanatory rather than directive (move to `docs/` instead).
- Audience overlap causes cognitive load (e.g. backend architecture restated in multiple places).

## File-by-File Assessment

| File                                     | Role                                | Status                | Recommended Action                                                                                                       | Notes                                                                                     |
| ---------------------------------------- | ----------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `copilot-instructions.md`                | Master operating guide              | KEEP                  | Trim any deeply backend-specific sections once backend delta strengthened                                                | High value; single source of truth for workflow & taxonomy                                |
| `copilot-quickref.md`                    | Fast lookup cheat sheet             | KEEP                  | Keep <150 lines; link out, no expansion                                                                                  | Prevents loading large file for trivial reminders                                         |
| `copilot-language-style.md`              | Formatting & language rules         | KEEP                  | Add reference to any new languages if introduced                                                                         | Distinct purpose; low duplication                                                         |
| `copilot-commit-message-instructions.md` | Commit hygiene                      | KEEP (Optional merge) | Optionally move under appendix section of operating guide; mark here if merged                                           | Self-contained; small; merging is low priority                                            |
| `instructions/backend/.instructions.md`  | Backend Azure Functions specifics   | KEEP (SLIM)           | Remove architecture redundancies already in core; focus on code-first patterns, idempotency, envelope design             | Duplicates some cosmos/service bus notes from core                                        |
| `instructions/frontend/.instructions.md` | Frontend UI rules                   | KEEP (EXPAND MINOR)   | Add explicit ties to language style (Prettier/ESLint) and error boundary policy                                          | Currently sparse; low duplication risk                                                    |
| `instructions/world/.instructions.md`    | World generation & lore constraints | KEEP (MODULARIZE)     | Extract prompt templates to `shared/src/prompts/` and link; add version header; avoid restating generic design each time | Large but domain-unique                                                                   |
| `instructions/inversify-di-patterns.md`  | DI usage patterns                   | DEPRECATE             | Merge into `docs/architecture/` (tag as DEPRECATED here, keep for 1 milestone)                                           | Patterns belong to architecture docs; instructions should focus on generation constraints |
| `instructions/README.md`                 | Index placeholder                   | KEEP (UPDATE)         | Replace with brief explanation + link to INVENTORY.md                                                                    | Provide orientation                                                                       |
| `instructions/INVENTORY.md`              | Inventory & rationalization         | NEW                   | Maintain quarterly or on structural changes                                                                              | Meta governance                                                                           |

## Deprecation Plan

1. Add a `> DEPRECATED – See docs/architecture/dependency-injection.md` banner at top of `instructions/inversify-di-patterns.md` once merged.
2. Create `docs/architecture/dependency-injection.md` consolidating DI content (if not already sufficient in archive). Preserve test fake patterns.
3. After one milestone (e.g. M4 → M5 transition), remove the deprecated file.

## Slimming Actions (Next Pass)

Backend instructions file:

- Remove repeated Cosmos partition key table (already in core) OR replace with link.
- Keep only trigger registration examples, message envelope contract, performance cold start tactics not elsewhere.

World instructions file:

- Move prompt templates to code location and reference relative path.
- Tag major sections with succinct headers (<5 words) for quicker relevance scanning.

Quickref:

- Audit for drift against operating guide each time operating guide changes (script idea below).

## Governance & Automation Ideas

Add front matter (YAML) at top of each instruction file:

```
---
role: core|module|auxiliary
owner: devx
last-reviewed: 2025-10-29
milestone-target: M5 Systems
---
```

Script (`scripts/verify-instructions.mjs`) can:

- Parse files for front matter.
- Warn if `last-reviewed` > 90 days.
- Detect duplicate key phrases (e.g., "Partition keys:" appearing in >2 core/module files).
- Fail CI if deprecated file not removed after milestone cutoff.
- Warn if any world prompt templates appear inline (should live in `shared/src/prompts/`).
- Check each file has a `Last reviewed:` marker.

## Maintenance Checklist

- [ ] Front matter added to all kept instruction files
- [ ] Inversify patterns moved & deprecated banner applied
- [ ] Backend file slimmed (remove duplicated cosmos/service bus reiterations)
- [ ] World prompts externalized to `shared/src/prompts/`
- [ ] README updated to point to inventory & classification
- [ ] Quickref diff check script considered / added

## Risks & Mitigations

| Risk                                              | Impact                                        | Mitigation                                                    |
| ------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------- |
| Over-consolidation reduces immediate model recall | Slower generation for niche backend specifics | Keep short backend delta file focused on truly unique rules   |
| Stale inventory file                              | Confusion on current hierarchy                | Add review date + CI script warning                           |
| Uncoordinated world prompt moves                  | Broken references in generation flows         | Perform move + add export index + update operating guide link |

## Recommendation Summary

- Proceed with deprecating DI patterns file (merge → banner → remove next milestone).
- Add front matter & slimming in a single docs-focused PR (no runtime risk – LOW).
- Avoid merging commit message instructions prematurely; optional only.

## Next Potential Improvements

- Lint rule to enforce absence of large prompt blocks inside instruction files (encourage referencing prompt modules).
- Automatic link validator across instruction docs.
- Stats script: line count & duplication ratio report to track drift.

---

_Last reviewed: 2025-10-29_
