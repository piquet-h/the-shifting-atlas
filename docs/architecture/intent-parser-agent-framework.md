# Intent Parser + Agent Framework Integration

**Related**: `dnd-5e-agent-framework-integration.md` | `docs/modules/player-interaction-and-intents.md` | `docs/modules/entity-promotion.md`

## Executive Summary

This document details how to build an **Intent Parser MCP Server** and **Intent Parser Agent** that transforms free-form player text (`"throw a rock at the seagull and then chase it"`) into structured, actionable game commands using Microsoft Agent Framework.

**Status**: DESIGN SPECIFICATION - Intent parsing spec exists but not implemented  
**Priority**: **P0 - Critical Foundation** (M3 - Required before AI narrative generation)  
**Related Specs**: `docs/modules/player-interaction-and-intents.md`, `docs/modules/entity-promotion.md`

---

## The Problem: From Natural Language to Structured Actions

### Current State

✅ **Simple direction parsing works**: `"north"` → `{ direction: 'north' }`  
✅ **Direction normalization**: cardinal, ordinal, relative (`"turn around"`)  
❌ **Complex commands fail**: No parser for multi-step, multi-target actions

### The Challenge

**Player Input**: `"throw a rock at the seagull and then chase it"`

**Required Processing**:

1. **Parse** → Extract verbs, targets, objects, sequence
2. **Resolve Entities** → Identify "seagull" (needs promotion), "rock" (improvised item?)
3. **Sequence** → "throw" (order=0), "chase" (order=1)
4. **Promote** → Create `seagull_a4f3` entity from description layer
5. **Validate** → Check player can throw, seagull is targetable
6. **Execute** → Run actions in order with narrative generation

---

## Architecture Overview: TypeScript + Python Split

### Language Boundary

**TypeScript (Azure Functions)**:

- ✅ All MCP servers (HTTP endpoints)
- ✅ All database operations (Cosmos DB)
- ✅ All validation, policy checks
- ✅ All telemetry emission
- ✅ Existing game logic (move, look, etc.)
- ✅ Entity promotion, inventory management
- ❌ NO AI decision-making

**Python (Agent Framework)**:

- ✅ AI agents (decision-making only)
- ✅ Workflows (multi-agent orchestration)
- ✅ LLM calls (Azure OpenAI)
- ✅ MCP tool calls (HTTP to TypeScript servers)
- ❌ NO direct database access
- ❌ NO business logic duplication

### Communication Pattern

```
Player Browser (React/TypeScript)
  ↓ HTTP
[Azure Function: POST /player/command] (TypeScript)
  ↓ Stores raw command, generates correlation ID
  ↓ HTTP POST
[Python Agent Host: IntentResolutionAgent]
  ↓ HTTP GET (MCP tool call)
  ├─ [TypeScript MCP: /mcp/intent-parser] → Parse text
  ├─ [TypeScript MCP: /mcp/world-context] → Get entities
  ├─ [TypeScript MCP: /mcp/description-layering] → Scan descriptions
  └─ [TypeScript MCP: /mcp/policy-validator] → Validate intents
  ↓ Returns: Validated ParsedCommand (JSON)
[Azure Function] (TypeScript)
  ↓ Receives validated intents
  ↓ Executes via existing handlers (moveCore.ts, etc.)
  ↓ Persists to Cosmos DB (TypeScript repos)
  ↓ Emits telemetry (TypeScript)
  ↓ HTTP Response
Player Browser
```

### Data Flow Details

```
Player Input: "throw a rock at the seagull and then chase it"
  ↓
[TypeScript: /player/command endpoint]
  stores: { playerId, rawText, timestamp, correlationId }
  ↓ HTTP POST to Python agent host

[Python: IntentResolutionAgent] (AI decision layer)
  ↓ Tool Call 1: HTTP GET /mcp/intent-parser?text=...

[TypeScript: IntentParser MCP]
  heuristic parsing (regex, keywords)
  returns: ParsedCommand JSON

[Python: Agent receives ParsedCommand]
  ↓ Tool Call 2: HTTP GET /mcp/world-context?locationId=...

[TypeScript: WorldContext MCP]
  queries Cosmos DB (existing TypeScript repos)
  returns: { entities: [], exits: [] }

[Python: Agent decides - seagull not found]
  ↓ Tool Call 3: HTTP GET /mcp/description-layering?locationId=...

[TypeScript: DescriptionLayering MCP]
  retrieves layers from Cosmos SQL
  returns: { composited: "...a seagull perches..." }

[Python: Agent decides - seagull found in description, promote it]
  ↓ Tool Call 4: HTTP POST /mcp/world-context/promote

[TypeScript: WorldContext MCP]
  creates entity in Cosmos DB
  emits telemetry: Entity.Promotion.Created
  returns: { entityId: "seagull_a4f3" }

[Python: Agent decides - validate intents]
  ↓ Tool Call 5: HTTP POST /mcp/policy-validator

[TypeScript: PolicyValidator MCP]
  checks player permissions
  creates improvised rock item
  returns: { validated: [...] }

[Python: Agent returns final ParsedCommand]
  ↓ HTTP Response to TypeScript endpoint

[TypeScript: /player/command endpoint]
  receives validated intents
  executes: throwHandler(intent1), moveHandler(intent2)
  persists state changes (TypeScript)
  generates narrative (or calls Python NarrativeAgent)
  returns: { narrative: "...", updatedState: {...} }
  ↓
Player Browser (displays response)
```

### Why This Split?

**TypeScript owns**:

