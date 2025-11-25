# World Spatial Generation Architecture

Technical implementation of AI-driven world expansion with batched description generation and deterministic exit inference.

**Parent Design Module**: [World Spatial Generation](../modules/world-spatial-generation.md)  
**Status**: Planned (M4 Layering & Enrichment)

---

## Overview

This architecture enables organic world growth through:

1. **Eager generation**: Create location clusters (root + neighbors) in single batch operation
2. **Batched AI calls**: Minimize latency and API cost via parallel description generation
3. **Exit inference**: Extract topology from prose using AI semantic analysis
4. **Event-driven coordination**: World.Location.BatchGenerate → AI generation → World.Exit.Create cascade

---

## System Components

### 1. Batch Generation Handler

**Trigger**: `World.Location.BatchGenerate` event  
**Responsibilities**:

-   Determine neighbor directions based on terrain guidance
-   Create stub location entities
-   Orchestrate batched AI description generation
-   Enqueue exit creation events
-   Apply exit inference to neighbor descriptions

**Implementation**: `backend/src/worldEvents/handlers/BatchGenerateHandler.ts`

```typescript
@injectable()
export class BatchGenerateHandler implements IWorldEventHandler {
    public readonly type = 'World.Location.BatchGenerate'

    constructor(
        @inject('ILocationRepository') private locationRepo: ILocationRepository,
        @inject('IAIDescriptionService') private aiService: IAIDescriptionService,
        @inject('IExitInferenceService') private exitInference: IExitInferenceService,
        @inject('IWorldEventPublisher') private eventPublisher: IWorldEventPublisher,
        @inject(TelemetryService) private telemetry: TelemetryService
    ) {}

    async handle(event: WorldEventEnvelope, context: InvocationContext): Promise<WorldEventHandlerResult> {
        const { rootLocationId, arrivalDirection, terrain, expansionDepth, batchSize } = event.payload

        // 1. Determine neighbor directions from terrain guidance
        const neighborDirections = this.determineNeighborDirections(terrain, arrivalDirection, batchSize)

        // 2. Create stub locations
        const stubs = await this.createStubLocations(neighborDirections, terrain)

        // 3. Prepare batch AI request
        const batchRequest = this.prepareBatchRequest(rootLocationId, stubs, terrain, arrivalDirection)

        // 4. Call AI service (single batched request)
        const descriptions = await this.aiService.batchGenerateDescriptions(batchRequest)

        // 5. Update locations with descriptions
        await this.updateLocationDescriptions(descriptions)

        // 6. Enqueue exit creation events (root ↔ neighbors)
        await this.enqueueExitCreationEvents(rootLocationId, stubs, neighborDirections)

        // 7. Infer onward exits from neighbor descriptions
        if (expansionDepth > 1) {
            await this.inferAndCreateOnwardExits(descriptions, terrain)
        }

        this.telemetry.trackGameEvent('World.BatchGeneration.Completed', {
            rootLocationId,
            locationsGenerated: descriptions.length,
            exitsCreated: stubs.length * 2, // bidirectional
            aiCost: descriptions.reduce((sum, d) => sum + d.cost, 0)
        })

        return { outcome: 'success', details: `Generated ${descriptions.length} locations` }
    }
}
```

### 2. AI Description Service

**Interface**: `IAIDescriptionService`  
**Responsibilities**:

-   Accept batch location requests
-   Generate contextual descriptions via AI API
-   Track per-request cost and latency
-   Handle rate limiting and retries

**Implementation**: `backend/src/services/AIDescriptionService.ts`

```typescript
interface BatchDescriptionRequest {
    locations: Array<{
        locationId: string
        terrain: TerrainType
        arrivalDirection: Direction
        neighbors: Direction[] // exits that should be mentioned
        adjacentSettlement?: string
        narrativeContext?: {
            weather?: string
            time?: string
            recentEvents?: string
        }
    }>
    style: 'concise' | 'atmospheric' | 'utilitarian'
}

interface GeneratedDescription {
    locationId: string
    description: string
    cost: number // USD
    tokensUsed: number
    model: string
}

@injectable()
export class AIDescriptionService implements IAIDescriptionService {
    async batchGenerateDescriptions(request: BatchDescriptionRequest): Promise<GeneratedDescription[]> {
        // 1. Build system prompt with style guidance
        const systemPrompt = this.buildSystemPrompt(request.style)

        // 2. Build individual prompts for each location
        const prompts = request.locations.map((loc) => this.buildLocationPrompt(loc))

        // 3. Call AI API (e.g., Azure OpenAI batch completion)
        const response = await this.aiClient.createBatchCompletion({
            model: 'gpt-4',
            system: systemPrompt,
            prompts,
            temperature: 0.7,
            maxTokens: 200 // ~50-70 words per description
        })

        // 4. Parse and validate responses
        return response.choices.map((choice, idx) => ({
            locationId: request.locations[idx].locationId,
            description: choice.message.content,
            cost: this.calculateCost(choice.usage),
            tokensUsed: choice.usage.total_tokens,
            model: response.model
        }))
    }

    private buildLocationPrompt(loc: LocationDescriptionParams): string {
        return `Describe a ${loc.terrain} location in a fantasy world.
