# Using Copilot in This Repository

Copilot should accelerate tactical coding (scaffolds, small functions, tests) while you enforce architectural and gameplay boundaries defined in `docs/`.

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

Run frontend & backend separately (`npm run dev -w frontend` + `npm start -w backend`). Configure a Vite proxy for same‑origin behavior when needed. Tailor prompts to the layer you are editing; include brief domain rule excerpts for movement, identity, or world events to guide generation.

## Style & Conventions

- ES Modules only.
- Async/await I/O, no nested promise chains.
- Short, intention‑revealing function names: `enqueueWorldEvent`, `validateExitDirection`.

## Rejecting Low-Quality Suggestions

Discard suggestions that:

- Introduce stateful singletons without clear need.
- Add libraries outside project scope (heavy ORMs, large utility libs).
- Duplicate domain logic already defined elsewhere.

## Updating Copilot Instructions

If you add major architecture components (e.g., Cosmos graph schema utilities), update `.github/copilot-instructions.md` in the same PR.

## Security & Secrets

- Never hardcode secrets. Use environment variables / future Key Vault integration.
- Do not accept suggestions injecting analytics / network calls without design approval.

## Helpful Aliases

| Command                     | Purpose                             |
| --------------------------- | ----------------------------------- |
| (removed)                   | Former unified SWA emulator script. |
| `npm run build -w frontend` | Build production bundle.            |
| `npm run typecheck`         | Monorepo TypeScript validation.     |

## Next Improvements

- Add prompt templates for queue/event patterns.
- Provide a shared util for Gremlin queries (once introduced) with documented patterns to steer Copilot.

Use Copilot as a speed boost, not an architectural decision maker.