- ✅ **Data layer**: All Cosmos DB schemas, repositories, migrations
- ✅ **Business rules**: Exit validation, direction normalization, rate limiting
- ✅ **Performance**: Low-latency operations, no cold start for simple commands
- ✅ **Type safety**: Shared models in `@piquet-h/shared` package
- ✅ **Existing investment**: 10k+ LOC of battle-tested TypeScript

**Python owns**:

- ✅ **AI orchestration**: Multi-step reasoning, complex decision trees
- ✅ **Agent Framework**: Microsoft's official Python SDK (richer ecosystem)
- ✅ **LLM integration**: Cleaner async/await patterns for AI calls
- ✅ **Workflow composition**: Graph-based agent orchestration

**Clean Boundary**: Python agents are **stateless HTTP clients** consuming TypeScript MCP servers. No shared memory, no database coupling, full language independence.

---

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  Player Browser (TypeScript/React)                          │
└───────────────┬─────────────────────────────────────────────┘
                │ HTTP POST /player/command
                ↓
┌─────────────────────────────────────────────────────────────┐
│  Azure Function: PlayerCommandHandler (TypeScript)          │
│  - Validate request                                          │
│  - Generate correlation ID                                   │
│  - Rate limiting                                             │
└───────────────┬─────────────────────────────────────────────┘
                │ HTTP POST to Python agent host
                ↓
┌─────────────────────────────────────────────────────────────┐
│  Python Agent Framework Host                                 │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ IntentResolutionAgent (Python)                        │  │
│  │ - Orchestrates MCP tool calls                         │  │
│  │ - Makes AI decisions (promote? validate? escalate?)   │  │
│  └─┬─────────────────────────────────────────────────────┘  │
│    │ MCP Tool Calls (HTTP)                                   │
└────┼─────────────────────────────────────────────────────────┘
     │
     ├─→ GET /mcp/intent-parser ──────┐
     ├─→ GET /mcp/world-context ──────┤
     ├─→ GET /mcp/description-layering│
     ├─→ POST /mcp/world-context/promote
     └─→ POST /mcp/policy-validator ──┘
                                       │
     ┌─────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────────────────────┐
│  Azure Functions: MCP Servers (TypeScript)                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ IntentParser MCP                                     │    │
│  │ - Heuristic parsing (regex, keywords)              │    │
│  │ - Returns ParsedCommand JSON                        │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ WorldContext MCP                                     │    │
│  │ - Queries Cosmos DB (TypeScript repos)             │    │
│  │ - Entity CRUD operations                            │    │
│  │ - Promotion logic                                   │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ DescriptionLayering MCP                              │    │
│  │ - Retrieves/applies layers (Cosmos SQL)            │    │
│  │ - Composition logic                                  │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ PolicyValidator MCP                                  │    │
│  │ - Permission checks                                  │    │
│  │ - Inventory operations                               │    │
│  │ - Business rule validation                           │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                                       │
                                       │ Returns validated intents
                                       ↓
┌─────────────────────────────────────────────────────────────┐
│  Azure Function: PlayerCommandHandler (TypeScript)          │
│  - Receives validated ParsedCommand                          │
│  - Executes intents via existing handlers                    │
│  - Persists changes (Cosmos DB)                              │
│  - Emits telemetry                                           │
│  - Returns narrative response                                │
└───────────────┬─────────────────────────────────────────────┘
                │ HTTP Response
                ↓
┌─────────────────────────────────────────────────────────────┐
│  Player Browser (displays result)                           │
└─────────────────────────────────────────────────────────────┘
```

### File Structure

```
the-shifting-atlas/
├── backend/ (TypeScript)
│   ├── src/
│   │   ├── mcp/
│   │   │   ├── intentParser.ts          ← Parse commands (heuristic)
│   │   │   ├── worldContext.ts          ← Entity CRUD, promotion
│   │   │   ├── descriptionLayering.ts   ← Layer composition
│   │   │   └── policyValidator.ts       ← Permission/validation
│   │   ├── handlers/
│   │   │   ├── playerCommand.ts         ← Entry point, calls Python
│   │   │   ├── moveCore.ts              ← Existing move logic
│   │   │   └── combatHandler.ts         ← Combat execution
│   │   └── repos/
│   │       ├── entityRepository.ts      ← Cosmos DB entities
│   │       └── playerRepository.ts      ← Player state
│   └── package.json
│
├── python-agents/ (Python)                ← NEW: Python Agent Framework
│   ├── agents/
│   │   ├── intent_resolution_agent.py   ← Orchestrates MCP calls
│   │   ├── narrative_agent.py           ← DM persona generation
│   │   └── combat_agent.py              ← Combat decisions
│   ├── workflows/
│   │   ├── action_execution.py          ← Multi-agent workflow
│   │   └── dungeon_encounter.py         ← Complex scenarios
│   ├── mcp_clients/
│   │   └── typescript_mcp.py            ← HTTP client for MCP servers
│   ├── requirements.txt
│   │   # agent-framework
│   │   # azure-ai-inference
│   │   # requests
│   └── host.py                           ← Flask/FastAPI HTTP server
│
├── shared/ (TypeScript)
│   ├── src/
│   │   ├── intent.ts                     ← Shared Intent types (JSON schema)
│   │   ├── direction.ts                  ← Direction enums
│   │   └── telemetry.ts                  ← Event names
│   └── package.json
│
└── frontend/ (TypeScript/React)
    └── src/
        └── api/
            └── playerCommand.ts          ← Calls /player/command
