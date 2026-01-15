---
name: prompts-quality-gate
description: Validates and bundles prompt templates (schema validation, secret token scan, canonical hashes, bundle artifact). Use when editing shared/src/prompts/templates or when prompt validation/bundling fails.
---

# Prompts quality gate

Use this skill when you are asked to:

- Add or modify prompt templates under `shared/src/prompts/templates/**`.
- Validate prompt templates locally (schema, filename contract, secret-token scan).
- Create/update the bundled artifact in `shared/dist/prompts/prompts.bundle.json`.

## What this skill uses

Repo scripts:

- `scripts/validate-prompts.mjs`
- `scripts/bundle-prompts.mjs`

Convenience wrapper (recommended):

- `scripts/run.mjs`

## Preconditions

These scripts import from `shared/dist/prompts/**` (built shared package).

If `shared/dist/` doesn’t exist, either:

- run `npm run build:shared`, or
- run the wrapper with `--build`.

## Workflow

1. Validate templates:
    - JSON parses
    - schema validates
    - filename matches `metadata.id`
    - no protected tokens
    - hash computation works
2. Bundle templates into a single artifact (for runtime consumption).
3. Re-run validation after changes to ensure the bundle is generated from valid templates.

## Wrapper behavior

The wrapper can run:

- validate only
- bundle only
- validate then bundle (default)

The wrapper forwards `--output <path>` to the bundler.

---

Last reviewed: 2026-01-15
