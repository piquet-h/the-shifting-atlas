# Hero Prose Blocking Policy

> **Status**: ACTIVE (2026-02-05)  
> **Purpose**: Define the allowed exception to the non-blocking AI rule for first-look hero prose generation  
> **Scope**: Perception actions (`look`, `examine`) with cache-miss only

## Summary

Hero prose generation is the **sole exception** to the strict non-blocking AI rule. Bounded blocking (≤1200ms default) is permitted **only** when all of the following conditions are met:

1. **Perception action only**: `look` or `examine` (not movement, combat, or mutating actions)
2. **Cache miss**: No existing hero prose layer for the location
3. **No pending canonical writes**: The HTTP response has no other state mutations planned (e.g., no `exitsSummaryCache` write)
4. **Fallback guaranteed**: Timeout/error/invalid response always returns base description safely

This policy balances immersion (rich first-look prose) with performance (p95 latency target <500ms for typical operations) and reliability (always responds, never blocks indefinitely).

## Goals

- **Immersion**: Enhance first-look location descriptions with AI-generated atmospheric prose
- **Performance**: Maintain p95 latency <500ms for typical player actions (including cached hero prose)
- **Reliability**: Always respond within timeout budget; degrade gracefully on AI failures
- **Cost control**: Cache-first strategy minimizes AI API calls (one generation per location maximum)
- **Predictability**: Deterministic fallback behavior; players never see hanging requests

## When Blocking is Allowed

### Permitted Conditions (ALL must be true)

| Condition | Requirement | Rationale |
|-----------|-------------|-----------|
| **Action Type** | Perception only (`look`, `examine`) | Player expects richer narration for perception; not time-critical |
| **Cache Status** | Cache miss (no existing hero prose layer) | Blocking only needed once per location; all future requests hit cache |
| **State Mutations** | No pending canonical writes in HTTP handler | Avoid blocking on dual concerns (state update + AI generation) |
| **Timeout Budget** | Configurable, defaults to 1200ms | Hard cap ensures graceful degradation on slow AI responses |

### Implementation Check (locationLook.ts)

```typescript
// Attempt hero prose generation ONLY when no canonical writes are planned
// Bounded blocking is allowed only for perception actions with no pending canonical writes.
// When canonical writes are planned, skip generation and use safe fallback (baseline description).
if (!canonicalWritesPlanned) {
    try {
        const configuredTimeoutMs = Number.parseInt(process.env.HERO_PROSE_TIMEOUT_MS ?? '1200', 10)
        const timeoutMs = Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0 
            ? configuredTimeoutMs 
            : 1200
        await this.heroProseGenerator.generateHeroProse({
            locationId: id,
            locationName: loc.name,
            baseDescription: loc.description,
            timeoutMs
        })
    } catch {
        // Generation errors don't block the response - fall back to base description
        // Telemetry already emitted by HeroProseGenerator
    }
}
```

**Key Insight**: The `canonicalWritesPlanned` flag is derived from whether `loc.exitsSummaryCache` exists. If missing, the handler plans a synchronous write to cache it, so hero prose generation is skipped to avoid dual blocking concerns.

### Prohibited Scenarios

❌ **Never block** in these cases:

- Movement actions (`move`, `go`, `walk`)
- Mutating actions (`get`, `drop`, `use`, `attack`)
- Actions with shared world effects (`set fire`, `trigger trap`)
- Actions with pending state writes (inventory updates, quest flags, canonical cache writes)
- Combat or time-critical interactions

These actions **must** return <500ms p95 with immediate state updates. AI enrichment (if needed) must be async (enqueued to Service Bus).

## Timeout Budgets and Tuning Knobs

### Environment Variable: `HERO_PROSE_TIMEOUT_MS`

**Type**: Integer (milliseconds)  
**Default**: `1200`  
**Valid Range**: `1 - 10000` (enforced by HeroProseGenerator)  
**Purpose**: Hard timeout for AI generation to prevent indefinite blocking

**Configuration Examples:**

```bash
# Default (1200ms)
# No environment variable needed

# Lower timeout for faster fallback (e.g., cost-conscious deployment)
HERO_PROSE_TIMEOUT_MS=800

# Higher timeout for richer prose (e.g., high-quality experience mode)
HERO_PROSE_TIMEOUT_MS=2000

# Invalid values fall back to default (1200ms)
HERO_PROSE_TIMEOUT_MS=0       # → 1200ms
HERO_PROSE_TIMEOUT_MS=abc     # → 1200ms
HERO_PROSE_TIMEOUT_MS=-500    # → 1200ms
```