```

---

## Structured ParsedCommand

{
intents: [
{ verb: 'throw', target: 'seagull', object: 'rock', order: 0 },
{ verb: 'move', target: 'seagull', modifiers: ['chase'], order: 1 }
],
ambiguities: [...]
}
↓
[Intent Resolution Agent]
├─ [World Context Server] Check existing entities
├─ [Description Layering Server] Scan for latent objects
├─ [Entity Promotion] Create missing entities
└─ [Policy Validation] Check permissions
↓
Validated Intent Queue
↓
[Action Execution Workflow]
├─ [Combat Agent] (if attack/throw)
├─ [Navigation Agent] (if move/chase)
├─ [Narrative Generator] (DM persona response)
└─ [World State Update] (persist changes)
↓
Player Response

````

---

## Intent Parser MCP Server (TypeScript)

### Server Spec

**Language**: TypeScript (Azure Functions)
**Endpoint**: `/mcp/intent-parser`
**Priority**: P0 - M3
**Dependencies**: World Context Server, Description Layering Server

**Why TypeScript**: MCP servers are HTTP endpoints consuming existing TypeScript repositories, models, and validation logic. No AI decision-making at this layer.

### Operations

| Operation | Description | Example |
|-----------|-------------|---------|
| `parseCommand` | Extract structured intents from raw text | `text="throw rock at seagull"` → Intent[] |
| `validateIntents` | Schema + policy validation | Check verb allowed, targets valid |
| `resolveEntity` | Lookup or promote entity | `name="seagull"` → existing ID or promotion candidate |
| `clarifyAmbiguity` | Generate disambiguation prompt | Multiple targets → "Which seagull?" |
| `scoreConfidence` | Calculate intent confidence | Returns 0-1 score per intent |

### Data Model (TypeScript)

**Intent** (from spec: `docs/modules/player-interaction-and-intents.md`):

**Location**: `shared/src/intent.ts` (shared between backend TypeScript and Python via JSON)

```typescript
interface Intent {
    id: string
    verb: 'move' | 'attack' | 'throw' | 'examine' | 'take' | 'communicate' | 'defend' | 'use_item' | 'flee' | 'interact'
    order: number  // Sequence: 0, 1, 2...
    concurrencyGroup?: string  // Parallel actions at same order

    // Target (entity player is acting on)
    targetEntityId?: string  // Resolved GUID
    surfaceTargetName?: string  // Raw text "seagull" if unresolved

    // Object (item being used)
    objectItemId?: string  // Resolved item GUID
    surfaceItemName?: string  // Raw text "rock" if unresolved

    // Movement
    direction?: Direction  // For move verbs

    // Modifiers
    quantity?: number  // "throw 3 rocks"
    modifiers?: string[]  // ['carefully', 'slowly']
    tacticalRole?: string  // 'distraction', 'pursuit'
    conditions?: string[]  // ['while_defending']

    // Quality
    confidence: number  // 0-1
    issues?: AmbiguityIssue[]
}

interface ParsedCommand {
    rawText: string
    intents: Intent[]
    ambiguities?: AmbiguityIssue[]
    needsClarification: boolean
    parseVersion: string  // "1.0.0"
    playerId: string
    locationId: string
}

interface AmbiguityIssue {
    id: string
    spanText: string  // "rock"
    issueType: 'unknown_entity' | 'unknown_item' | 'ambiguous_direction' | 'multi_interpretation'
    suggestions: string[]
    critical: boolean  // Blocks execution if true
}
````

### Example Parsing Flow (TypeScript MCP Server)

**Input**: `"throw a rock at the seagull and then chase it"`

**Implementation**: `backend/src/mcp/intentParser.ts`

**Step 1: Heuristic Extraction (TypeScript)**

```typescript
// backend/src/mcp/intentParser.ts
export function extractVerbs(text: string): string[] {
    const verbPattern = /\b(throw|attack|move|examine|take|chase|defend|flee)\b/gi
    return text.match(verbPattern) || []
}

export function detectSequence(text: string): 'sequential' | 'parallel' {
    return /\b(and then|then|after)\b/i.test(text) ? 'sequential' : 'parallel'
}

export function extractNouns(text: string): string[] {
    // Simple heuristic: words after articles/prepositions
    const nounPattern = /(?:a|an|the|at)\s+(\w+)/gi
    const matches = []
    let match
    while ((match = nounPattern.exec(text)) !== null) {
        matches.push(match[1])
    }
    return matches
}

const verbs = extractVerbs(text) // ['throw', 'chase']
const sequence = detectSequence(text) // "and then" → sequential
const targets = extractNouns(text) // ['rock', 'seagull']
```

**Step 2: Structure Intents (TypeScript MCP Server)**

```typescript
// backend/src/mcp/intentParser.ts
import { v4 as uuidv4 } from 'uuid'
import type { Intent, ParsedCommand, AmbiguityIssue } from '@piquet-h/shared'

export async function intentParserHandler(req: HttpRequest): Promise<HttpResponseInit> {
    const text = req.query.get('text') || ''
    const playerId = req.query.get('playerId') || ''
    const locationId = req.query.get('locationId') || ''

    const verbs = extractVerbs(text)
    const targets = extractNouns(text)
    const sequence = detectSequence(text)

    const intents: Intent[] = []
    const ambiguities: AmbiguityIssue[] = []

    // Build intent for "throw"
    if (verbs.includes('throw')) {
        const throwIntent: Intent = {
            id: uuidv4(),
            verb: 'throw',
            order: 0,
            surfaceItemName: 'rock', // From targets array
            surfaceTargetName: 'seagull', // From targets array
            confidence: 0.8
        }
        intents.push(throwIntent)

        // Flag ambiguity: rock not in inventory
        ambiguities.push({
            id: 'ambig-rock',
            spanText: 'rock',
            issueType: 'unknown_item',
            suggestions: ['Create improvised weapon', 'Search inventory'],
            critical: false
        })
    }

    // Build intent for "chase"
    if (verbs.includes('chase')) {
        const chaseIntent: Intent = {
            id: uuidv4(),
            verb: 'move', // Chase is a movement modifier
            order: 1,
            surfaceTargetName: 'seagull',
            modifiers: ['chase'],
            tacticalRole: 'pursuit',
            confidence: 0.75
        }
        intents.push(chaseIntent)
    }

    // Flag ambiguity: seagull not an existing entity
    ambiguities.push({
        id: 'ambig-seagull',
        spanText: 'seagull',
        issueType: 'unknown_entity',
        suggestions: ['Promote from description', 'Generic bird'],
        critical: false
    })

    const parsed: ParsedCommand = {
        rawText: text,
        intents,
        ambiguities,
        needsClarification: false, // Non-critical ambiguities ok
        parseVersion: '1.0.0',
        playerId,
        locationId,
        createdAt: new Date().toISOString()
    }

    return {
        status: 200,
        jsonBody: parsed,
        headers: { 'Content-Type': 'application/json' }
    }
}

app.http('McpIntentParser', {
    route: 'mcp/intent-parser',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: intentParserHandler
})
```