Player arrives from ${loc.arrivalDirection}.
Exits should exist toward: ${loc.neighbors.join(', ')}.
${loc.adjacentSettlement ? `Nearby settlement: ${loc.adjacentSettlement}` : ''}
${loc.narrativeContext?.weather ? `Weather: ${loc.narrativeContext.weather}` : ''}

Requirements:
- 2-3 sentences, atmospheric and concise
- Mention each exit direction naturally (e.g., "To the east, a creek...")
- Justify spatial affordances (why can player go that direction?)
- No mechanics or stats, pure narrative

Example: "Windswept moorland stretches endlessly beneath vast sky. To the south, Mosswell's timber gate is visible through the haze. Eastward, a creek cuts through the heath. West, dark forest marks the wilderness edge."
`
    }
}
```

### 3. Exit Inference Service

**Interface**: `IExitInferenceService`  
**Responsibilities**:

-   Parse location description text
-   Identify directional references (explicit, implied, blocked)
-   Return confidence-scored exit candidates
-   Provide reasoning for curator review

**Implementation**: `backend/src/services/ExitInferenceService.ts`

```typescript
interface ExitInferenceResult {
    direction: Direction
    confidence: number // 0.0-1.0
    reason: string
    targetHint?: string // "creek crossing", "forest edge"
}

@injectable()
export class ExitInferenceService implements IExitInferenceService {
    async inferExits(description: string, terrain: TerrainType, arrivalDirection: Direction): Promise<ExitInferenceResult[]> {
        // Option A: Rule-based pattern matching (cheap, deterministic)
        const patterns = this.getDirectionPatterns()
        const matches = this.matchPatterns(description, patterns)

        // Option B: AI semantic analysis (expensive, contextual)
        // Use for ambiguous cases or validation
        const aiInferred = await this.aiClient.inferSpatialLogic({
            description,
            terrain,
            arrivalDirection
        })

        // Merge results: prefer explicit mentions (pattern-based),
        // use AI for implied exits
        return this.mergeInferences(matches, aiInferred, arrivalDirection)
    }

    private getDirectionPatterns(): Map<Direction, RegExp[]> {
        return new Map([
            ['north', [/\b(?:to the )?north(?:ward)?[,\s]/i, /\bnorthern\s+\w+/i, /\brises?\s+(?:to the )?north/i]],
            ['east', [/\b(?:to the )?east(?:ward)?[,\s]/i, /\beastern\s+\w+/i, /\ba\s+\w+\s+(?:cuts|runs)\s+(?:to the )?east/i]]
            // ... other directions
        ])
    }

    private matchPatterns(description: string, patterns: Map<Direction, RegExp[]>): ExitInferenceResult[] {
        const results: ExitInferenceResult[] = []

        for (const [direction, regexes] of patterns) {
            for (const regex of regexes) {
                const match = description.match(regex)
                if (match) {
                    results.push({
                        direction,
                        confidence: 0.9, // High confidence for explicit mentions
                        reason: `Explicit mention: "${match[0].trim()}"`,
                        targetHint: this.extractTargetHint(description, match.index!)
                    })
                    break // Only one match per direction
                }
            }
        }

        return results
    }
}
```

### 4. World Event Publisher

**Interface**: `IWorldEventPublisher`  
**Responsibilities**:

-   Enqueue world events to Azure Service Bus
-   Handle correlation IDs for cascading events
-   Batch enqueue for efficiency

**Implementation**: Uses existing `ServiceBusClient` infrastructure

```typescript
async enqueueExitCreationEvents(
  rootLocationId: string,
  neighbors: StubLocation[],
  directions: Direction[]
): Promise<void> {
  const events = neighbors.map((neighbor, idx) => ({
    eventId: uuidv4(),
    type: 'World.Exit.Create',
    occurredUtc: new Date().toISOString(),
    actor: { kind: 'system' },
    correlationId: this.correlationId,  // From parent BatchGenerate event
    idempotencyKey: `exit:${rootLocationId}:${directions[idx]}`,
    version: 1,
    payload: {
      fromLocationId: rootLocationId,
      toLocationId: neighbor.id,
      direction: directions[idx],
      reciprocal: true,
      description: `Toward ${neighbor.name}`
    }
  }))

  await this.serviceBusClient.sendBatch(events)
}
```

---

## Data Flow

### Sequence: Player Triggers Boundary Expansion

