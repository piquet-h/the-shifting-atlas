# Prompt Template Usage Guide for Azure Foundry

**Last Updated**: 2026-01-30  
**Status**: Active

## Template Classification

Your prompt templates fall into two categories based on their intended use with Azure AI Foundry agents:

### 1. System Prompts (Agent Instructions)

These define the **persistent persona and behavior** of an agent. Used as the `instructions` field in Foundry agent configuration.

| Template               | Agent Type        | Purpose                                                                                                    |
| ---------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------- |
| **`dm-narrator.json`** | DM Narrator Agent | Master game narrator: interprets player actions, maintains world state, applies narrative governance rules |

**Foundry Usage**:

```yaml
Agent Configuration:
    Name: DungeonMasterNarrator
    Instructions: <paste entire dm-narrator.json template content>
    Model: gpt-4o
    Tools: [WorldContext-*, Lore-*]
```

### 2. Task Prompts (Specialized Generation)

These are **one-off generation requests** for specific content types. Can be used in three ways:

| Template                          | Purpose                            | Primary Use Case                                             |
| --------------------------------- | ---------------------------------- | ------------------------------------------------------------ |
| **`location-generator.json`**     | Generate new location descriptions | Offline world-building or specialized LocationGeneratorAgent |
| **`npc-dialogue-generator.json`** | Generate NPC dialogue              | Runtime dialogue or specialized DialogueAgent                |
| **`quest-generator.json`**        | Generate quest content             | Offline quest design or specialized QuestDesignAgent         |

**Foundry Usage Patterns**:

#### Pattern A: Specialized Agent (Recommended for offline tasks)

```yaml
Agent: LocationGeneratorAgent
Instructions: <paste location-generator.json template>
Model: gpt-4o-mini (cost-effective for batch generation)
Tools: [Lore-searchLore, WorldContext-getSpatialContext]
```

#### Pattern B: User Message to DM Narrator (Recommended for runtime)

```typescript
// Send task prompt as user message to main DM agent
const response = await foundryClient.chat({
    agent: 'DungeonMasterNarrator',
    messages: [
        {
            role: 'user',
            content: `TASK: Generate NPC dialogue\n\n${npcDialogueTemplate}\n\nVariables:\nnpc_name: Gareth the Blacksmith\n...`
        }
    ]
})
```

#### Pattern C: Direct LLM Call (Current implementation, no agent)

```typescript
// Current backend handler approach (pre-Foundry)
const template = await promptRepo.getLatest('location-generator')
const prompt = template.content.replace('[terrain_type]', 'forest').replace('[existing_location]', 'Millhaven')

const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }]
})
```

## Template Selection Decision Tree

```
Is this defining the agent's PERSISTENT BEHAVIOR/PERSONA?
├─ YES → System Prompt (dm-narrator.json)
│   └─ Use as: Agent instructions field
│
└─ NO → Is this a SPECIFIC GENERATION TASK?
    ├─ YES → Task Prompt (location/npc/quest-generator.json)
    │   ├─ Runtime (player-facing)?
    │   │   └─ Send as user message to DM Narrator agent
    │   │
    │   └─ Offline (world-building)?
    │       └─ Create specialized agent OR direct LLM call
    │
    └─ NO → Create new template
```

## Migration Path: Current → Foundry

### Current State (Pre-Foundry)

```typescript
// backend/src/handlers/generateLocation.ts
const template = await promptRepo.getLatest('location-generator')
const prompt = interpolateVariables(template.content, variables)
const response = await directLLMCall(prompt)
```

### Foundry Integration (Recommended)

**Option 1: Single DM Narrator Agent (Simpler)**

```typescript
// DM Narrator handles all tasks via user messages
const dmAgent = new FoundryAgentClient('DungeonMasterNarrator')

// For location generation
const locationPrompt = await promptRepo.getLatest('location-generator')
const response = await dmAgent.chat({
    messages: [
        {
            role: 'user',
            content: formatTaskMessage(locationPrompt, variables)
        }
    ]
})
```

**Option 2: Specialized Agents (More organized)**

```typescript
// Separate agents for different content types
const locationAgent = new FoundryAgentClient('LocationGeneratorAgent')
const dialogueAgent = new FoundryAgentClient('NPCDialogueAgent')
const dmAgent = new FoundryAgentClient('DungeonMasterNarrator')

// Use appropriate agent for each task
const location = await locationAgent.generate(variables)
const dialogue = await dialogueAgent.generate(npcContext)
const narrative = await dmAgent.interpret(playerCommand)
```