**JSON Response** (consumed by Python Agent):

```json
{
    "intents": [
        {
            "id": "intent-1",
            "verb": "throw",
            "order": 0,
            "surfaceItemName": "rock",
            "surfaceTargetName": "seagull",
            "confidence": 0.8
        },
        {
            "id": "intent-2",
            "verb": "move",
            "order": 1,
            "surfaceTargetName": "seagull",
            "modifiers": ["chase"],
            "tacticalRole": "pursuit",
            "confidence": 0.75
        }
    ],
    "ambiguities": [
        {
            "id": "ambig-rock",
            "spanText": "rock",
            "issueType": "unknown_item",
            "suggestions": ["Create improvised weapon", "Search inventory"],
            "critical": false
        },
        {
            "id": "ambig-seagull",
            "spanText": "seagull",
            "issueType": "unknown_entity",
            "suggestions": ["Promote from description", "Generic bird"],
            "critical": false
        }
    ],
    "needsClarification": false // Non-critical ambiguities ok
}
```

**Step 3: Entity Resolution** (Python Agent calls TypeScript MCP servers):

```python
# Python Agent Framework - calls TypeScript MCP servers via HTTP
from agent_framework.mcp import MCPClient

# Initialize MCP clients (point to TypeScript Azure Functions)
world_context_mcp = MCPClient(
    base_url="https://your-app.azurewebsites.net/api/mcp/world-context"
)
desc_layering_mcp = MCPClient(
    base_url="https://your-app.azurewebsites.net/api/mcp/description-layering"
)

# Agent makes tool calls to TypeScript endpoints
async def resolve_entities(parsed_command):
    for intent in parsed_command['intents']:
        if intent.get('surfaceTargetName') and not intent.get('targetEntityId'):
            target_name = intent['surfaceTargetName']

            # Call TypeScript MCP: Check existing entities
            entities_response = await world_context_mcp.call_tool(
                "getLocationContext",
                locationId=parsed_command['locationId']
            )

            existing = [e for e in entities_response['entities']
                       if e['name'].lower() == target_name.lower()]

            if not existing:
                # Call TypeScript MCP: Scan description layers
                desc_response = await desc_layering_mcp.call_tool(
                    "applyLayers",
                    locationId=parsed_command['locationId']
                )

                if target_name in desc_response['composited'].lower():
                    # Call TypeScript MCP: Promote entity
                    promote_response = await world_context_mcp.call_tool(
                        "promoteEntity",
                        name=target_name,
                        type='creature',
                        locationId=parsed_command['locationId'],
                        promotedBy=parsed_command['playerId']
                    )

                    # Update intent with resolved ID
                    intent['targetEntityId'] = promote_response['entityId']

    return parsed_command
```

**Behind the scenes**: The TypeScript MCP server handles the actual database operations:

```typescript
// backend/src/mcp/worldContext.ts (TypeScript)
async function promoteEntityHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const container = context.extraInputs.get('container') as Container

    const name = req.query.get('name')
    const type = req.query.get('type')
    const locationId = req.query.get('locationId')
    const promotedBy = req.query.get('promotedBy')

    // TypeScript handles Cosmos DB persistence
    const entityId = `${name}_${randomSuffix()}`
    const entity = {
        id: entityId,
        type,
        name,
        status: 'active',
        locationId,
        provenance: {
            promotedBy,
            createdUtc: new Date().toISOString()
        }
    }

    // Persist to Cosmos SQL API (TypeScript repositories)
    const entityRepo = container.get<IEntityRepository>('IEntityRepository')
    await entityRepo.create(entity)

    // Emit telemetry (TypeScript)
    const telemetry = container.get<ITelemetryClient>('ITelemetryClient')
    telemetry.track('Entity.Promotion.Created', { entityType: type })

    return {
        status: 200,
        jsonBody: { entityId, promoted: true }
    }
}
```

**Key Point**: Python Agent makes HTTP calls to TypeScript MCP servers. TypeScript owns all database access, validation, and persistence.

**Step 4: Policy Validation (TypeScript MCP Server)**:

