---
title: World Seeding (Canonical Source)
status: active
---

# World Seeding (Canonical Source – Option 2)

The initial Mosswell village locations are now sourced exclusively from `backend/src/data/villageLocations.json`.

## Rationale

Option 2 was selected: the seed data is only required for one-time initialization and memory‑mode testing. Keeping a copy in the shared package created unnecessary duplication and cross‑package coupling (shared must remain backend‑agnostic per instructions Section 12.1).

## Principles

1. Single authoritative JSON file: `backend/src/data/villageLocations.json`.
2. Shared package MUST NOT reference backend paths or embed seed data.
3. Tests validating seed integrity (direction tokens, idempotent seeding) reside in backend test suite.
4. Future world expansions should be **additive** changes to the canonical seed file, validated by tests, and applied via the idempotent seeding script.

## Guardrails

The deployment verification script (`scripts/verify-deployable.mjs`) now fails if a duplicate `shared/src/data/villageLocations.json` is reintroduced.

## Modification Policy

- Minor corrections (typos, exit direction relabel) may adjust the canonical file directly.
- Structural or semantic changes (adding locations, exits, tags) require corresponding tests and a controlled seeding run.
- Do not add comments inside the JSON file; use `backend/src/data/README.md` for documentation.

## Future Considerations

If seed data becomes needed by external tools without backend dependency, consider publishing a lightweight data-only package rather than reintroducing duplication in `@piquet-h/shared`.
