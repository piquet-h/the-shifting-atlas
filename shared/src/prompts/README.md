# Prompt Registry (shared)

Location: `shared/src/prompts/`

Purpose

- Store canonical, versioned prompt templates used by backend agents.
- Provide deterministic hashing (`computePromptHash`) to enable replay and validation.

APIs (recommended)

- `getTemplate(name, version?)` → returns template metadata + content
- `listTemplates(tag?)` → returns available templates
- `computePromptHash(template)` → returns SHA-256 hex digest for the template

Notes

- Prompt templates are NOT exposed as MCP servers. If tooling requires HTTP access, implement a backend helper endpoint that calls into these shared helpers.
- When adding a template, update `shared/src/telemetryEvents.ts` if the template requires new AI telemetry event names.