```typescript
// backend/src/mcp/policyValidator.ts (TypeScript)
export async function validateIntentsHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const container = context.extraInputs.get('container') as Container
    const body = (await req.json()) as { intents: Intent[]; playerId: string }

    const validatedIntents: Intent[] = []
    const rejections: { intentId: string; reason: string }[] = []

    for (const intent of body.intents) {
        // Validate throw action
        if (intent.verb === 'throw') {
            const playerRepo = container.get<IPlayerRepository>('IPlayerRepository')
            const player = await playerRepo.getById(body.playerId)

            // Check if player has throwable item
            const hasThrowable = player.inventory?.some((i) => i.throwable)

            if (!hasThrowable && !intent.objectItemId) {
                // Create improvised weapon (TypeScript logic)
                const itemRepo = container.get<IItemRepository>('IItemRepository')
                const rock = await itemRepo.createImprovised({
                    name: 'rock',
                    type: 'improvised_weapon',
                    damage: '1d4',
                    range: 20,
                    ownerId: body.playerId
                })

                intent.objectItemId = rock.id
            }
        }

        // Validate target exists (after promotion)
        if (intent.targetEntityId) {
            const entityRepo = container.get<IEntityRepository>('IEntityRepository')
            const target = await entityRepo.getById(intent.targetEntityId)

            if (target && target.type === 'creature') {
                validatedIntents.push(intent)
            } else {
                rejections.push({
                    intentId: intent.id,
                    reason: 'Invalid target type'
                })
            }
        } else {
            validatedIntents.push(intent) // Will be resolved by agent
        }
    }

    return {
        status: 200,
        jsonBody: {
            validated: validatedIntents,
            rejected: rejections
        }
    }
}
```

**Python Agent calls this validator**:

```python
# Python Agent Framework
validation_response = await policy_validator_mcp.call_tool(
    "validateIntents",
    intents=parsed_command['intents'],
    playerId=parsed_command['playerId']
)

validated_intents = validation_response['validated']
# Now execute validated intents
```

---

## Intent Resolution Agent (Agent Framework)

### Agent: `IntentResolutionAgent`

**Purpose**: Orchestrate intent parsing, entity resolution, and validation.

**Tools** (MCP Servers):

- Intent Parser Server (parsing)
- World Context Server (entity lookup)
- Description Layering Server (description scan)
- Navigation Assistant Server (movement validation)
- Lore & Reference Server (creature validation)

**Python Implementation**:

```python
from agent_framework import Agent, ModelClient
from agent_framework.mcp import MCPClient

# Initialize MCP clients
intent_parser_mcp = MCPClient(base_url="https://your-app.azurewebsites.net/api/mcp/intent-parser")
world_context_mcp = MCPClient(base_url="https://your-app.azurewebsites.net/api/mcp/world-context")
desc_layering_mcp = MCPClient(base_url="https://your-app.azurewebsites.net/api/mcp/description-layering")

# Create Intent Resolution Agent
intent_agent = Agent(
    name="IntentResolutionAgent",
    model=ModelClient(model="gpt-4", endpoint="your-azure-openai"),
    tools=[
        intent_parser_mcp.get_tool("parseCommand"),
        intent_parser_mcp.get_tool("resolveEntity"),
        world_context_mcp.get_tool("getLocationContext"),
        desc_layering_mcp.get_tool("applyLayers")
    ],
    instructions="""You are an intent resolution assistant for a D&D text adventure.

    Your job:
    1. Parse player commands into structured intents
    2. Resolve entity references (promote from descriptions if needed)
    3. Validate actions against game rules
    4. Return validated intent queue for execution

    Use tools to:
    - Parse raw text into intents
    - Check if entities exist in world state
    - Scan descriptions for latent objects/creatures
    - Validate movements and actions

    If ambiguities arise, generate clarification prompts."""
)

# Execute
response = await intent_agent.run(
    input={
        "playerText": "throw a rock at the seagull and then chase it",
        "playerId": player_guid,
        "locationId": current_location_id
    }
)

print(response.content)
# Output: Validated ParsedCommand with resolved entities
```

### Full Resolution Flow

```
Player: "throw a rock at the seagull and then chase it"
  ↓
[IntentResolutionAgent]
  [Tool Call 1] intent_parser.parseCommand(text, context)
    → Returns: 2 intents (throw, chase), 2 ambiguities (rock, seagull)
  ↓
  [LLM Decision] Need to resolve "seagull" - check if exists
  ↓
  [Tool Call 2] world_context.getLocationContext(locationId)
    → Returns: Current location, exits, existing entities (none named "seagull")
  ↓
  [LLM Decision] Seagull not found - check description layers
  ↓
  [Tool Call 3] desc_layering.applyLayers(locationId)
    → Returns: "...a seagull perches on the bridge railing..."
  ↓
  [LLM Decision] Found in description - promote to entity
  ↓
  [Tool Call 4] intent_parser.resolveEntity(name="seagull", locationId, promote=true)
    → Returns: { entityId: "seagull_a4f3", type: "creature", promoted: true }
  ↓
  [LLM Decision] Resolve "rock" - check inventory
  ↓
  [Tool Call 5] world_context.getPlayerContext(playerId)
    → Returns: Player inventory (no rocks)
  ↓
  [LLM Decision] No rock in inventory - create improvised weapon
  ↓
  [Tool Call 6] intent_parser.resolveEntity(name="rock", type="improvised_item")
    → Returns: { itemId: "rock_improvised_b2c1", damage: "1d4" }
  ↓
  [LLM Output] Validated ParsedCommand:
  {
    "intents": [
      {
        "verb": "throw",
        "order": 0,
        "objectItemId": "rock_improvised_b2c1",
        "targetEntityId": "seagull_a4f3",
        "confidence": 0.95
      },
      {
        "verb": "move",
        "order": 1,
        "targetEntityId": "seagull_a4f3",
        "modifiers": ["chase"],
        "confidence": 0.85
      }
    ],
    "resolved": true,
    "promotedEntities": ["seagull_a4f3"],
    "createdItems": ["rock_improvised_b2c1"]
  }
  ↓
[Pass to Action Execution Workflow]
```

---

## Action Execution Workflow

