# Using Copilot in This Repository

Copilot should accelerate tactical coding (scaffolds, small functions, tests) while you enforce architectural and gameplay boundaries defined in `docs/`.

## Specialized Agents

This repository includes custom Copilot agents (located in `.github/agents/`) that provide domain-specific expertise:

| Agent                                    | File                                             | Purpose                                                     |
| ---------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------- |
| **Docs Editor**                          | `Docs_Editor.agent.md`                           | Docs-only agent for editing markdown (stays within `docs/`) |
| **Azure Static Web App**                 | `Azure_Static_Web_App.agent.md`                  | SWA development, configuration, and troubleshooting         |
| **Azure Functions Codegen & Deployment** | `Azure_function_codegen_and_deployment.agent.md` | Azure Functions planning/codegen/test/deploy workflows      |

**To use a specialized agent**: select it from the agent picker in VS Code (or mention the agent name in chat if your setup supports @-mentioning agents).

**Agent File Format**: Agents are stored under `.github/agents/` and use the `.agent.md` suffix. Prefer YAML frontmatter for metadata (`name`, `description`, `tools`, `handoffs`, etc.), followed by clear instructions.

## Agent Skills (recommended for repeatable workflows)

Agent Skills are **on-demand** bundles of instructions + optional scripts/resources that Copilot can load when relevant.
Store project skills under:

- `.github/skills/<skill-name>/SKILL.md`
- optional: `.github/skills/<skill-name>/scripts/**`

This repository currently maintains these project skills:

- `world-content-generation` — lore/world/prompt authoring rules
- `exit-consistency-audit` — run & interpret exit graph consistency scans
- `prompts-quality-gate` — validate + bundle prompt templates
- `test-triage` — failing tests + “Node won’t exit” workflows
- `functions-local-dev` — backend Azure Functions local dev loop
- `shared-release-workflow` — shared→backend two-stage workflow + cross-package detection

### TDD scope note

Runtime code changes follow TDD.

Scripts under `scripts/**` and `.github/skills/**/scripts/**` may be written without TDD, but must still be validated by running them (and keeping usage instructions in the relevant Skill).

## Core Principles

1. Always anchor a change in a design doc (architecture module, gameplay system, or world rule) – reference the file path in your PR description.
2. Keep Functions single‑purpose and stateless; push shared logic into a `shared/` utility module rather than duplicating across handlers.
3. Prefer event emission (queue messages) over direct multi‑step mutations.

## Prompting Patterns

| Goal                  | Example Prompt                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Add new HTTP Function | "Create an Azure Function http handler in backend that enqueues a world event (see docs/design-modules/navigation-and-traversal.md)." |
| Extend API handler    | "Refactor HttpPlayerActions to validate direction against allowed exits list (see world rules doc)."                                  |
| Generate test         | "Write Node --test tests for graph utility parseRoomId covering invalid GUID cases."                                                  |

## Referencing Design Docs

Before generating code that touches a domain concept (movement, quests, factions), copy a concise excerpt from the relevant doc into a code comment block above the new function. This improves suggestion relevance and preserves traceability.

Example preface:

```ts
/* Movement Rule Excerpt (navigation-and-traversal.md)
	- Valid exits: north,south,east,west,up,down
	- Attempting a nonexistent exit returns error code MOVEMENT_INVALID_EXIT
*/
```

## Local Development Aids

Run frontend & backend separately (in separate terminals: `cd frontend && npm run dev` + `cd backend && npm start`). Configure a Vite proxy for same‑origin behavior when needed. Tailor prompts to the layer you are editing; include brief domain rule excerpts for movement, identity, or world events to guide generation.

## Style & Conventions

- ES Modules only.
- Async/await I/O, no nested promise chains.
- Short, intention‑revealing function names: `enqueueWorldEvent`, `validateExitDirection`.

## Rejecting Low-Quality Suggestions

Discard suggestions that:

- Introduce stateful singletons without clear need.
- Add libraries outside project scope (heavy ORMs, large utility libs).
- Duplicate domain logic already defined elsewhere.

## Updating Copilot guidance

If you change cross-cutting workflow rules, update `.github/copilot-instructions.md`.
If you change module-specific conventions, update the relevant path-specific instruction file under `.github/instructions/**` and/or the module’s `AGENTS.md`.

If you add or change a repeatable workflow (tests, debugging, prompt pipelines, exit audits), prefer adding/updating an Agent Skill under `.github/skills/**`.

## Security & Secrets

- Never hardcode secrets. Use environment variables / future Key Vault integration.
- Do not accept suggestions injecting analytics / network calls without design approval.

## Helpful Aliases

| Command                        | Purpose                            |
| ------------------------------ | ---------------------------------- |
| `cd frontend && npm run build` | Build production bundle.           |
| `cd backend && npm run build`  | Build backend functions.           |
| `cd shared && npm run build`   | Build shared package.              |
| `npm run typecheck`            | TypeScript validation per package. |

## Next Improvements

- Add prompt templates for queue/event patterns.
- Provide a shared util for Gremlin queries (once introduced) with documented patterns to steer Copilot.

Use Copilot as a speed boost, not an architectural decision maker.
