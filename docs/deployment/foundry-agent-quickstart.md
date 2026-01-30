# Azure Foundry Agent Setup - Quick Start

**Goal**: Create your first D&D 5e-enabled Foundry agent in the Azure AI Foundry portal.

**Time**: ~15 minutes

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
4. You should see:
    - **Connections**: MCP server connection already configured
    - **Model deployments**: GPT-4, GPT-4o-mini (if enabled in Bicep)

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

You have access to HTTP functions that call the D&D 5e API:

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

### 2.3 Add HTTP Functions as Tools

1. In the agent editor, scroll to **Tools** section
2. Click **Add Function** (not "Add Connection")
3. If prompted, authorize the agent to call HTTP endpoints
4. The D&D 5e API endpoints will be available via Azure Functions that wrap the public API

**Note**: For the initial setup, the agent can work without backend tools by using general knowledge. Backend D&D 5e tools will be added in Phase 1 (see architecture doc).

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

## Step 4: Create MCP Tools (Backend Implementation)

Now create the backend MCP tools that the agent will call.

### 4.1 Create Tool Handler

File: `backend/src/functions/mcp/tools/dnd5e/getDnd5eMonster.ts`

```typescript
import { type MCPTool } from '../../../../types/mcp.js'

export const getDnd5eMonsterTool: MCPTool = {
    name: 'dnd5e-get-monster',
    description: 'Fetch D&D 5e monster stat block by slug',
    inputSchema: {
        type: 'object',
        properties: {
            slug: {
                type: 'string',
                description: 'Monster slug (e.g., "goblin", "ancient-red-dragon")'
            }
        },
        required: ['slug']
    }
}

export async function handleGetDnd5eMonster(args: { slug: string }) {
    const DND5E_API_BASE = 'https://www.dnd5eapi.co/api/2014'

    // TODO: Add caching layer (Redis or in-memory)
    const response = await fetch(`${DND5E_API_BASE}/monsters/${args.slug}`)

    if (!response.ok) {
        throw new Error(`D&D API error: ${response.status} ${response.statusText}`)
    }

    const monster = await response.json()

    // Transform to simplified schema
    return {
        name: monster.name,
        slug: args.slug,
        size: monster.size,
        type: monster.type,
        alignment: monster.alignment,
        ac: monster.armor_class[0]?.value || 10,
        hp: monster.hit_points,
        speed: monster.speed,
        actions:
            monster.actions?.map((action: any) => ({
                name: action.name,
                attackBonus: action.attack_bonus,
                damage: action.damage?.map((d: any) => d.damage_dice).join(', ')
            })) || []
    }
}
```

### 4.2 Register Tool

File: `backend/src/functions/mcp/McpServer.ts`

```typescript
import { getDnd5eMonsterTool, handleGetDnd5eMonster } from './tools/dnd5e/getDnd5eMonster.js'

// In tools array
const tools = [
    // ... existing tools
    getDnd5eMonsterTool
]

// In tool handler switch
case 'dnd5e-get-monster':
    return await handleGetDnd5eMonster(params.arguments)
```

---

## Step 5: Deploy & Test End-to-End

### 5.1 Deploy Backend

```bash
cd backend
npm run build
func azure functionapp publish func-atlas
```

### 5.2 Test MCP Tool Directly

```bash
# Get MCP function key
key=$(az functionapp keys list -g rg-atlas-game -n func-atlas \
  --query "systemKeys.mcp_extension" -o tsv)

# Test tool invocation
curl -X POST "https://func-atlas.azurewebsites.net/runtime/webhooks/mcp?code=$key" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "test-1",
    "method": "tools/call",
    "params": {
      "name": "dnd5e-get-monster",
      "arguments": { "slug": "goblin" }
    }
  }'
```

**Expected Response**:

```json
{
  "jsonrpc": "2.0",
  "id": "test-1",
  "result": {
    "name": "Goblin",
    "ac": 15,
    "hp": 7,
    ...
  }
}
```

### 5.3 Test via Foundry Agent

1. Return to Foundry portal → **Agents** → **bestiary**
2. **Connections** → Enable **dnd5e-get-monster** tool
3. **Test**: `What are the stats for a goblin?`
4. Agent should now successfully fetch and return monster data

---

## Step 6: Create Combat Resolver Agent (Advanced)

Once you've validated the Bestiary agent works, create a second agent:

### Agent Configuration

- **Name**: `combat-resolver`
- **Model**: `gpt-4` (reasoning-heavy for tactical decisions)
- **System Instructions**: (See design doc for full prompt)

### Key Differences from Bestiary

1. **Writes State**: Calls `world-update-entity-state` to persist HP changes
2. **Dice Rolling**: Implements d20 rolls and damage calculation
3. **Multi-Tool**: Calls both `dnd5e-get-monster` AND `world-get-player-state`

---

## Troubleshooting

### Agent Returns "Tool Not Found"

**Cause**: MCP tool not registered or backend not deployed.

**Fix**:

1. Check `backend/src/functions/mcp/McpServer.ts` tool registration
2. Verify deployment: `func azure functionapp list-functions func-atlas`
3. Test MCP endpoint directly (see Step 5.2)

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