### Server-Side Execution with Batched Narrative (Recommended Pattern)

**Architecture Decision**: Execute all intent steps server-side and return complete narrative in a single HTTP response. This provides better latency, cohesive storytelling, and simpler client code compared to client-side orchestration.

**Key Benefits**:

- Single round trip (reduces cumulative latency despite multiple moves)
- AI can generate cohesive narrative for entire journey
- Simpler client implementation (no orchestration logic)
- Better interrupt handling (server knows full context when interrupt occurs)

**Implementation**:

```python
from agent_framework import Workflow

# Build workflow
action_workflow = Workflow(name="ActionExecution")
action_workflow.add_executor("combat", combat_agent)
action_workflow.add_executor("navigation", navigation_agent)
action_workflow.add_executor("narrator", narrative_agent)

# Dynamic routing based on verb
def route_by_verb(state):
    intent = state.current_intent
    if intent.verb in ['attack', 'throw']:
        return 'combat'
    elif intent.verb in ['move', 'flee', 'chase']:
        return 'navigation'
    else:
        return 'narrator'

action_workflow.add_edge("start", "combat", condition=lambda s: route_by_verb(s) == 'combat')
action_workflow.add_edge("start", "navigation", condition=lambda s: route_by_verb(s) == 'navigation')
action_workflow.add_edge("combat", "narrator")
action_workflow.add_edge("navigation", "narrator")

# Execute each intent in sequence server-side
completed_steps = []
interrupt_occurred = None

for intent in parsed_command.intents:
    # Execute intent via deterministic TypeScript handler
    result = await action_workflow.run(input={
        "intent": intent,
        "playerId": player_guid,
        "locationId": location_id
    })

    if not result.success:
        # Intent failed (path blocked, invalid target, etc.)
        interrupt_occurred = {
            "type": "failure",
            "reason": result.error,
            "step": len(completed_steps)
        }
        break

    completed_steps.append(result)

    # Check for interrupts after each step (encounter, event, etc.)
    interrupt = await check_for_interrupt(result.location_id, player_guid)
    if interrupt:
        interrupt_occurred = {
            "type": "interrupt",
            "reason": interrupt.description,
            "step": len(completed_steps)
        }
        break

# Generate unified narrative for what actually happened
narrative = await narrative_agent.generate_journey_narrative({
    "intents": parsed_command.intents,
    "completed_steps": completed_steps,
    "interrupt": interrupt_occurred,
    "player_id": player_guid
})

# Return everything in single response
return {
    "success": interrupt_occurred is None,
    "narrative": narrative,  # Full story up to interrupt point
    "completed_steps": len(completed_steps),
    "total_steps": len(parsed_command.intents),
    "current_location": completed_steps[-1].location if completed_steps else None,
    "interrupt": interrupt_occurred,
    "latency_ms": elapsed_time
}
```

**Example Output** (with DM persona narration):

```
You scoop up a loose stone—hardly a weapon, but desperate times and all that.
With surprising accuracy (or perhaps the seagull's overconfidence), you hurl
the rock. It connects with an indignant squawk!

The seagull takes wing, clearly reconsidering its life choices. You give
chase across the bridge, but the bird has gravity on its side. It vanishes
over the rooftops, leaving you slightly winded and questioning your grudge
against local wildlife.

The bridge stretches north toward the lighthouse and south toward the market
square. The ocean mutters beneath you, probably gossiping about tourists.
```

### Interrupt Handling for Multi-Step Intents

**Problem**: Player issues multi-step command (`"walk to the shrine"`), but encounters interrupt on second move (encounter, blocked path, world event).

**Solution**: Execute one step at a time with checkpoint pattern:

```typescript
// TypeScript backend handler
async function executeIntentSequence(intents: Intent[], playerId: string): Promise<ExecutionResult> {
    const completed: MoveResult[] = []

    for (const [index, intent] of intents.entries()) {
        // Each move persists immediately (atomic transaction)
        const moveResult = await moveHandler.performMove({
            direction: intent.direction,
            playerId
        })

        if (!moveResult.success) {
            // Move failed (path blocked)
            return {
                status: 'failed',
                completed_steps: completed,
                current_location: moveResult.currentLocation,
                interrupt: {
                    type: 'path-blocked',
                    description: moveResult.error
                }
            }
        }

        completed.push(moveResult)

        // Check for encounters AFTER successful move
        const encounter = await checkForEncounter(moveResult.location.id, playerId)
        if (encounter) {
            return {
                status: 'interrupted',
                completed_steps: completed,
                current_location: moveResult.location,
                interrupt: {
                    type: 'encounter',
                    description: encounter.description,
                    encounter_id: encounter.id
                }
            }
        }
    }

    return {
        status: 'completed',
        completed_steps: completed,
        current_location: completed[completed.length - 1].location
    }
}
```

**Key Properties**:

- **Atomic steps**: Each move succeeds or fails independently
- **Immediate persistence**: Player location updated after each successful move
- **Interrupt detection**: Between steps (never during)
- **Consistent state**: Player location always reflects reality (no partial commits)

**Narrative Generation for Interrupted Journeys**:

```typescript
// Generate cohesive narrative knowing what actually happened
async function narrateJourney(execution: ExecutionResult): Promise<string> {
    const context = {
        intent_description: 'walk to the shrine',
        completed_steps: execution.completed_steps.length,
        total_steps: execution.planned_steps,
        interrupted: execution.status === 'interrupted',
        interrupt_type: execution.interrupt?.type
    }

    return await narrativeAgent.generate({
        template: 'journey-narrative',
        context
    })
}

// Example interrupted narrative:
// "You make your way north along the packed lane, passing villagers heading
//  to market. As you turn west toward the stone circle, you notice fresh
//  tracks in the dirt—and suddenly a wolf steps onto the path ahead, blocking
//  your way."
```

