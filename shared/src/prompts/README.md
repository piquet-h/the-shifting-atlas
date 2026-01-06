# Prompt Templates (shared)

Location: `shared/src/prompts/`

Purpose

- Store canonical prompt templates in version control for deterministic behavior and review.
- Keep prompt text in the shared package (not in MCP) to reduce attack surface and avoid runtime drift.

Current exports

- `shared/src/prompts/worldTemplates.ts`
    - `getWorldTemplate(key: WorldPromptKey)` → returns a template string
    - `WorldPromptKey` union type

Planned (registry)

This folder is the long-term home for a versioned prompt registry (name + version + hash) and retrieval helpers.

Notes

- Prompt templates are NOT exposed as MCP servers. If tooling requires HTTP access, implement a backend helper endpoint that calls into shared helpers.
- If a template introduces new AI telemetry needs, add event names in `shared/src/telemetryEvents.ts` (no inline literals in runtime code).