```
1. Player → HTTP Move Handler
   └─ "move north" from North Gate (no exit exists)

2. HTTP Handler → Create stub location
   └─ Location { id: NEW_UUID, name: "Northern Moorland", description: "" }

3. HTTP Handler → Enqueue World.Exit.Create
   └─ Payload: { fromLocationId: GATE_ID, toLocationId: NEW_UUID, direction: 'north' }

4. HTTP Handler → Enqueue World.Location.BatchGenerate
   └─ Payload: { rootLocationId: NEW_UUID, arrivalDirection: 'south', terrain: 'open-plain', depth: 1 }

5. HTTP Handler → Return to player
   └─ "You head north into unmapped wilderness..."

--- Async Processing Below ---

6. ExitCreateHandler (queue trigger) → Creates bidirectional exit
   └─ Gate ↔ Moorland (north/south pair)

7. BatchGenerateHandler (queue trigger) → Generates descriptions
   a. Determine neighbors (4 cardinals for open-plain)
   b. Create 4 stub locations (North Moor, East Moor, West Moor, + root)
   c. Call AI batch API (5 descriptions in single request)
   d. Update locations with descriptions
   e. Enqueue 4 × World.Exit.Create (root → each neighbor, bidirectional)
   f. Infer exits from neighbor descriptions
   g. Enqueue onward exits (neighbor → new stubs)

8. ExitCreateHandler (4 more invocations) → Creates 8 exits (4 bidirectional pairs)

9. Player's next "look" command → Sees new exits rendered
```

### Cost Calculation

**Without batching** (sequential):

-   5 locations × 1 API call each = 5 calls × $0.002 = **$0.01**
-   Total latency: ~5 seconds (sequential)

**With batching**:

-   1 API call with 5 prompts = $0.001/location × 5 = **$0.005**
-   Total latency: ~1 second (parallel)
-   **50% cost reduction, 80% latency reduction**

---

## Persistence Schema

### Location Document (Cosmos SQL API)

```typescript
interface Location {
    id: string // GUID
    name: string
    description: string // AI-generated or authored
    terrain: TerrainType
    tags: string[]
    exits: Exit[] // Materialized view (authoritative in Gremlin graph)
    metadata: {
        generatedUtc?: string
        generationCorrelationId?: string
        aiModel?: string
        aiCost?: number
        inferredExitCount?: number
    }
    version: number
}
```

### Exit Edge (Gremlin Graph)

```gremlin
// Bidirectional edge creation
g.V(rootLocationId)
  .addE('exit_north')
  .to(g.V(neighborId))
  .property('description', 'Toward rolling hills')
  .property('createdUtc', NOW)
  .property('reciprocal', true)
```

### World Event Record (Cosmos SQL API)

```typescript
interface BatchGenerateEvent {
    eventId: string
    type: 'World.Location.BatchGenerate'
    payload: {
        rootLocationId: string
        arrivalDirection: Direction
        terrain: TerrainType
        expansionDepth: number
        batchSize: number
    }
    metadata: {
        locationsGenerated: number
        exitsCreated: number
        aiCost: number
        durationMs: number
    }
}
```

---

## Configuration

### Environment Variables

```bash
# AI Service
AI_ENDPOINT=https://<resource>.openai.azure.com/
AI_API_KEY_SECRET_NAME=openai-api-key  # Key Vault reference
AI_MODEL=gpt-4
AI_MAX_TOKENS=200
AI_TEMPERATURE=0.7

# Batch Generation Limits
BATCH_GENERATION_MAX_SIZE=20
BATCH_GENERATION_MAX_DEPTH=2
BATCH_GENERATION_RATE_LIMIT_DELAY_MS=5000

# Cost Tracking
AI_COST_PER_1K_TOKENS=0.03  # GPT-4 pricing
AI_COST_ALERT_THRESHOLD=10.00  # Daily USD threshold
```

### Terrain Guidance Configuration

```typescript
// shared/src/config/terrainGuidance.ts
export const TERRAIN_GUIDANCE: Record<TerrainType, TerrainGuidanceConfig> = {
    'open-plain': {
        typicalExitCount: 4,
        exitPattern: 'cardinal',
        promptHint: 'Open plains typically allow travel in multiple directions unless narrative obstacles are present.',
        defaultDirections: ['north', 'south', 'east', 'west']
    },
    'dense-forest': {
        typicalExitCount: 2,
        exitPattern: 'linear',
        promptHint: 'Dense forests may limit visible exits to clearings or paths.',
        defaultDirections: [] // AI must justify all exits
    }
    // ... other terrain types
}
```

---

## Telemetry Events

### World.BatchGeneration.Started

**Properties**: `rootLocationId`, `terrain`, `expansionDepth`, `batchSize`  
**Timing**: Before AI API call