**Resumable State** (Future enhancement):

Store incomplete intent sequences for resumption after interrupt resolution:

```typescript
interface IntentState {
  intent_id: string
  player_id: string
  original_utterance: string
  remaining_steps: Intent[]
  completed_steps: MoveResult[]
  expires_at: Date  // TTL: 5 minutes
}

// After player resolves encounter:
POST /api/intent/resume
{
  "intent_id": "intent-123",
  "action": "continue"  // or "abort"
}
```

---

## Implementation Approach

### Phased Strategy

The intent parser can be implemented incrementally with three parsing strategies that provide progressively richer capabilities:

**PI-0: Heuristic Baseline**

- Regex-based verb extraction
- Keyword-based sequence detection
- Simple noun identification after articles/prepositions
- No AI/LLM dependency
- Handles single-verb and sequential commands: `"throw rock"`, `"move north and look"`

**PI-1: Local LLM Enhancement**

- Client-side small language model (Llama 3.2 1B, Phi-3, or similar)
- **Implementation**: `@mlc-ai/web-llm` package (WebGPU-accelerated browser inference)
- Grammar-constrained JSON extraction via `response_format: { type: "json_object" }`
- Confidence scoring per intent
- Entity promotion integration
- Handles complex multi-step commands: `"throw a rock at the seagull and chase it"`
- Target latency: <350ms (warm model)
- **Browser Requirements**: Chrome 113+, Edge 113+, Safari 18+ (WebGPU)
- **Progressive Enhancement**: Falls back to PI-0 if WebGPU unavailable

**Technical Notes (PI-1)**:

- Model download: ~650MB (Llama-3.2-1B-Instruct), cached after first load
- Zero server cost, zero API calls
- OpenAI-compatible API for seamless integration
- See issue #463 for full implementation details

**PI-2: Server Escalation**

- Azure OpenAI for ambiguous/complex commands
- Semantic alias expansion (`"bird"` → `"seagull"`)
- Interactive clarification prompts
- Escalation triggered by: low confidence (<0.55), high complexity (>8 intents), critical ambiguities
- Target escalation rate: <15% of commands
- Target latency: <1.5s

**Rationale**: This progression allows deployment without AI infrastructure (PI-0), then adds client-side intelligence (PI-1) before committing to server-side LLM costs (PI-2). Each phase is independently valuable.

---

## Integration with Existing Systems

### Current Move Handler (`moveCore.ts`)

**Before**:

```typescript
const rawDir = req.query.get('dir') || req.query.get('direction')
const normalizationResult = normalizeDirection(rawDir, lastHeading)
```

**After** (with Intent Parser):

```typescript
const rawText = req.query.get('command') || req.query.get('dir')

if (isSimpleDirection(rawText)) {
    // Fast path: simple move command
    const normalizationResult = normalizeDirection(rawText, lastHeading)
    // ... existing logic
} else {
    // Complex command: route to Intent Parser
    const parsedCommand = await intentParser.parseCommand({
        text: rawText,
        playerId,
        locationId: fromId
    })

    // Execute intents via workflow
    return await actionWorkflow.execute(parsedCommand)
}
```

### Entity Promotion Hook

```typescript
// When intent references unknown entity
if (intent.surfaceTargetName && !intent.targetEntityId) {
    // Check description layers
    const layers = await descriptionLayering.applyLayers(locationId)
    const hasEntity = layers.includes(intent.surfaceTargetName)

    if (hasEntity && eligibleForPromotion(intent.verb)) {
        // Promote from latent to persistent
        const entity = await entityPromotion.promote({
            name: intent.surfaceTargetName,
            type: classifyFromContext(layers, intent.surfaceTargetName),
            locationId,
            sourceHash: hash(layers),
            promotedBy: playerId
        })

        intent.targetEntityId = entity.id
        telemetry.track('Entity.Promotion.Created', {
            entityType: entity.type,
            trigger: intent.verb
        })
    }
}
```

---

## Telemetry Events

Add to `shared/src/telemetry.ts`:

```typescript
export const TelemetryEvents = {
    // ... existing events

    // Intent Parsing
    'PlayerCommand.Received': 'PlayerCommand.Received',
    'PlayerCommand.ParseSucceeded': 'PlayerCommand.ParseSucceeded',
    'PlayerCommand.ParseFailed': 'PlayerCommand.ParseFailed',
    'PlayerCommand.AmbiguityDetected': 'PlayerCommand.AmbiguityDetected',
    'PlayerCommand.ClarificationPrompted': 'PlayerCommand.ClarificationPrompted',
    'PlayerCommand.IntentFiltered': 'PlayerCommand.IntentFiltered',
    'PlayerCommand.Escalated': 'PlayerCommand.Escalated',

    // Entity Promotion
    'Entity.Promotion.Created': 'Entity.Promotion.Created',
    'Entity.Promotion.Rejected': 'Entity.Promotion.Rejected',
    'Entity.Promotion.AlreadyExists': 'Entity.Promotion.AlreadyExists'
} as const
```

---

## Testing Strategy

### Unit Tests (Intent Parser MCP)