**Behavior on Timeout:**

1. AI generation attempt times out after `timeoutMs`
2. `HeroProseGenerator.generateHeroProse()` returns `{ success: false, reason: 'timeout' }`
3. No hero prose layer persisted
4. `DescriptionComposer` falls back to base description from `Location.description`
5. Telemetry emitted: `Description.Hero.Generate.Failure` with `outcomeReason: 'timeout'`
6. Next `look` attempt will retry generation (cache miss still true)

**Tuning Guidance:**

- **Increase** timeout if AI service latency is consistently high (p95 >1000ms)
- **Decrease** timeout if user experience requires faster fallback (e.g., mobile clients)
- **Monitor** telemetry: `Description.Hero.Generate.Success` vs `Failure` ratio
- **Target**: ≥80% success rate; if lower, investigate AI service performance or adjust timeout

### Future Rate Limiting (Not Implemented)

**Potential Future Enhancements** (out of scope for current implementation):

- **Per-location cooldown**: Prevent retry storms on repeated cache misses (e.g., max 1 generation attempt per location per 5 minutes)
- **Global throttle**: Cap total hero prose generations per hour (cost guardrail)
- **Player-level throttle**: Limit hero prose generations per player per session (anti-spam)

These would be implemented via additional environment variables or Redis-backed rate limiter if cost/performance requires.

## Idempotency Rules

### Composite Idempotency Key

Hero prose generation uses **multi-factor idempotency** to prevent duplicate generations:

1. **Location Scope**: `scopeId = 'loc:<locationId>'`
2. **Layer Type**: `layerType = 'dynamic'`
3. **Role Marker**: `metadata.role = 'hero'`
4. **Prompt Version**: `metadata.promptHash = '<hash>'`

**Cache Hit Detection (heroProseGenerator.ts):**

```typescript
// Check for existing hero prose layer (cache hit)
const existingDynamic = await this.layerRepo.queryLayerHistory(`loc:${locationId}`, 'dynamic')
const existingHero = selectHeroProse(existingDynamic)

if (existingHero && existingHero.value) {
    this.telemetry.trackGameEvent('Description.Hero.CacheHit', props)
    return { success: true, prose: existingHero.value, reason: 'cache-hit' }
}
```

**Write Semantics:**

