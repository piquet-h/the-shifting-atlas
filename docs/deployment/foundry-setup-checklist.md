# Azure AI Foundry Setup Checklist (Classic Portal)

**Purpose**: Complete configuration guide for The Shifting Atlas agent ecosystem in Azure AI Foundry **Classic Portal**.

**Portal Version**: [Microsoft Foundry (classic)](https://learn.microsoft.com/en-us/azure/ai-foundry/what-is-foundry?view=foundry-classic#microsoft-foundry-portals)  
**Portal URL**: [ai.azure.com](https://ai.azure.com)  
**Time**: ~60 minutes

> **Important**: This guide is for the **classic portal** experience. The new portal has different UI elements and capabilities. See [Microsoft's documentation](https://learn.microsoft.com/en-us/azure/ai-foundry/what-is-foundry?view=foundry&preserve-view=true) if you're using the new portal.

---

## Prerequisites

✅ Azure AI Foundry project deployed (`infrastructure/main.bicep`)  
✅ Access to [Azure AI Foundry portal](https://ai.azure.com) (classic version)  
✅ Backend MCP server deployed with system key (`func-atlas`)  
✅ Contributor role on resource group `rg-atlas-game`  
✅ Azure AI User role at the project level

---

## Part 1: Tool Configuration (Via SDK or Per-Agent)

**Reality check**: Portal UI and tool wiring can vary by tenant/API version/rollout timing. Do not assume a specific “Connections” experience.

This repo’s execution posture is **Foundry-first**. Configure tools **per-agent** using:

- **Agent creation wizard** (basic tools only)
- **SDK configuration** (full MCP/OpenAPI/Function Calling support)

### Approach A: SDK-Based Tool Configuration (Optional)

**Why SDK**: Portal UI often supports only a subset of tools. SDK/API-based configuration is the most reproducible.

#### Step 1: Install Foundry SDK

```bash
pip install azure-ai-projects
# or
npm install @azure/ai-projects
```

#### Step 2: Configure tools programmatically

```python
from azure.ai.projects import AIProjectClient
from azure.identity import DefaultAzureCredential

# Connect to your Foundry project
project_client = AIProjectClient.from_connection_string(
    credential=DefaultAzureCredential(),
    conn_str="<your-project-connection-string>"
)

# Create agent (tool wiring depends on what tool types are available in your tenant/API version)
agent = project_client.agents.create(
    model="gpt-4o",
    name="dm-narrator",
    instructions="You are the Dungeon Master...",
)
```

### Approach B: Portal UI (Limited to Built-In Tools)

If you create agents in the portal playground:

1. Navigate to **Agents** → **Create Agent** or select existing agent
2. In agent configuration, scroll to **Tools** section
3. **Available in classic portal**:
    - ✅ Code Interpreter
    - ✅ File Search
    - ✅ Bing Grounding
    - ✅ Azure AI Search
    - ✅ Function Calling (manual JSON schema)
4. **NOT available in classic portal UI**:
    - ❌ Generic HTTP connections
    - ❌ MCP tool visual configuration
    - ❌ Centralized connection management

### MCP Server Configuration (Backend)

**Purpose**: Access world state, player context, location data, events.

**Available MCP Tools** (after connection):

- `get-location-context` — Location data, exits, layers, nearby players
- `get-player-context` — Player state, inventory, current location
- `get-atmosphere` — Weather, time-of-day, ambient conditions
- `get-spatial-context` — Nearby locations (depth: 1-5)
- `get-recent-events` — Location or player event history

### D&D 5e API Tool Configuration (Via MCP Wrapper)

**Classic Portal Reality**: No "Generic HTTP" connection type exists. You must wrap the D&D 5e API in either:

- **MCP Server** (recommended) - Deploy MCP endpoint that calls D&D API
- **OpenAPI 3.0 Tool** - Create OpenAPI spec and register via SDK
- **Azure Functions** - Deploy Functions that wrap API calls

#### Recommended: MCP Server Wrapper

Implement D&D reference tools as **adapters** and keep their schemas stable (so they can be wired as MCP/OpenAPI/Azure Functions tools depending on what your tenant/API version supports).

Design reference:

- `../architecture/agentic-ai-and-mcp.md` (tool-adapter approach and prototype runner model)
- `../design-modules/dnd5e-foundry-agent-architecture.md` (role topology and design boundaries)

This checklist intentionally does not embed backend source code paths or code snippets; those belong with the backend implementation.

---

## Part 2: Agents

Create agents in dependency order (DM Narrator first, then specialists).

### Agent 1: DM Narrator (Master Orchestrator)

**When**: Create first (other agents defer to this for final narrative).

**Configuration**:

- **Name**: `dm-narrator`
- **Model**: `gpt-4` (or `gpt-4o` for faster responses)
- **Description**: "Master dungeon master for The Shifting Atlas. Orchestrates narrative flow, humor, and player guidance."

**System Instructions**: See [Agent 1: DM Narrator](./agent-system-instructions-reference.md#agent-1-dm-narrator-master-orchestrator) in the System Instructions Reference.

**Tools to Enable**:

- ✅ MCP tool (backend endpoint): `get-location-context`, `get-player-context`, `get-atmosphere`, `get-spatial-context`
- ✅ D&D reference (via adapter): `get-monster`, `get-spell` (reference only)

---

### Agent 2: Bestiary (Monster & NPC Catalog)

**When**: Create second (needed for encounter suggestions).

**Configuration**:

- **Name**: `bestiary`
- **Model**: `gpt-4o-mini` (fast, cheap for lookups)
- **Description**: "D&D 5e monster catalog and NPC behavior generator"

**System Instructions**: See [foundry-agent-quickstart.md](./foundry-agent-quickstart.md#22-system-instructions)

**Tools to Enable**:

- ✅ D&D reference (via adapter): `get-monster`, `list-monsters-by-cr`, `get-condition`
- ⚠️ MCP (future): `spawn-wandering-npc` (not yet implemented)

---

### Agent 3: Combat Resolver

**When**: Create when combat mechanics are needed.

**Configuration**:

- **Name**: `combat-resolver`
- **Model**: `gpt-4` (needs reasoning for tactical decisions)
- **Description**: "D&D 5e combat resolution engine"

**System Instructions**: See [Agent 3: Combat Resolver](./agent-system-instructions-reference.md#agent-3-combat-resolver) in the System Instructions Reference.

**Tools to Enable**:

- ✅ D&D reference (via adapter): `get-monster`, `get-spell`, `get-condition`
- ✅ MCP tool (backend endpoint): `get-player-context`, `get-location-context`
- ⚠️ MCP (future): `resolve-combat-round` (for writing HP/state)

---

### Agent 4: Spell Authority

**When**: Create when magic mechanics are needed.

**Configuration**:

- **Name**: `spell-authority`
- **Model**: `gpt-4o` (fast structured output)
- **Description**: "D&D 5e spell validation and magic effects"

**System Instructions**: See [Agent 4: Spell Authority](./agent-system-instructions-reference.md#agent-4-spell-authority) in the System Instructions Reference.

**Tools to Enable**:

- ✅ D&D reference (via adapter): `get-spell`, `get-class`
- ✅ MCP tool (backend endpoint): `get-player-context`
- ⚠️ MCP (future): `cast-spell-with-effects` (for slot consumption)

---

### Agent 5: Quartermaster (Optional)

**When**: Create when loot/treasure mechanics are needed.

**Configuration**:

- **Name**: `quartermaster`
- **Model**: `gpt-4o-mini`
- **Description**: "Equipment, treasure, and magic item generator"

**System Instructions**: See [Agent 5: Quartermaster](./agent-system-instructions-reference.md#agent-5-quartermaster) in the System Instructions Reference.

**Tools to Enable**:
- ✅ D&D reference (via adapter): `get-equipment`
- ⚠️ MCP (future): `generate-treasure-from-cr`

---

### Agent 6: Character Authority (Optional)

**When**: Create when class/race mechanics are needed for character creation or leveling.

**Configuration**:
- **Name**: `character-authority`
- **Model**: `gpt-4o`
- **Description**: "D&D 5e character rules and class progression validator"

**System Instructions**: See [Agent 6: Character Authority](./agent-system-instructions-reference.md#agent-6-character-authority) in the System Instructions Reference.

**Tools to Enable**:

- ✅ D&D reference (via adapter): `get-class`, `get-race`, `get-ability-scores`
- ✅ MCP tool (backend endpoint): `get-player-context`
- ⚠️ MCP (future): `validate-character-creation`, `process-level-up`

---

## Part 3: Model Deployments (Only if using Foundry)

If you choose to use Foundry as a hosted runtime, verify model deployments exist in your Foundry project:

1. Navigate to **Deployments** → **Models**
2. Check for:
    - ✅ `gpt-4` (or `gpt-4-turbo`) — For reasoning-heavy agents (combat, DM narrator)
    - ✅ `gpt-4o` or `gpt-4o-mini` — For fast retrieval agents (bestiary, quartermaster, spells)

If missing, deploy from the model catalog.

---

## Part 4: Testing (Recommended regardless of runtime)

### Test 1: MCP Connection

```bash
# Get function key
key=$(az functionapp keys list -g rg-atlas-game -n func-atlas \
  --query "systemKeys.mcp_extension" -o tsv)

# Test MCP tool
curl -X POST "https://func-atlas.azurewebsites.net/runtime/webhooks/mcp?code=$key" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "test-1",
    "method": "tools/call",
    "params": {
      "name": "get-location-context",
      "arguments": {}
    }
  }'
```

Expected: JSON with location details.

---

### Test 2: D&D HTTP Connection

In Foundry portal → **Connections** → `dnd5e-api` → **Test Tool**:

Tool: `get-monster`  
Arguments: `{ "slug": "goblin" }`

Expected: Goblin stat block (AC: 15, HP: 7, etc.).

---

### Test 3: Agent Interaction

In Foundry portal → **Agents** → `dm-narrator` → **Playground**:

**User**: "Where am I?"  
**Expected**: Agent calls `get-location-context` and returns a vivid description.

**User**: "Tell me about goblins"  
**Expected**: Agent calls `get-monster` with slug "goblin" and summarizes stats.

---

## Part 5: Agent Orchestration (Future)

This checklist focuses on **setup** (portal/SDK wiring). Runtime sequencing and enforcement belong in the Workflows layer:

- Canonical single-turn flow: `../workflows/foundry/resolve-player-command.md`
- Multi-agent coordination patterns (combat/spells scenarios): `../workflows/foundry/agent-orchestration.md`

---

## Summary: What You Need

| Component          | Type        | Purpose             | Status                |
| ------------------ | ----------- | ------------------- | --------------------- |
| **Connections**    |             |                     |                       |
| `atlas-mcp-server` | MCP         | Game state access   | ✅ Required           |
| `dnd5e-api`        | HTTP        | D&D reference data  | ✅ Required           |
| **Agents**         |             |                     |                       |
| `dm-narrator`      | GPT-4/4o    | Master orchestrator | ✅ Required           |
| `bestiary`         | GPT-4o-mini | Monster/NPC lookup  | ✅ Recommended        |
| `combat-resolver`  | GPT-4       | Combat mechanics    | ⚠️ When combat needed |
| `spell-authority`  | GPT-4o      | Magic validation    | ⚠️ When magic needed  |
| `quartermaster`    | GPT-4o-mini | Loot generation     | ⚠️ Optional           |
| **Models**         |             |                     |                       |
| GPT-4 (or 4-turbo) | Deployment  | Reasoning tasks     | ✅ Required           |
| GPT-4o / 4o-mini   | Deployment  | Fast retrieval      | ✅ Recommended        |

**Minimum viable setup**: MCP connection + D&D HTTP connection + DM Narrator agent.

**Full gameplay setup**: Add Bestiary + Combat Resolver + Spell Authority.

---

## Next Steps

1. ✅ Complete Part 1 (Connections)
2. ✅ Create Agent 1 (DM Narrator)
3. ✅ Create Agent 2 (Bestiary)
4. ⚠️ Test end-to-end (playground)
5. ⚠️ Add combat/spell agents as gameplay expands
6. ⚠️ Implement MCP write tools (spawn NPCs, resolve combat, cast spells)

See [foundry-agent-quickstart.md](./foundry-agent-quickstart.md) for detailed bestiary agent setup walkthrough.