```typescript
describe('Intent Parser', () => {
    it('parses simple throw command', async () => {
        const result = await intentParser.parseCommand({
            text: 'throw rock',
            playerId: 'test',
            locationId: 'loc-1'
        })

        expect(result.intents).toHaveLength(1)
        expect(result.intents[0].verb).toBe('throw')
        expect(result.intents[0].surfaceItemName).toBe('rock')
    })

    it('parses sequential commands', async () => {
        const result = await intentParser.parseCommand({
            text: 'throw rock at seagull and then chase it',
            playerId: 'test',
            locationId: 'loc-1'
        })

        expect(result.intents).toHaveLength(2)
        expect(result.intents[0].order).toBe(0)
        expect(result.intents[1].order).toBe(1)
    })

    it('detects ambiguities', async () => {
        const result = await intentParser.parseCommand({
            text: 'attack goblin', // Multiple goblins present
            playerId: 'test',
            locationId: 'loc-1'
        })

        expect(result.needsClarification).toBe(true)
        expect(result.ambiguities).toHaveLength(1)
        expect(result.ambiguities[0].issueType).toBe('multi_interpretation')
    })
})
```

### Integration Tests (Agent + MCP)

```python
@pytest.mark.asyncio
async def test_intent_resolution_with_entity_promotion():
    # Setup: location with seagull in description
    location_id = "bridge-1"
    setup_location_description(location_id, "A seagull perches on the railing.")

    # Execute
    agent = IntentResolutionAgent(...)
    result = await agent.run({
        "playerText": "throw rock at seagull",
        "playerId": "player-1",
        "locationId": location_id
    })

    # Assert
    assert len(result.intents) == 1
    assert result.intents[0].targetEntityId is not None  # Entity promoted
    assert result.promotedEntities == ["seagull_*"]
    assert "rock_improvised_*" in result.createdItems
```

---

## Cost & Performance Targets

### Token Usage Estimates

| Strategy                 | Tokens/Command | Cost (GPT-4o) | Notes                         |
| ------------------------ | -------------- | ------------- | ----------------------------- |
| PI-0 (Heuristic)         | 0              | $0            | Pure regex/keyword parsing    |
| PI-1 (Local LLM)         | ~200 (local)   | $0            | Browser-based, no server cost |
| PI-2 (Server escalation) | ~500           | ~$0.0015 avg  | 15% escalation rate assumed   |

**Cost Optimization**: Design intent parser to handle >85% of commands with PI-0/PI-1 (free), escalating only complex/ambiguous commands to server LLM.

**WAF Alignment**: Cost Optimization pillar - minimize cloud spend by maximizing client-side/heuristic parsing.

### Latency Targets

| Strategy          | Target Latency | Implementation Notes                             |
| ----------------- | -------------- | ------------------------------------------------ |
| PI-0 (Heuristic)  | <50ms          | Regex + keyword rules, synchronous               |
| PI-1 (Local LLM)  | <350ms         | Browser-based Llama 3.2 1B, warm model           |
| PI-2 (Server LLM) | <1500ms        | Azure OpenAI GPT-4o, includes network round-trip |

**Performance Optimization**: Fast-path simple commands through PI-0 to maintain low p50 latency; acceptable p95/p99 latency increase for complex commands.

**WAF Alignment**: Performance Efficiency pillar - optimize for common case (simple movement), acceptable degradation for edge cases (complex multi-step commands).

---

## Security & Safety

### Input Validation

**Threat Model**: Malicious player inputs attempting injection, abuse, or exploitation.

**Mitigations**:

```typescript
// Max command length
const MAX_COMMAND_LENGTH = 500 // chars

// Offensive content filter
const blockedPatterns = [/explicit|offensive|pattern/i]

function validatePlayerCommand(text: string): ValidationResult {
    if (text.length > MAX_COMMAND_LENGTH) {
        return { valid: false, reason: 'Command too long' }
    }

    if (blockedPatterns.some((p) => p.test(text))) {
        telemetry.track('PlayerCommand.FilteredOffensive', { playerId })
        return { valid: false, reason: 'Content filtered' }
    }

    return { valid: true }
}
```

**WAF Alignment**: Security pillar - defense in depth (input validation), reliability pillar (prevent DoS via large inputs).

### Rate Limiting

**Pattern**: Per-player command throttling to prevent abuse.

```typescript
// Max 10 commands per minute per player
rateLimiters.intentParsing = new RateLimiter({
    windowMs: 60_000,
    max: 10,
    scope: 'player'
})
```

**Rationale**: Prevents both malicious abuse and accidental client-side bugs from overwhelming backend.

**WAF Alignment**: Reliability pillar (protect service availability), cost optimization (prevent runaway LLM costs).

### Entity Promotion Safety

**Risk**: Players could pollute world state by promoting arbitrary entities from descriptions.

**Mitigation**:

- Eligible verbs only: `take`, `grab`, `pick`, `attack`, `throw`, `examine`
- Validation: Entity must exist in current location's description layers
- Provenance tracking: Record promotion source (description hash, player ID, timestamp)
- Audit trail: All promotions logged for review

**Tenet Alignment**: "Explicit over implicit" - all entity promotions traceable to source description.

---

**Document Version**: 1.0  
**Last Updated**: 2025-11-08  
**Status**: ARCHITECTURE SPECIFICATION  
**Layer**: Architecture (30k ft) - Technical design implementing gameplay modules  
**Related**:

- Design Modules: `docs/modules/player-interaction-and-intents.md`, `docs/modules/entity-promotion.md`
- Architecture: `docs/architecture/dnd-5e-agent-framework-integration.md`
- Tenets: `docs/tenets.md` (Explicit over implicit, Build for observability)

**Key Technologies**:

- **WebLLM** (`@mlc-ai/web-llm`): Client-side LLM inference for PI-1
    - Docs: https://webllm.mlc.ai/docs/
    - NPM: https://www.npmjs.com/package/@mlc-ai/web-llm
    - Implementation: See issue #463
- **Microsoft Agent Framework**: Server-side agent orchestration for PI-2
- **Azure OpenAI**: Escalation path for complex/ambiguous intents