### World.BatchGeneration.Completed

**Properties**: `rootLocationId`, `locationsGenerated`, `exitsCreated`, `aiCost`, `durationMs`  
**Timing**: After all exits enqueued

### World.BatchGeneration.Failed

**Properties**: `rootLocationId`, `errorMessage`, `partialResults`  
**Timing**: On exception

### AI.Description.BatchGenerated

**Properties**: `requestCount`, `totalTokens`, `totalCost`, `model`, `avgLatencyMs`  
**Timing**: After AI API response

### World.Exit.Inferred

**Properties**: `locationId`, `direction`, `confidence`, `method` (pattern | ai)  
**Timing**: Per inferred exit

---

## Error Handling

### AI API Failure

**Transient errors** (rate limit, timeout):

-   Retry with exponential backoff (3 attempts)
-   If all fail: log error, dead-letter the BatchGenerate event
-   Player sees: "Generating wilderness description..." (async completion notification later)

**Persistent errors** (invalid response, safety filter):

-   Fall back to template-based descriptions
-   Emit telemetry: `AI.Description.Fallback`
-   Curator review queue flagged

### Exit Inference Ambiguity

If AI inference returns 0 exits or contradictory results:

-   Fall back to terrain guidance defaults
-   Emit warning telemetry: `World.Exit.InferenceAmbiguous`
-   Create exits with low confidence markers for curator review

### Stub Location Orphans

If BatchGenerate fails after creating stubs but before generating descriptions:

-   Background cleanup job identifies stubs with empty descriptions >1 hour old
-   Delete orphaned stubs or trigger retry of BatchGenerate event

---

## Performance Considerations

### Batch Size Tuning

| Terrain        | Typical Neighbors | Max Batch Size | Rationale                       |
| -------------- | ----------------- | -------------- | ------------------------------- |
| Open Plain     | 4                 | 9              | 1 root + 4 neighbors + 4 onward |
| Dense Forest   | 2                 | 5              | 1 root + 2 neighbors + 2 onward |
| Hilltop        | 5 (4 + down)      | 11             | 1 root + 5 neighbors + 5 onward |
| River Corridor | 3                 | 7              | 1 root + 3 neighbors + 3 onward |

### RU Budget (Cosmos DB)

**Writes** (per batch generation):

-   5 location upserts × 10 RU = 50 RU
-   8 exit edge creates × 15 RU = 120 RU
-   **Total: ~170 RU** per batch (within p95 target of 200 RU)

**Reads** (during inference):

-   Pattern matching: 0 RU (in-memory regex)
-   AI analysis: External API (no Cosmos reads)

### Latency Budget

| Operation          | Target Latency | Notes                           |
| ------------------ | -------------- | ------------------------------- |
| Stub creation      | <50ms          | SQL upserts, no graph traversal |
| AI batch call      | <2s            | Azure OpenAI regional endpoint  |
| Exit enqueue       | <100ms         | Service Bus batch send          |
| Total (async path) | <3s            | Player sees result on next look |

---

## Testing Strategy

### Unit Tests

-   `BatchGenerateHandler`: Mock AI service, verify correct neighbor count calculation
-   `ExitInferenceService`: Test pattern matching with known descriptions
-   `AIDescriptionService`: Mock AI API, verify prompt construction

### Integration Tests

-   End-to-end batch generation with memory-based repositories
-   Verify cascading exit creation events
-   Cost tracking and telemetry emission

### E2E Tests (Manual / Smoke)

-   Trigger expansion from North Gate
-   Verify all locations navigable within 5 seconds
-   Inspect AI-generated descriptions for quality
-   Check Cosmos graph structure (bidirectional exits)

---

## Security & Cost Controls

### API Key Management

-   Store Azure OpenAI key in Key Vault
-   Rotate quarterly (automated via Bicep)
-   Use Managed Identity where possible (Azure Functions → Key Vault)

### Cost Monitoring

-   Daily cost alert threshold: $10 USD
-   Per-request cost tracking in telemetry
-   Anomaly detection: >$1 per batch triggers alert

### Rate Limiting

-   Max 10 batch generations per minute per player (anti-abuse)
-   System-wide: Max 100 concurrent AI requests
-   Exponential backoff on 429 responses

---

## Related Documentation

-   **Design Module**: [World Spatial Generation](../modules/world-spatial-generation.md)
-   **ADR**: (TBD: ADR for AI API selection and batching strategy)
-   **Tenet #7**: Narrative Consistency (AI-driven spatial logic)
-   **Concept**: [Exits](../concept/exits.md), [Direction Resolution](../concept/direction-resolution-rules.md)
-   **Issue #258**: World Event Type-Specific Payload Handlers (ExitCreateHandler foundation)

---

_Last updated: 2025-11-25 (initial creation)_
