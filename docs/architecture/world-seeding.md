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

---

## Macro Atlas Files

In addition to `villageLocations.json`, two macro geography atlas files are bundled with the backend and consumed at seed time:

- `backend/src/data/mosswellMacroAtlas.json` — Mosswell settlement area: fjord/sound topology, local continuity routes, directional terrain trends
- `backend/src/data/theLongReachMacroAtlas.json` — Landmass-level macro graph: regions and inter-area relationships for The Long Reach

### Authority

These files are the **authoritative source of truth** for macro geography (ADR-010, Accepted 2026-03-26). They are design-time artifacts: edited by hand, versioned in the repo, and applied at seed time. There is no runtime mechanism to add a macro area without editing a file and redeploying.

### Seed-time role

`applyMacroAtlasBindings()` (`backend/src/seeding/macroAtlasBindings.ts`) runs during seeding and stamps macro context tags onto Gremlin location vertices:

- `macro:area:<ref>` — which macro area the location belongs to
- `macro:route:<ref>` — named route continuity associations
- `macro:water:<ref>` — water body associations

These tags travel with each location vertex and are read at runtime by `resolveMacroGenerationContext()`. Macro geography is **not** stored as dedicated Gremlin vertices — the tags are the projection.

### Modification policy

- Adding or changing macro areas, routes, or barriers: edit the relevant JSON file, then run a reseed.
- Structural changes (new area types, new tag namespaces) require corresponding updates to `macroAtlasBindings.ts`, `macroGenerationContext.ts`, and tests.
- `scripts/verify-runtime-invariants.mjs` validates semantic ID format and reference integrity on every CI run. It also warns when either atlas file exceeds 200 nodes (ADR-010 T4 revisit trigger).

See [`macro-atlas-and-seed-redesign.md`](macro-atlas-and-seed-redesign.md) for the full architectural model and data flow.
