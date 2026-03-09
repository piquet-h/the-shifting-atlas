# Backend Seed Data (Canonical)

This folder contains both:

- **runtime seed data** such as `villageLocations.json`
- **atlas authoring data** such as `eridunAtlas.json`, `theLongReachMacroAtlas.json`, and `mosswellMacroAtlas.json`

The important rule is enforced in code, not just described here:

- runtime seed location IDs and exit targets must be **GUIDs**
- atlas node/route/barrier references must remain **semantic reference keys**

See `../../../scripts/verify-runtime-invariants.mjs` (run via `npm run lint:backend`) for the authoritative enforcement.

Change policy:

1. Fix runtime seed data directly in `villageLocations.json` and keep tests green.
2. Preserve semantic atlas reference stability when editing macro atlas files.
3. Do not add comments to the JSON files themselves; use this README only for brief rationale.

This data is intentionally not exported via the shared package.