- **First generation**: Creates new layer with `promptHash` derived from current prompt template
- **Prompt template updated**: New `promptHash` → new layer created (old layer coexists but not selected)
- **Duplicate API call**: Same `(locationId, promptHash)` within short window → cache hit on second call
- **Multiple hero layers**: `selectHeroProse()` selects most recent by `authoredAt` timestamp (see [Hero Prose Layer Convention](./hero-prose-layer-convention.md#multiple-hero-layers-edge-case))

### Prompt Hashing

**Algorithm (heroProseGenerator.ts):**

```typescript
private hashPrompt(prompt: string): string {
    return createHash('sha256').update(prompt).digest('hex').slice(0, 8)
}
```

**Purpose:**

- Unique identifier for prompt template version
- Enables prompt evolution without invalidating existing hero prose
- Deterministic: same prompt → same hash → idempotent layer creation

**Example Prompt:**

```
You are a fantasy world writer. Create a single vivid paragraph of hero prose for a location.

Location: Forest Clearing
Base description: Sunlight filters through ancient oaks...

Write 1-2 sentences of atmospheric, vivid prose (max 200 tokens) that enhances the base description.
```

**Hash**: `a3b4c5d6` (8-char prefix of SHA-256 hash)

## Storage Contract

### Layer Metadata Convention

Hero prose layers conform to the existing `DescriptionLayer` schema with specific metadata flags:

**Schema (descriptionLayers container in Cosmos DB SQL API):**

```typescript
{
  id: string                    // GUID (e.g., '123e4567-e89b-12d3-a456-426614174000')
  scopeId: string               // 'loc:<locationId>'
  layerType: 'dynamic'          // Uses structural event layer type
  fromTick: number              // 0 (immediate activation)
  toTick: number | null         // null (indefinite duration)
  value: string                 // Generated hero prose text (≤1200 chars)
  content?: string              // Alias for value (optional)
  priority: number              // 0 (default priority)
  authoredAt: string            // ISO 8601 timestamp of generation
  metadata: {
    replacesBase: true          // Signals replace (not append) semantics
    role: 'hero'                // Identifies this as hero prose
    promptHash: string          // 8-char hash of prompt template
  }
}
```

**Partition Key**: `/scopeId` (same as other description layers)

**Persistence Location**: `descriptionLayers` container (Cosmos DB SQL API, partitioned by `/scopeId`)

**Storage Pattern (setLayerForLocation):**

```typescript
await this.layerRepo.setLayerForLocation(
    locationId,
    'dynamic',
    0,        // fromTick (immediate)
    null,     // toTick (indefinite)
    prose,
    {
        replacesBase: true,
        role: 'hero',
        promptHash
    }
)
```

**Validation Constraints:**

| Field | Constraint | Enforcement |
|-------|------------|-------------|
| `value` | ≤1200 characters | HeroProseGenerator (pre-persist validation) |
| `value` | Non-empty, non-whitespace | `isValidHeroProseContent()` check |
| `metadata.role` | Exactly `'hero'` | Required for `isHeroProse()` selection |
| `metadata.replacesBase` | Exactly `true` | Required for replace-base semantics |
| `metadata.promptHash` | Non-empty string | Required for idempotency |

**Content Validation (heroProse.ts):**

```typescript
export function isValidHeroProseContent(content: string): boolean {
    // Empty or whitespace-only is invalid
    if (!content || content.trim().length === 0) {
        return false
    }
    
    // Exceeds length limit (1200 chars)
    if (content.length > 1200) {
        return false
    }
    
    return true
}
```

## Fallback Behavior Guarantees

### Deterministic Degradation

Hero prose generation **always** degrades gracefully. Players **never** see errors or hanging requests due to AI failures.

**Fallback Hierarchy:**

1. **Cache Hit**: Return cached hero prose from `descriptionLayers` (fastest path, <200ms)
2. **Generation Success**: Persist new hero prose, return immediately (1200ms timeout)
3. **Timeout**: AI service doesn't respond within timeout → return base description
4. **Error**: AI service returns error → return base description
5. **Invalid Response**: AI returns empty/oversized prose → return base description
6. **Config Missing**: No AOAI credentials → skip generation, return base description

**Code Contract (descriptionComposer.ts):**

```typescript
// 2. Check for hero-prose layer that can replace base description
const heroProse = selectHeroProse(allLayers)
let effectiveBase = originalBaseDescription
let heroProseFallback = false
let heroProseUsed: DescriptionLayer | null = null

if (heroProse) {
    const heroContent = heroProse.value ?? heroProse.content ?? ''
    if (isValidHeroProseContent(heroContent)) {
        // Use hero-prose as effective base
        effectiveBase = heroContent
        heroProseUsed = heroProse
    } else {
        // Hero-prose invalid, fall back to original base
        heroProseFallback = true
    }
}
```

**Telemetry Tracking:**

```typescript
this.telemetryService.trackGameEvent('Description.Compile', {
    locationId,
    layerCount: allLayers.length,
    activeLayerCount: activeLayers.length,
    hasBaseDescription: !!originalBaseDescription,
    hasHeroProse: !!heroProse,
    heroProseFallback,  // true if hero prose existed but was invalid
    // ...
})
```

### Player Experience Expectations

| Scenario | Player Sees | Latency | Telemetry |
|----------|-------------|---------|-----------|
| **Cache hit** | Hero prose + overlays | <200ms | `Description.Hero.CacheHit` |
| **First look (success)** | Hero prose + overlays | ~1000ms | `Description.Hero.Generate.Success` |
| **First look (timeout)** | Base description + overlays | ~1200ms | `Description.Hero.Generate.Failure` (reason: timeout) |
| **First look (error)** | Base description + overlays | <500ms | `Description.Hero.Generate.Failure` (reason: error) |
| **Invalid hero prose** | Base description + overlays | <200ms | `Description.Compile` (heroProseFallback: true) |

**Key Invariants:**

- ✅ Player **always** receives a valid description (never blank, never error message)
- ✅ HTTP response **always** returns within timeout + margin (<1500ms worst case)
- ✅ Base description acts as **fallback safety net** for all failure modes
- ✅ Overlays (ambient, structural events) **still apply** even when hero prose fails

## Edge Cases

### Offline/Local Development Without AOAI Credentials

**Scenario**: Developer runs backend locally without `AZURE_OPENAI_ENDPOINT` or Azure credentials configured.

**Behavior:**

1. `HeroProseGenerator` checks `this.config.endpoint` before attempting generation
2. If missing or empty → skip generation, return `{ success: false, reason: 'error' }`
3. Telemetry emitted: `Description.Hero.Generate.Failure` with `outcomeReason: 'config-missing'`
4. `DescriptionComposer` uses base description (no hero prose layer created)

**Code Path (heroProseGenerator.ts):**

```typescript
// Check if Azure OpenAI is configured
if (!this.config.endpoint) {
    const configMissingProps = {}
    enrichHeroProseAttributes(configMissingProps, {
        locationId,
        outcomeReason: 'config-missing',
        latencyMs: Date.now() - startTime
    })
    this.telemetry.trackGameEvent('Description.Hero.Generate.Failure', configMissingProps)
    return {
        success: false,
        reason: 'error'
    }
}
```

**Local Dev Workflow:**

```bash
# Option 1: Skip hero prose entirely (uses base descriptions)
npm run dev

# Option 2: Configure AOAI for local testing
export AZURE_OPENAI_ENDPOINT="https://your-resource.openai.azure.com/"
npm run dev

# Option 3: Use mock AI client (if implemented)
export USE_MOCK_AI=true
npm run dev
```

**Result**: Local development works without AOAI credentials; all `look` commands return base descriptions. No errors, no blocking.

### Azure OpenAI Service Outage

**Scenario**: AOAI service is unavailable (503, network timeout, throttled).

**Behavior:**

1. AI client times out after `timeoutMs`
2. `HeroProseGenerator.generateHeroProse()` catches exception, returns `{ success: false, reason: 'error' }`
3. Telemetry emitted: `Description.Hero.Generate.Failure` with `outcomeReason: 'error'`
4. `DescriptionComposer` uses base description
5. Next `look` attempt will retry generation (cache miss still true)

**Retry Strategy:**

- **No automatic retry within same HTTP request** (would exceed latency budget)
- **Player-driven retry**: Next `look` action triggers new generation attempt
- **Exponential backoff**: Not implemented (each player action is independent)
- **Circuit breaker**: Future enhancement (track failure rate, temporarily disable hero prose)

### Malformed AI Response

**Scenario**: AI returns empty string, whitespace-only, or >1200 character prose.

**Validation (heroProseGenerator.ts):**

```typescript
// Validate generated prose
const prose = result.content.trim()
if (!prose || prose.length > 1200) {
    const invalidProps = {}
    enrichHeroProseAttributes(invalidProps, {
        locationId,
        outcomeReason: 'invalid-response',
        latencyMs,
        model: this.config.model
    })
    this.telemetry.trackGameEvent('Description.Hero.Generate.Failure', invalidProps)
    return {
        success: false,
        reason: 'invalid-response'
    }
}
```

**Result**: Invalid prose discarded, base description used, no layer persisted.

### Multiple Concurrent Requests for Same Location

**Scenario**: Two players `look` at same location simultaneously, both cache miss.

**Race Condition:**

1. Player A's request starts hero prose generation
2. Player B's request (concurrent) also starts generation (cache still empty)
3. Both persist hero prose layers with same `(locationId, promptHash)`

**Current Behavior (Acceptable):**

- Two layers created with different `id` values but same `promptHash`
- `selectHeroProse()` selects most recent by `authoredAt` (deterministic)
- Both layers coexist in storage (minor storage overhead)
- Future requests hit cache (no more duplicate generations)

**Future Enhancement (Out of Scope):**

- Distributed lock during generation (e.g., Redis SETNX)
- Would prevent duplicate API calls but adds infrastructure complexity
- Current behavior acceptable for MVP (duplicate calls rare, self-healing on cache hit)

### Prompt Template Evolution

**Scenario**: Prompt template updated (better prose quality), existing locations have old hero prose.

**Behavior:**

1. New `promptHash` generated from updated template
2. `selectHeroProse()` query finds old layer (different `promptHash`)
3. Cache miss logic triggers new generation with new prompt
4. New layer persisted alongside old layer
5. `selectHeroProse()` selects new layer (most recent `authoredAt`)

**Result**: Gradual rollout of improved hero prose as players revisit locations. No batch regeneration needed.

**Cleanup (Future Enhancement):**

- Periodic job to purge obsolete hero prose layers (old `promptHash` values)
- Retention policy: keep most recent 2-3 prompt versions per location
- Not critical for MVP (storage overhead minimal)

## Performance Characteristics

### Latency Breakdown

**Cache Hit Path** (typical scenario after first visit):

```
Total: ~200ms p95
├─ Location fetch (Gremlin): 80ms
├─ Hero prose query (SQL API): 50ms
├─ Layer filtering + assembly: 20ms
├─ Markdown to HTML conversion: 30ms
└─ HTTP response overhead: 20ms
```

**Cache Miss Path with Successful Generation** (first visit):

```
Total: ~1100ms p95
├─ Location fetch (Gremlin): 80ms
├─ Hero prose cache check (SQL API): 50ms
├─ AI generation (AOAI): 900ms ← blocking window
├─ Layer persistence (SQL API): 40ms
├─ Layer filtering + assembly: 20ms
└─ Markdown to HTML + response: 50ms
```

**Cache Miss Path with Timeout** (AI slow/unavailable):

```
Total: ~1250ms p95
├─ Location fetch (Gremlin): 80ms
├─ Hero prose cache check (SQL API): 50ms
├─ AI generation timeout: 1200ms ← blocking window
├─ Layer filtering + assembly (base): 20ms
└─ Markdown to HTML + response: 50ms
```

**Key Metrics to Monitor:**

- **Cache hit rate**: Target ≥95% (most requests hit cached hero prose)
- **Generation success rate**: Target ≥80% (successful generation within timeout)
- **p95 latency** (cache hit): Target <500ms
- **p95 latency** (cache miss): Target <1500ms (includes timeout margin)

### Cost Implications

**Token Budget** (per generation):

- **Prompt**: ~150 tokens (location name + base description + instructions)
- **Completion**: ~50-100 tokens (1-2 sentences of hero prose, target ≤200 tokens)
- **Total**: ~200-250 tokens per generation

**Estimated Cost** (GPT-4o-mini pricing):

- **Prompt**: 150 tokens × $0.00015/1K = $0.0000225
- **Completion**: 100 tokens × $0.0006/1K = $0.00006
- **Total per location**: ~$0.00008 (eight hundredths of a cent)

**Scaling Projections:**

| Locations | One-Time Cost (all locations) | Amortized (per player, 100 locations visited) |
|-----------|-------------------------------|-----------------------------------------------|
| 100 | $0.008 | $0.008 |
| 1,000 | $0.08 | $0.008 |
| 10,000 | $0.80 | $0.008 |

**Cost Guardrails:**

- **Cache-first**: Each location generated at most once (no per-player cost)
- **Timeout budget**: Caps max billable tokens (cancels slow requests)
- **Soft threshold monitoring**: `AI.Cost.SoftThresholdCrossed` alerts on anomalies
- **Future enhancement**: Per-location cooldown prevents retry storms

**Comparison to Alternative Strategies:**

| Strategy | Cost per Player | Latency (p95) | Immersion Quality |
|----------|-----------------|---------------|-------------------|
| **No hero prose (base only)** | $0 | 200ms | Baseline |
| **Hero prose (current)** | $0.008/100 locs | 200ms (cached) | High |
| **Per-player generation** | $0.008/100 locs × players | 1100ms always | Highest (personalized) |
| **Async-only hero prose** | $0.008/100 locs | 200ms (delayed) | High (eventual) |

Current strategy (cache-first blocking) optimizes for **immediate immersion** at **minimal cost** with **acceptable latency** (cache hit dominates).

## Observability

### Telemetry Events

**Hero Prose Lifecycle:**

1. **Cache Hit**: `Description.Hero.CacheHit`
   - `locationId`, `latencyMs`
   - Emitted when existing hero prose found (no generation needed)

2. **Cache Miss**: `Description.Hero.CacheMiss`
   - `locationId`, `latencyMs`
   - Emitted when no hero prose found (generation attempted)

3. **Generation Success**: `Description.Hero.Generate.Success`
   - `locationId`, `latencyMs`, `model`, `tokenUsage`
   - Emitted when AI generation completes successfully

4. **Generation Failure**: `Description.Hero.Generate.Failure`
   - `locationId`, `latencyMs`, `model`, `outcomeReason` (timeout|error|invalid-response|config-missing)
   - Emitted on timeout, error, or validation failure

5. **Compilation with Hero Prose**: `Description.Compile`
   - `hasHeroProse: true`, `heroProseFallback: false`
   - Emitted when hero prose used as effective base

6. **Compilation with Fallback**: `Description.Compile`
   - `hasHeroProse: true`, `heroProseFallback: true`
   - Emitted when hero prose invalid (fallback to base)

**Slow Generation Warning**: `Timing.Op`
- `op: 'hero-prose-generation'`, `ms: <latency>`, `category: 'hero-generation-slow'`
- Emitted when generation latency >500ms (even if within timeout budget)

### Dashboard Queries

**Hero Prose Cache Hit Rate:**

```kusto
customEvents
| where name in ('Description.Hero.CacheHit', 'Description.Hero.CacheMiss')
| where timestamp > ago(7d)
| summarize 
    hits = countif(name == 'Description.Hero.CacheHit'),
    misses = countif(name == 'Description.Hero.CacheMiss')
| extend cacheHitRate = todouble(hits) / (hits + misses) * 100
| project cacheHitRate
```

**Generation Success Rate:**

```kusto
customEvents
| where name in ('Description.Hero.Generate.Success', 'Description.Hero.Generate.Failure')
| where timestamp > ago(7d)
| summarize 
    successes = countif(name == 'Description.Hero.Generate.Success'),
    failures = countif(name == 'Description.Hero.Generate.Failure')
| extend successRate = todouble(successes) / (successes + failures) * 100
| project successRate
```

**Timeout vs Error Breakdown:**

```kusto
customEvents
| where name == 'Description.Hero.Generate.Failure'
| where timestamp > ago(7d)
| extend outcomeReason = tostring(customDimensions.outcomeReason)
| summarize count() by outcomeReason
| order by count_ desc
```

**Latency Distribution (Cache Hit vs Miss):**

```kusto
customEvents
| where name in ('Description.Hero.CacheHit', 'Description.Hero.CacheMiss')
| where timestamp > ago(24h)
| extend 
    eventType = name,
    latencyMs = todouble(customDimensions.latencyMs)
| summarize 
    p50 = percentile(latencyMs, 50),
    p95 = percentile(latencyMs, 95),
    p99 = percentile(latencyMs, 99)
  by eventType
```

### Alerts

**Recommended Alert Rules:**

1. **Low Cache Hit Rate**
   - **Condition**: Cache hit rate <80% over 1 hour
   - **Action**: Investigate if layers not persisting or high churn in visited locations

2. **High Timeout Rate**
   - **Condition**: Timeout failures >30% of generation attempts over 1 hour
   - **Action**: Investigate AOAI service latency or increase `HERO_PROSE_TIMEOUT_MS`

3. **Config Missing Spike**
   - **Condition**: >10 `config-missing` failures over 5 minutes
   - **Action**: Check AOAI endpoint configuration or credentials

4. **Slow Generation Trend**
   - **Condition**: p95 generation latency >1500ms over 1 hour
   - **Action**: Investigate AOAI service performance or reduce timeout budget

## Related Documentation

- [Hero Prose Layer Convention](./hero-prose-layer-convention.md) - Storage schema and selection logic
- [Event Classification Matrix](./event-classification-matrix.md) - Non-blocking AI rule and exceptions
- [Tenets: Narrative Consistency](../tenets.md#7-narrative-consistency) - AI immersion vs determinism balance
- [AI Cost Telemetry](../observability/ai-cost-telemetry.md) - Token usage tracking and budget guardrails
- [Description Layering & Variation](../design-modules/description-layering-and-variation.md) - Layering model overview

## References

**Implementation Files:**

- `backend/src/handlers/locationLook.ts` - HTTP handler with blocking check
- `backend/src/services/heroProseGenerator.ts` - AI generation with timeout
- `backend/src/services/descriptionComposer.ts` - Fallback composition logic
- `backend/src/services/heroProse.ts` - Layer selection and validation utilities

**Related Issues:**

- Epic #735: Prompt Registry & Versioning
- Issue #TBD: Hero Prose Blocking Policy Documentation (this document)

## Revision History

- **2026-02-05**: Initial policy defined
  - Documented blocking conditions (perception, cache-miss, no canonical writes)
  - Timeout budgets and `HERO_PROSE_TIMEOUT_MS` tuning knob
  - Idempotency via `promptHash` and cache-first strategy
  - Storage contract (layerType, metadata convention)
  - Fallback behavior guarantees (always return base on failure)
  - Edge cases (offline dev, AOAI outage, malformed responses)
  - Performance characteristics and cost projections
  - Observability (telemetry events, dashboard queries, alerts)
