# Foundry Agent Orchestration Notes (Optional)

**Purpose**: Keep Foundry-specific guidance minimal and non-blocking. Prototyping does **not** require Foundry.

**Portal Version**: [Microsoft Foundry (classic)](https://learn.microsoft.com/en-us/azure/ai-foundry/what-is-foundry?view=foundry-classic)  
**Last Updated**: 2026-01-30

> **Important**: This guide is intentionally conservative about portal features. Capabilities can vary by tenant/API version/rollout timing.

---

## Read this first

Foundry capabilities (especially around multi-agent orchestration and tool wiring) can vary by tenant, API version, and rollout timing.

For **rapid prototyping**, start with:

- `../architecture/agentic-ai-and-mcp.md` (runtime-agnostic architecture)
- `../developer-workflow/local-dev-setup.md` (run the local website + Functions)

---

## Prototype-first: local website execution

**When to use**: Fast iteration on prompts, tool selection, and output formats.

**How it works**:

1. The local website (frontend) collects player input.
2. The backend (local Functions host) runs the orchestration server-side (so secrets are not exposed to the browser).
3. Tool calls are executed by calling your MCP endpoint (`tools/call`) over HTTP.
4. Tool results are fed back into the model.

This keeps the MCP tool surface stable and avoids betting on a portal feature set.

See: `../architecture/agentic-ai-and-mcp.md`.

---

## Production: backend orchestration (Azure Functions)

**When to use**:

- Stateful workflows that persist across multiple player turns
- Complex business logic that requires database access
- Integration with Service Bus queues for async processing

**How it works**: Azure Function receives player action → runs the model (or agent runtime) → calls MCP tools → writes results to Cosmos → returns narrative.

### Minimal orchestration shape (pseudocode)

```text
HttpPlayerAction(playerId, inputText):
  context = mcp.get-player-context(playerId)
  location = mcp.get-location-context(context.locationId)

  modelResponse = model.chat(
    system = DM narrator instructions,
    messages = [player input],
    tools = [mcp tool schemas]
  )

  while modelResponse.requestsToolCall:
    toolResult = mcp.tools/call(modelResponse.toolName, modelResponse.toolArgs)
    modelResponse = model.chat(..., messages += [toolResult])

  return modelResponse.finalNarrative
```

### Benefits of Backend Orchestration:

- ✅ Full control over agent call order
- ✅ Access to Cosmos DB for state persistence
- ✅ Can integrate with Service Bus for async workflows
- ✅ Easier to test (unit test the orchestration logic)

### Drawbacks:

- ❌ More code to maintain
- ❌ Not visual (debug via logs/traces instead)
- ❌ Requires deploying backend changes

---

## Optional future: hosted agent runtimes (Foundry or other)

Once you’re happy with:

- tool schemas
- prompt templates
- output formats

…you can decide whether to host the orchestration in a managed runtime.

Documentation indicates an MCP tool exists in the agents tools catalog, but availability and UI wiring can vary. Treat hosted runtimes as an optimization, not a prerequisite.

### What “hosted runtime” changes (and what it must not change)

Hosted runtimes should only change _where_ the model runs and _how_ you manage identities/keys.

They must **not** change:

- MCP tool contracts
- validation gates
- authoritative persistence boundaries

---

## Recommended architecture for The Shifting Atlas (practical)

- **Prototype**: Local website + backend runner + MCP endpoint (fastest feedback loop)
- **Production**: Backend orchestration (Azure Functions) + MCP endpoint
- **Future** (optional): Hosted runtime (Foundry, etc.) once feature availability matches your needs

---

## If you want to explore Foundry later

Start from the runtime-agnostic approach first (local website + backend runner + MCP). If you later decide to adopt Foundry as a hosted runtime, prefer wiring your tools via:

- OpenAPI tools (stable, explicit schemas)
- Azure Functions tools (managed)
- MCP tools (if available/usable in your tenant/API version)

See Microsoft tool catalog overview (classic agents API):

- https://learn.microsoft.com/en-us/azure/ai-foundry/agents/how-to/tools-classic/overview?view=foundry-classic

See also:

- [Foundry Setup Checklist](./foundry-setup-checklist.md) — optional setup notes