## Template Metadata Guidance

All templates now include `usage.platform` and `usage.usagePatterns` fields:

```json
{
    "metadata": {
        "usage": {
            "platform": "Azure AI Foundry",
            "usagePatterns": ["Specialized agent system instructions", "User message to DM Narrator agent", "Direct LLM call (current)"],
            "mcpToolsNeeded": ["WorldContext-*", "Lore-*"],
            "interpolation": "Variables replaced before sending or injected as context"
        }
    }
}
```

## Deprecated Templates

The `-v2` templates were auto-generated during migration and lack proper metadata:

- ❌ `location-generator-v2.json` → Use `location-generator.json` instead
- ❌ `npc-dialogue-generator-v2.json` → Use `npc-dialogue-generator.json` instead

**Action**: Remove `-v2` templates once all references are migrated.

## Cost Optimization

### Model Selection by Use Case

| Agent Type         | Recommended Model | Rationale                                       |
| ------------------ | ----------------- | ----------------------------------------------- |
| DM Narrator        | `gpt-4o`          | High-quality real-time narration, player-facing |
| Location Generator | `gpt-4o-mini`     | Batch generation, offline, cost-sensitive       |
| NPC Dialogue       | `gpt-4o`          | Player-facing, quality matters                  |
| Quest Generator    | `gpt-4o-mini`     | Offline planning, less critical                 |

### Caching Strategy

Foundry caches system instructions after first use:

- ✅ System prompts (dm-narrator) → **50% cost reduction** after initial call
- ❌ User messages (task prompts) → Not cached (different each time)

**Recommendation**: For frequently-used tasks, prefer specialized agents (system prompt caching) over user messages.

## Example: Complete Foundry Setup

```yaml
# Foundry Project Configuration

Agents:
    # Primary runtime agent
    - Name: DungeonMasterNarrator
      Instructions: <dm-narrator.json template>
      Model: gpt-4o
      Temperature: 0.7
      MaxTokens: 2000
      Tools:
          - WorldContext-getLocationContext
          - WorldContext-getPlayerContext
          - WorldContext-getSpatialContext
          - WorldContext-getRecentEvents
          - Lore-getCanonicalFact
          - Lore-searchLore

    # Specialized content generators (optional)
    - Name: LocationGeneratorAgent
      Instructions: <location-generator.json template>
      Model: gpt-4o-mini
      Temperature: 0.8
      MaxTokens: 1000
      Tools:
          - Lore-searchLore
          - WorldContext-getSpatialContext

    - Name: NPCDialogueAgent
      Instructions: <npc-dialogue-generator.json template>
      Model: gpt-4o
      Temperature: 0.7
      MaxTokens: 800
      Tools:
          - Lore-searchLore
          - WorldContext-getPlayerContext
          - WorldContext-getRecentEvents
```

## Testing Your Templates

### Unit Test: Template Schema

```bash
npm run prompts:validate
```

### Integration Test: Foundry Playground

1. Navigate to agent in Foundry UI
2. Test with realistic player input
3. Verify agent calls correct MCP tools
4. Check narrative quality and tone

### Cost Test: Monitor Token Usage

```typescript
this.track('AI.Agent.TokenUsage', {
    agentId: 'dm-narrator',
    templateId: 'dm-narrator',
    inputTokens: response.usage.prompt_tokens,
    outputTokens: response.usage.completion_tokens,
    totalCost: calculateCost(response.usage)
})
```

## Related Documentation

- [Azure Foundry Agent Setup](./azure-foundry-agent-setup.md)
- [Agentic AI & MCP Architecture](../architecture/agentic-ai-and-mcp.md)
- [Prompt Template Schema](../../shared/src/prompts/schema.md)
- [Prompt Template README](../../shared/src/prompts/README.md)

---

**Quick Reference Card**

| When to use...              | Template                      | As...                             |
| --------------------------- | ----------------------------- | --------------------------------- |
| Player takes action         | `dm-narrator.json`            | Agent instructions                |
| Generate location (offline) | `location-generator.json`     | Specialized agent OR user message |
| NPC speaks to player        | `npc-dialogue-generator.json` | User message to DM Narrator       |
| Design quest (offline)      | `quest-generator.json`        | Specialized agent OR user message |
