# Azure AI Foundry Agent Setup Guide

**Status**: Reference guide — M4c (Agent Sandbox Write-lite) is fully implemented.  
**Deployed MCP tools**: `WorldContext-*`, `Lore-*`, `NarrativeGenerator-*`, `IntentParser-*`, `WorldOperations-*`.  
**Scope**: Conceptual Foundry agent setup and integration architecture for the D&D 5e tool surface.  
**Last Updated**: 2026-01-30

## Overview

This guide shows how to deploy The Shifting Atlas DM Narrator as an Azure AI Foundry hosted agent, leveraging existing MCP tools without building custom Python agent infrastructure.

## Prerequisites

- Azure subscription with AI Foundry access
- Existing Azure Functions deployment with MCP servers (`WorldContext-*`, `Lore-*`)
- OpenAI or Azure OpenAI endpoint configured in Foundry

## Architecture

```
Player Frontend (React)
  ↓ HTTP POST /player/command
Azure Function (TypeScript) - Command Handler
  ↓ HTTP POST (with context)
Azure Foundry Agent - DM Narrator
  | System Instructions: dm-narrator.json template
  | Model: gpt-4o / gpt-4o-mini
  ↓ MCP Tool Calls (HTTP to your Functions)
  ├─ WorldContext-getLocationContext
  ├─ WorldContext-getPlayerContext
  ├─ WorldContext-getSpatialContext
  ├─ Lore-searchLore
  └─ (future: more tools)
  ↓ Returns narrative + proposed state changes
Azure Function (TypeScript) - Validation & Persistence
  ↓ Validates proposals
  ↓ Persists to Cosmos DB
  ↓ Emits telemetry
Frontend (receives narrative)
```

## Step 1: Create Azure AI Foundry Project

