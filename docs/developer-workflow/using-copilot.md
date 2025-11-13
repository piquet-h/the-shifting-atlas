# Using Copilot in This Repository

Copilot should accelerate tactical coding (scaffolds, small functions, tests) while you enforce architectural and gameplay boundaries defined in `docs/`.

## Specialized Agents

This repository includes custom Copilot agents (located in `.github/agents/`) that provide domain-specific expertise:

| Agent                                    | File                                             | Purpose                                                                                |
| ---------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| **Atlas Documentation Agent**            | `documentation.agent.md`                         | Maintains concise, accurate documentation; resolves conflicts; enforces MECE hierarchy |
| **Atlas Game Logic Agent**               | `gamelogic.agent.md`                             | Expert in game mechanics, narrative design, D&D systems, faction/economy design        |
| **Azure Static Web App**                 | `Azure_Static_Web_App.agent.md`                  | Specialized in SWA development, deployment, and configuration                          |
| **Azure Functions Codegen & Deployment** | `Azure_function_codegen_and_deployment.agent.md` | Enterprise-grade Azure Functions workflow with IaC                                     |

**To use a specialized agent**: Mention it by name in your prompt (e.g., "@documentation" or "@gamelogic") or select it from the agent picker in VS Code.

**Agent File Format** (v1.106): Agents use the `.agent.md` or `.agents.md` suffix with `````chatagent` code fence format. VS Code v1.106 (October 2025) renamed "chat modes" to "custom agents" and added new properties like `target`, `argument-hint`, and `handoffs` for enhanced workflows.

## Core Principles

1. Always anchor a change in a design doc (architecture module, gameplay system, or world rule) – reference the file path in your PR description.
2. Keep Functions single‑purpose and stateless; push shared logic into a `shared/` utility module rather than duplicating across handlers.
3. Prefer event emission (queue messages) over direct multi‑step mutations.

## Prompting Patterns

| Goal                  | Example Prompt                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Add new HTTP Function | "Create an Azure Function http handler in backend that enqueues a world event (see docs/modules/navigation-and-traversal.md)." |
| Extend API handler    | "Refactor HttpPlayerActions to validate direction against allowed exits list (see world rules doc)."                           |
| Generate test         | "Write Node --test tests for graph utility parseRoomId covering invalid GUID cases."                                           |

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

-   ES Modules only.
-   Async/await I/O, no nested promise chains.
-   Short, intention‑revealing function names: `enqueueWorldEvent`, `validateExitDirection`.

## Rejecting Low-Quality Suggestions

Discard suggestions that:

-   Introduce stateful singletons without clear need.
-   Add libraries outside project scope (heavy ORMs, large utility libs).
-   Duplicate domain logic already defined elsewhere.

## Updating Copilot Instructions

If you add major architecture components (e.g., Cosmos graph schema utilities), update `.github/copilot-instructions.md` in the same PR.

## Security & Secrets

-   Never hardcode secrets. Use environment variables / future Key Vault integration.
-   Do not accept suggestions injecting analytics / network calls without design approval.

## Helpful Aliases

| Command                        | Purpose                            |
| ------------------------------ | ---------------------------------- |
| `cd frontend && npm run build` | Build production bundle.           |
| `cd backend && npm run build`  | Build backend functions.           |
| `cd shared && npm run build`   | Build shared package.              |
| `npm run typecheck`            | TypeScript validation per package. |

## Next Improvements

-   Add prompt templates for queue/event patterns.
-   Provide a shared util for Gremlin queries (once introduced) with documented patterns to steer Copilot.

Use Copilot as a speed boost, not an architectural decision maker.
