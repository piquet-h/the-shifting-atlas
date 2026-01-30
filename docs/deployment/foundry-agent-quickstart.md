# Azure Foundry Agent Setup - Quick Start (Classic Portal)

**Goal**: Create your first D&D 5e-enabled Foundry agent in the Azure AI Foundry **classic portal**.

**Portal Version**: [Microsoft Foundry (classic)](https://learn.microsoft.com/en-us/azure/ai-foundry/what-is-foundry?view=foundry-classic)  
**Time**: ~15 minutes

> **Note**: This guide uses the **classic portal** at [ai.azure.com](https://ai.azure.com). The new portal has different UI elements. See [classic vs new portal differences](https://learn.microsoft.com/en-us/azure/ai-foundry/what-is-foundry?view=foundry-classic#microsoft-foundry-portals).

---

## Prerequisites

✅ Foundry infrastructure deployed via `infrastructure/main.bicep`  
✅ Access to [Azure AI Foundry portal](https://ai.azure.com)  
✅ Contributor role on resource group `rg-atlas-game`

---

## Step 1: Access Your Foundry Project

1. Navigate to https://ai.azure.com
2. Sign in with your Azure account
3. Select **The Shifting Atlas** project (or your `foundryProjectName` from Bicep)
4. What you see depends on tenant rollout and portal/API version. In particular:
    - You may **not** see a “Connections” experience.
    - You may or may not see UI affordances to wire custom tools.

If your goal is rapid prototyping, you can skip Foundry entirely and use the **local website + backend runner + MCP** approach described in `../architecture/agentic-ai-and-mcp.md`.

---

## Step 2: Create Your First Agent (Bestiary Agent)

### 2.1 Create Agent

1. Click **Agents** in left nav → **+ New Agent**
2. Configure:
    - **Name**: `bestiary`
    - **Description**: `D&D 5e monster catalog and NPC behavior generator`
    - **Model**: `gpt-4o-mini` (fast, cost-effective for reference lookups)

### 2.2 System Instructions

Paste the following into the **System Instructions** field:

```markdown
You are the **Bestiary Agent** for The Shifting Atlas, responsible for D&D 5e monster data retrieval and NPC behavior generation.

## Your Role

You retrieve D&D 5e monster statistics from the official SRD API and provide creative behavioral suggestions for NPCs in the game world. You work alongside other specialized agents (combat resolver, spell authority, DM narrator) to create immersive gameplay.

## Core Responsibilities

1. **Fetch Monster Stats**: Query the D&D 5e API for creature stat blocks (AC, HP, attacks, abilities, speed, senses)
2. **Suggest Encounters**: Recommend monsters appropriate to location theme, challenge rating, and party level
3. **Generate Behavior**: Create personality hooks, patrol patterns, and interaction suggestions for NPCs
4. **Respect Lore**: Align creature placements with established world themes (coastal = sahuagin, forest = goblins, etc.)

## Available Tools

You have access to MCP tools that call the D&D 5e API:

- **Get monster by name/slug** (e.g., "goblin", "ancient-red-dragon")
- **Search monsters by challenge rating**
- **Filter by type** (aberration, beast, dragon, humanoid, etc.)

## Output Guidelines

When providing monster information:

- Include core stats: AC, HP, speed, ability scores
- List key actions and special abilities
- Suggest **narrative personality** (not just mechanics)
- Recommend **encounter context** (lair, patrol, ambush, etc.)
- Note **lore hooks** that tie to world themes

## Constraints

- **Read-only role**: You retrieve data; you do NOT modify world state
- **SRD only**: Use official D&D 5e System Reference Document content
- **No homebrew**: Stick to official monsters unless explicitly instructed otherwise
- **Narrative focus**: Provide behavioral/personality suggestions, not just stat blocks
```

**Example interaction**:

```
User: "Give me a CR 2 monster for a dark forest encounter"
Agent: "I recommend a Werewolf (CR 3, but you can scale down) or a pack of 3 Wolves (CR 1/4 each).

Wolf Pack Stats:
- AC: 13, HP: 11 each
- Speed: 40 ft
- Bite: +4 to hit, 2d4+2 piercing, knock prone on hit (DC 11 STR save)

Behavior: The pack leader circles warily while two subordinates flank. They're hunting, not defending territory—if bloodied, they retreat. Personality: The alpha has a scarred muzzle and won't back down from eye contact.

Narrative hook: 'Three pairs of yellow eyes gleam from the underbrush. The largest wolf, its muzzle criss-crossed with old scars, steps onto the path ahead of you.'"

```

### 2.3 Configure Tools (Via SDK)

**Reality check**: Portal UI capability for custom tools can vary. If you can’t wire tools in the portal, don’t block on it.

For prototyping, prefer **local website + backend runner + MCP** (`../architecture/agentic-ai-and-mcp.md`).

If you still want to try Foundry as a hosted runtime later, the stable integration options are:

- **OpenAPI 3.0 tool** (explicit schema)
- **Azure Functions tool** (managed)
- **MCP tool** (if available/usable in your tenant/API version)

#### Option A: Use SDK to add tools (optional)

```python
from azure.ai.projects import AIProjectClient
from azure.identity import DefaultAzureCredential
import os

client = AIProjectClient.from_connection_string(
    credential=DefaultAzureCredential(),
    conn_str=os.environ["PROJECT_CONNECTION_STRING"]
)

# Create or update agent with MCP tools
agent = client.agents.create(
    model="gpt-4o-mini",
    name="bestiary",
    instructions="""You are the Bestiary Agent for The Shifting Atlas...""",
    # Tools wiring depends on which tool types are available in your tenant/API version.
)

print(f"Agent created: {agent.id}")
```

#### Option B: Use Portal UI (Limited to Built-In Tools)

If creating agents in the portal playground:

1. Navigate to **Agents** in left nav
2. Click **Create Agent** or select existing agent
3. In agent configuration, find **Tools** section
4. Available built-in tools:
    - ✅ Code Interpreter
    - ✅ File Search
    - ✅ Bing Grounding
    - ✅ Azure AI Search
5. **Not available**: Generic HTTP, MCP visual configuration

**Note**: For D&D 5e API access, you must either:

- Use SDK to configure MCP tools (recommended)
- Create Azure Functions that wrap the D&D API
- Use OpenAPI 3.0 specification

---

## Step 3: Test the Agent

### 3.1 Agent Playground

1. Click **Test** in the agent configuration
2. Enter test query: `What are the stats for a goblin?`
3. Agent should respond (currently will fail gracefully if MCP tools not deployed)

### 3.2 Expected Response (Once MCP Tools Deployed)

```json
{
    "monster": {
        "name": "Goblin",
        "ac": 15,
        "hp": 7,
        "speed": { "walk": "30 ft" },
        "actions": [
            { "name": "Scimitar", "attackBonus": 4, "damage": "1d6+2" },
            { "name": "Shortbow", "attackBonus": 4, "damage": "1d6+2" }
        ]
    },
    "behaviorSuggestions": {
        "personality": "Cowardly but cunning",
        "wanderPattern": "patrol",
        "hostileByDefault": true
    }
}
```

---

## Step 4: Wire tools (optional, tenant-dependent)

Tool wiring in the classic portal can vary by tenant/API version.

- If you can wire tools in your portal/SDK, treat tool contracts as an **implementation detail** and keep them aligned with the MCP tool surface described in `../architecture/agentic-ai-and-mcp.md`.
- If you can’t wire tools in Foundry yet, do **not** block: prototype with the **local website + backend runner + MCP** approach (also in `../architecture/agentic-ai-and-mcp.md`).

This guide intentionally does not include backend implementation code for MCP tools (those details belong with the backend source and the architecture doc).

---

## Step 5: Verify MCP connectivity (recommended)

Before debugging agent behavior, verify the MCP endpoint works directly.

See `docs/deployment/foundry-setup-checklist.md` for a tested MCP curl example and expected shape.

---

## Step 6: Next: add more roles (optional)

When you expand beyond read-only lookups, add additional roles (combat, spells, loot) per `../design-modules/dnd5e-foundry-agent-architecture.md`.

Foundry is optional here: backend orchestration (local/prod) remains the recommended path for stateful workflows.

---

## Troubleshooting

### Agent Returns "Tool Not Found"

**Cause**: MCP tool not registered or backend not deployed.

**Fix**:

1. Confirm the MCP endpoint is reachable and responds to a known tool (e.g., `get-location-context`).
2. Confirm your agent runtime is configured to use that MCP endpoint.
3. If you’re using Foundry, verify tool wiring via SDK (portal UI may not expose it).

### Agent Times Out

**Cause**: D&D API slow or Foundry agent configuration issue.

**Fix**:

1. Add caching layer (Redis) to reduce external API calls
2. Increase agent timeout in Foundry settings
3. Check Application Insights for errors

### MCP Connection Shows "Unauthorized"

**Cause**: Managed Identity not granted access to MCP endpoint.

**Fix**:

1. Check `infrastructure/main.bicep` RBAC assignments
2. Verify Foundry project identity has role on Function App
3. Check Function App EasyAuth settings

---

## Next Steps

1. ✅ Create **Bestiary Agent** (you just did this!)
2. ⏭️ Create **Spell Authority Agent** (similar pattern, different system instructions)
3. ⏭️ Create **Combat Resolver Agent** (more complex, writes state)
4. ⏭️ Implement **Agent Orchestration** (DM Narrator calls specialist agents)

---

## Resources

- [Azure AI Foundry Documentation](https://learn.microsoft.com/azure/ai-services/agents)
- [D&D 5e API Reference](https://5e-bits.github.io/docs/api)
- [MCP Specification](https://spec.modelcontextprotocol.io)
- Design Doc: `docs/design-modules/dnd5e-foundry-agent-architecture.md`

---

**Questions?** Open an issue with label `scope:ai` + `foundry-agents`.