1. Navigate to [Azure AI Foundry](https://ai.azure.com)
2. Create new project (or use existing)
3. Configure Azure OpenAI connection:
    - Model: `gpt-4o` (recommended) or `gpt-4o-mini` (cost-effective)
    - Deployment name: record for agent configuration

## Step 2: Register MCP Tools in Foundry

Your existing Azure Functions MCP endpoints need to be registered as tools in Foundry.

**Foundry Tool Definition (example for WorldContext-getLocationContext):**

```json
{
    "name": "get-location-context",
    "type": "http",
    "description": "Retrieves detailed context about a location including description, exits, entities, recent events, and nearby players",
    "endpoint": "https://func-atlas.azurewebsites.net/runtime/webhooks/mcp",
    "method": "POST",
    "headers": {
        "Content-Type": "application/json"
    },
    "body": {
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {
            "name": "WorldContext-getLocationContext",
            "arguments": {
                "locationId": "{locationId}",
                "tick": "{tick}"
            }
        }
    },
    "parameters": [
        {
            "name": "locationId",
            "type": "string",
            "description": "ID of the location to retrieve context for",
            "required": false
        },
        {
            "name": "tick",
            "type": "number",
            "description": "World tick timestamp (milliseconds)",
            "required": false
        }
    ]
}
```

**Repeat for each MCP tool**:

- `WorldContext-getPlayerContext`
- `WorldContext-getSpatialContext`
- `WorldContext-getRecentEvents`
- `WorldContext-getAtmosphere`
- `Lore-getCanonicalFact`
- `Lore-searchLore`

## Step 3: Create DM Narrator Agent

1. In Foundry project, navigate to **Agents**
2. Click **Create Agent**
3. Configure:

**Agent Name**: `DungeonMasterNarrator`

**Model**: `gpt-4o` (or your deployment name)

**System Instructions**: Paste entire content from `shared/src/prompts/templates/dm-narrator.json` → `template` field

**Tools**: Select all MCP tools registered in Step 2

**Temperature**: `0.7` (balanced creativity)

**Max Tokens**: `2000` (adjust based on narrative length needs)

**Top P**: `0.95`

## Step 4: Deploy Agent Endpoint

1. Click **Deploy** in Foundry UI
2. Record endpoint URL (e.g., `https://<project>.inference.ai.azure.com/agents/<agent-id>/chat`)
3. Configure authentication (Managed Identity or API key)

## Step 5: Update Backend to Call Foundry Agent

> **Note**: The code below is a **conceptual illustration** of the integration pattern. The actual backend uses `ResolvePlayerCommand`, `AgentStepHandler`, and `POST /api/agent/propose` (see `docs/architecture/agent-sandbox-contracts.md` for the implemented pipeline). `FoundryAgentClient` is a placeholder for the Foundry SDK client.

**Before** (no agent):

```typescript
// backend/src/handlers/playerCommand.ts
async execute(req: HttpRequest): Promise<HttpResponseInit> {
    const { playerId, command } = await req.json()

    // Direct handler logic
    const result = await this.movePlayer(playerId, command)
    return okResponse(result)
}
```

**After** (with Foundry agent — conceptual):

```typescript
// backend/src/handlers/playerCommand.ts
// FoundryAgentClient: placeholder for @azure/ai-projects AIProjectClient
async execute(req: HttpRequest): Promise<HttpResponseInit> {
    const { playerId, command } = await req.json()

    // 1. Gather context for agent (via MCP tools or direct repo reads)
    const context = await this.buildAgentContext(playerId)

    // 2. Call Foundry agent
    const agentResponse = await this.foundryClient.chat({
        messages: [
            {
                role: "user",
                content: `Player action: ${command}\n\nContext:\n${this.formatContext(context)}`
            }
        ],
        toolChoice: "auto"
    })

    // 3. Validate agent's proposed state changes via AgentProposalApplicator
    const validatedChanges = await this.validator.validate(
        agentResponse.stateChanges,
        context
    )

    // 4. Persist validated changes
    await this.persistChanges(validatedChanges)

    // 5. Return narrative to player
    return okResponse({
        narrative: agentResponse.narrative,
        changes: validatedChanges
    })
}

private async buildAgentContext(playerId: string) {
    const player = await this.playerRepo.getById(playerId)
    const location = await this.locationRepo.getById(player.currentLocationId)
    const exits = await this.exitRepo.getExitsFrom(player.currentLocationId)

    return {
        player_id: playerId,
        current_location: location.description,
        visible_exits: exits.map(e => `${e.direction}: ${e.description}`).join(' | '),
        location_entities: location.entities || [],
        character_background: player.background || "unknown adventurer",
        temporal_state: `${this.worldClock.getTimeOfDay()}, ${this.worldClock.getWeather()}`
    }
}

private formatContext(context: any): string {
    return Object.entries(context)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n')
}
```

## Step 6: Configure Monitoring

**In Azure Foundry**:

1. Enable **Application Insights** integration
2. Configure custom metrics:
    - Token usage per request
    - MCP tool call frequency
    - Agent response latency

**In Your Backend**:

Use centralized telemetry event constants from `shared/src/telemetryEvents.ts` — do not use inline string literals. Relevant existing events for agent-call tracking:

- `MCP.Tool.Invoked` — emitted when any MCP tool is invoked (includes `toolName` and `latencyMs`)
- `Agent.Proposal.Received`, `Agent.Proposal.Accepted`, `Agent.Proposal.Rejected` — proposal pipeline audit trail
- `Agent.Step.Start`, `Agent.Step.Completed` — autonomous step loop bookends
- `AI.Cost.Estimated`, `AI.Cost.WindowSummary` — token/cost telemetry

For a new Foundry agent call site, extend the existing telemetry pattern rather than inventing new event names. If a new event is needed (e.g., `Agent.FoundryCall.Completed`), add it to `GAME_EVENT_NAMES` in `shared/src/telemetryEvents.ts` first.

## Step 7: Testing

**Local Testing** (use Foundry Playground):

1. Navigate to agent in Foundry UI
2. Click **Test** tab
3. Input test message:

    ```
    Player action: look around

    Context:
    player_id: test-123
    current_location: The Broken Bridge. Ancient stone arches span a misty chasm.
    visible_exits: north: cobblestone path | south: stone steps into fog
    location_entities: hooded merchant, weathered signpost
    character_background: former cartographer
    temporal_state: late afternoon, light fog
    ```

4. Verify agent:
    - Uses theatrical DM voice
    - Calls appropriate MCP tools
    - Returns structured narrative
    - Respects narrative boundaries (additive-only)

**Integration Testing**:

```bash
# Test end-to-end flow
curl -X POST https://func-atlas.azurewebsites.net/api/player/command \
  -H "Content-Type: application/json" \
  -d '{
    "playerId": "test-123",
    "command": "examine the merchant"
  }'
```

## Step 8: Production Deployment

1. **Version your agent** in Foundry (e.g., `dm-narrator-v1.0.0`)
2. **Update backend config** to point to production agent endpoint
3. **Set rate limits**:
    - Max requests per player per minute
    - Max tokens per player per day
4. **Enable cost tracking**:
    - Tag agent calls with `player_id`, `session_id`
    - Monitor per-user token consumption
5. **Configure failover**:
    - If agent unavailable, fall back to simpler template-based responses
    - Emit alert telemetry

## Cost Management

**Model Selection**:

- `gpt-4o-mini`: ~$0.15 / 1M input tokens, ~$0.60 / 1M output tokens (recommended for start)
- `gpt-4o`: ~$5 / 1M input tokens, ~$15 / 1M output tokens (higher quality)

**Optimization Strategies**:

1. **Cache system instructions**: Foundry caches prompt prefix (50% cost reduction)
2. **Limit context size**: Only include relevant recent events (not full history)
3. **Use streaming**: Display partial responses to reduce perceived latency
4. **Batch operations**: Process multiple player actions together when appropriate

**Estimated Costs** (based on dm-narrator template):

- System instructions: ~2000 tokens (cached after first call)
- Per-request context: ~500 tokens
- Average response: ~300 tokens
- Cost per interaction (mini): ~$0.0005

At 1000 player interactions/day: **~$0.50/day** with gpt-4o-mini

## Troubleshooting

### Agent not calling MCP tools

**Symptom**: Narrative generated without factual location data  
**Fix**: Verify tool endpoints are accessible, check Foundry tool registration

### High latency (>5 seconds)

**Symptom**: Players waiting too long for responses  
**Fix**: Reduce context size, use streaming, consider gpt-4o-mini

### Agent ignoring narrative boundaries

**Symptom**: Rewriting base descriptions, inventing new lore  
**Fix**: Strengthen system instructions, add examples of violations in prompt

### Cost overruns

**Symptom**: Token usage exceeding budget  
**Fix**: Enable caching, reduce max_tokens, implement per-user rate limits

## Next Steps

- [ ] Create Foundry project
- [ ] Register MCP tools
- [ ] Deploy DM Narrator agent
- [ ] Update backend to call agent
- [ ] Test in Foundry playground
- [ ] Deploy to staging
- [ ] Monitor costs for 1 week
- [ ] Production rollout

## Related Documentation

- [Agentic AI & MCP Architecture](../architecture/agentic-ai-and-mcp.md)
- [Agent Sandbox Contracts](../architecture/agent-sandbox-contracts.md) — implemented pipeline (sense → decide → propose → validate → apply)
- [MCP Tool Catalog](../architecture/agentic-ai-and-mcp.md#mcp-tool-catalog-implemented-today)
- [Agent System Instructions Reference](../deployment/agent-system-instructions-reference.md)
- [Foundry Setup Checklist](../deployment/foundry-setup-checklist.md)
- [Azure AI Foundry Docs](https://learn.microsoft.com/en-us/azure/ai-studio/)

---

**Note**: M4c (Agent Sandbox Write-lite) is implemented. MCP tools are deployed and the proposal pipeline is live. This guide describes the conceptual wiring for connecting a Foundry-hosted agent to the existing MCP surface.
