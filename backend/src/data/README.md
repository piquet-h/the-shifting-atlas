# Backend Seed Data (Canonical)

`villageLocations.json` is the single authoritative world seed used for:

- Initial Mosswell location & exit graph seeding
- Memory-mode testing scenarios in the backend

It is intentionally NOT exported via the shared package. Direction validation and idempotent seeding are covered by backend tests (see `test/integration/worldSeeding.test.ts` and `test/unit/seedIntegrity.test.ts`).

Change Policy:

1. Fixes: adjust exits or descriptions directly (ensure tests still pass).
2. Additions: make additive edits to the canonical seed file and validate via tests; apply changes via the idempotent seeding workflow (memory mode for local, cosmos mode as appropriate).
3. Duplication: the deploy verification script will fail if a duplicate seed file appears in `shared/`.

Do NOT add comments to the JSON file itself (JSON specification forbids comments). Use this README for rationale.
