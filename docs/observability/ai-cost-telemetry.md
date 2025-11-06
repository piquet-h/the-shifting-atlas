# AI Cost Telemetry

> **Implementation**: `shared/src/aiCostCalculator.ts`, `shared/src/aiPricing.ts`, `shared/src/tokenEstimator.ts`, `shared/src/aiCostAggregator.ts`  
> **Event Registry**: `shared/src/telemetryEvents.ts`  
> **Destination**: Application Insights  
> **Purpose**: Track AI model token usage and estimated costs during simulation phase

## Overview

AI cost telemetry provides observability into token consumption and estimated costs for AI operations before actual model integration. The system emits granular per-call events plus hourly aggregated summaries, enabling dashboard construction and soft budget guardrails.

**Key Design Principles:**

- **Privacy-first**: No raw prompt or completion text stored or emitted in telemetry
- **Simulation mode**: Uses heuristic token estimator (`charDiv4`) until production tokenizer integrated
- **Pluggable pricing**: Static pricing table with JSON override support for flexibility
- **Bucketed dimensions**: Token counts bucketed (0-32, 33-128, etc.) for low-cardinality aggregation
- **Hourly aggregation**: In-memory summaries reduce event volume while preserving trend visibility

## Telemetry Events

All AI cost events registered in `shared/src/telemetryEvents.ts` under the `AI.Cost.*` namespace.

### AI.Cost.Estimated

**Trigger**: Before each AI model call (simulation phase)  
**Purpose**: Track per-operation token usage and estimated cost  
**Emission**: Synchronous, every AI operation

**Dimensions:**

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `modelId` | string | AI model identifier | `gpt-4o-mini`, `generic` |
| `promptTokens` | number | Estimated prompt token count | `150` |
| `completionTokens` | number | Estimated completion token count | `450` |
| `estimatedCostMicros` | number | Estimated cost in microdollars (USD × 1,000,000) | `375` |
| `promptBucket` | string | Token bucket for prompt | `129-512` |
| `completionBucket` | string | Token bucket for completion | `129-512` |
| `pricingSource` | string | `model` or `fallback` | `model` |
| `estimator` | string | Token estimator name | `charDiv4` |
| `simulation` | boolean | `true` if estimator is not `production` | `true` |
| `hadNegativeTokens` | boolean | `true` if negative tokens clamped (optional) | `false` |

**Privacy Note:** `promptText` and `completionText` are NOT included in telemetry payload.

### AI.Cost.WindowSummary

**Trigger**: Hourly rollover or explicit flush  
**Purpose**: Aggregate token usage and cost per model per hour  
**Emission**: Asynchronous, at hour boundaries or on-demand

**Dimensions:**

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `hourStart` | string | ISO 8601 hour start (UTC, truncated) | `2025-11-05T20:00:00.000Z` |
| `modelId` | string | AI model identifier | `gpt-4o-mini` |
| `calls` | number | Number of AI operations in this hour | `47` |
| `totalPromptTokens` | number | Sum of prompt tokens | `7050` |
| `totalCompletionTokens` | number | Sum of completion tokens | `21150` |
| `totalEstimatedCostMicros` | number | Sum of estimated costs (microdollars) | `17625` |
| `delayedFlush` | boolean | `true` if flush occurred >1 hour after hour end | `false` |

**Flush Logic:**

- **Automatic**: When recording an event in a new hour, completed previous hours are flushed
- **Manual**: Call `forceFlushAICostSummary()` to emit all pending summaries (e.g., before shutdown)
- **Delayed**: If idle >1 hour, next event emits previous hour with `delayedFlush=true`
- **Zero-call hours**: Never emitted (no summary when `calls=0`)

### AI.Cost.SoftThresholdCrossed

**Trigger**: When hourly estimated cost exceeds configured threshold  
**Purpose**: Early warning for anomalous cost spikes without blocking execution  
**Emission**: Once per (modelId, hour) threshold crossing

**Dimensions:**

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `hourStart` | string | ISO 8601 hour start (UTC) | `2025-11-05T21:00:00.000Z` |
| `modelId` | string | AI model identifier | `gpt-4o-mini` |
| `totalEstimatedCostMicros` | number | Current hourly cost when threshold crossed | `15000` |
| `thresholdMicros` | number | Configured threshold value | `10000` |
| `calls` | number | Number of operations at threshold crossing | `67` |

**Configuration:**

- Environment variable: `AI_COST_SOFT_THRESHOLD_MICROS` (integer, microdollars)
- If absent or `0`: guardrails disabled (no events emitted)
- Subsequent crossings in same hour suppressed (no spam)
- Reset on hour rollover

### AI.Cost.OverrideRejected

**Trigger**: Malformed `AI_PRICING_JSON` environment variable  
**Purpose**: Alert on pricing override configuration errors  
**Emission**: Once at backend initialization

**Dimensions:**

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `reason` | string | Rejection reason | `Invalid JSON format` |
| `providedValue` | string | First 100 chars of malformed input (truncated) | `{invalid: json}` |

### AI.Cost.InputAdjusted

**Trigger**: Negative token counts clamped to zero  
**Purpose**: Track input validation corrections  
**Emission**: Conditional, when adjustment needed

**Dimensions:**

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `originalPromptTokens` | number | Original value before clamp (if negative) | `-5` |
| `originalCompletionTokens` | number | Original value before clamp (if negative) | `-10` |
| `adjustedPromptTokens` | number | Clamped value | `0` |
| `adjustedCompletionTokens` | number | Clamped value | `0` |

### AI.Cost.InputCapped

**Trigger**: Input text exceeds `MAX_SIM_PROMPT_CHARS` (128,000 characters)  
**Purpose**: Track prompt size capping during heuristic estimation  
**Emission**: At call site before token estimation

**Dimensions:**

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `originalLength` | number | Original character count | `150000` |
| `cappedLength` | number | Capped character count | `128000` |
| `estimator` | string | Token estimator name | `charDiv4` |

**Note**: Production tokenizer integration may adjust or remove this limit.

## Token Buckets

Token counts are bucketed for low-cardinality aggregation in dashboards. Buckets chosen to align with common prompt/completion size thresholds.

| Bucket | Token Range | Typical Use Case |
|--------|-------------|------------------|
| `0-32` | 0 - 32 | Micro prompts, system messages |
| `33-128` | 33 - 128 | Short commands, metadata queries |
| `129-512` | 129 - 512 | Standard descriptions, dialogue |
| `513-2k` | 513 - 2,000 | Long-form generation, detailed context |
| `2k+` | 2,001+ | Large context windows, full lore dumps |

**Dashboard Usage:**

- Visualize distribution of operation sizes across buckets
- Identify cost drivers (e.g., 80% of cost from `2k+` bucket)
- Trend analysis: bucket shift over time as features evolve

## Pricing Configuration

### Default Pricing Table

Static pricing table in `shared/src/aiPricing.ts` includes:

```typescript
{
  'generic': {
    modelId: 'generic',
    promptPer1k: 0.0015,      // $0.0015 per 1K prompt tokens
    completionPer1k: 0.002     // $0.002 per 1K completion tokens
  },
  'gpt-4o-mini': {
    modelId: 'gpt-4o-mini',
    promptPer1k: 0.00015,      // $0.00015 per 1K prompt tokens
    completionPer1k: 0.0006    // $0.0006 per 1K completion tokens
  }
}
```

**Fallback Behavior:**

- Unknown `modelId` → returns `generic` pricing
- Original `modelId` preserved in telemetry for traceability

### Runtime Override

Pricing can be overridden at backend startup via environment variable.

**Environment Variable:** `AI_PRICING_JSON`

**Format:** JSON string containing partial or complete pricing table

**Example:**

```json
{
  "gpt-4o-mini": {
    "modelId": "gpt-4o-mini",
    "promptPer1k": 0.00020,
    "completionPer1k": 0.00070
  },
  "custom-model": {
    "modelId": "custom-model",
    "promptPer1k": 0.0010,
    "completionPer1k": 0.0015
  }
}
```

**Backend Integration Pattern:**

```typescript
// In backend initialization (e.g., app.ts or startup.ts)
import { applyPricingOverride } from '@piquet-h/shared'

const overrideJson = process.env.AI_PRICING_JSON
if (overrideJson) {
    const result = applyPricingOverride(overrideJson)
    if (!result.success) {
        // Emit AI.Cost.OverrideRejected telemetry
        telemetryClient.trackEvent({
            name: 'AI.Cost.OverrideRejected',
            properties: {
                reason: result.reason,
                providedValue: overrideJson.substring(0, 100)
            }
        })
    }
}
```

**Error Handling:**

- Malformed JSON → override rejected, default pricing used, `AI.Cost.OverrideRejected` emitted
- Missing numeric fields → override rejected
- Negative values → override rejected
- Empty/whitespace string → treated as no override (no error)

## Token Estimation

### Heuristic Estimator (Simulation Phase)

Current implementation uses `charDiv4` heuristic:

- **Algorithm**: Character count ÷ 4
- **Rationale**: Approximation based on OpenAI guidance (1 token ≈ 4 characters for English text)
- **Limitations**: Not a real tokenizer; suitable for budget planning only, not billing

**Estimator Interface:**

```typescript
interface TokenEstimator {
    estimate(text: string): number
    readonly name: string  // 'charDiv4' for heuristic, 'production' for real tokenizer
}
```

**Simulation Flag:**

- When `estimator !== 'production'`: treat costs as approximations for budget planning
- All events include `simulation: true` field when using heuristic estimator
- Future production tokenizer will use `name: 'production'` to signal real token counts

**Input Capping:**

- Maximum: `MAX_SIM_PROMPT_CHARS` = 128,000 characters
- Prevents token explosion in heuristic mode
- Capping triggers `AI.Cost.InputCapped` event
- Production tokenizer may adjust or remove this limit

### Future Tokenizer Upgrade Path

Planned integration of production tokenizer (e.g., `tiktoken`) will:

1. Implement `TokenEstimator` interface with `name: 'production'`
2. Remove `MAX_SIM_PROMPT_CHARS` limit or adjust to model context window
3. Set `simulation: false` in telemetry events
4. Enable billing-grade cost reconciliation

**Migration Strategy:**

- Telemetry schema remains unchanged (backward compatible)
- Dashboard queries filter by `simulation` field for pre/post comparison
- Existing heuristic estimator retained for testing/fallback scenarios

**Related Issue**: TBD (tokenizer integration issue placeholder)

## Kusto Query Examples

### Hourly Total Cost

Query total estimated cost per hour across all models:

```kusto
customEvents
| where name == 'AI.Cost.WindowSummary'
| where timestamp > ago(7d)
| extend hourStart = tostring(customDimensions.hourStart),
         modelId = tostring(customDimensions.modelId),
         totalCostMicros = todouble(customDimensions.totalEstimatedCostMicros),
         calls = toint(customDimensions.calls)
| summarize 
    totalCalls = sum(calls),
    totalCostUSD = sum(totalCostMicros) / 1000000.0
  by hourStart
| order by hourStart desc
```

### Cost Per Call (Per Model)

Calculate average cost per AI operation by model:

```kusto
customEvents
| where name == 'AI.Cost.Estimated'
| where timestamp > ago(24h)
| extend modelId = tostring(customDimensions.modelId),
         costMicros = todouble(customDimensions.estimatedCostMicros),
         simulation = tobool(customDimensions.simulation)
| summarize 
    totalCalls = count(),
    totalCostUSD = sum(costMicros) / 1000000.0,
    avgCostUSD = avg(costMicros) / 1000000.0,
    p50CostUSD = percentile(costMicros, 50) / 1000000.0,
    p95CostUSD = percentile(costMicros, 95) / 1000000.0
  by modelId, simulation
| order by totalCostUSD desc
```

### Token Bucket Distribution

Analyze prompt size distribution across buckets:

```kusto
customEvents
| where name == 'AI.Cost.Estimated'
| where timestamp > ago(7d)
| extend promptBucket = tostring(customDimensions.promptBucket),
         completionBucket = tostring(customDimensions.completionBucket)
| summarize 
    calls = count(),
    estimatedCostUSD = sum(todouble(customDimensions.estimatedCostMicros)) / 1000000.0
  by promptBucket, completionBucket
| order by calls desc
```

### Soft Threshold Violations

Track budget threshold crossings:

```kusto
customEvents
| where name == 'AI.Cost.SoftThresholdCrossed'
| where timestamp > ago(30d)
| extend hourStart = tostring(customDimensions.hourStart),
         modelId = tostring(customDimensions.modelId),
         totalCostUSD = todouble(customDimensions.totalEstimatedCostMicros) / 1000000.0,
         thresholdUSD = todouble(customDimensions.thresholdMicros) / 1000000.0,
         calls = toint(customDimensions.calls)
| project timestamp, hourStart, modelId, totalCostUSD, thresholdUSD, calls
| order by timestamp desc
```

### Hourly Cost Trend (Chart)

Visualize cost over time with timechart:

```kusto
customEvents
| where name == 'AI.Cost.WindowSummary'
| where timestamp > ago(7d)
| extend hourStart = todatetime(tostring(customDimensions.hourStart)),
         modelId = tostring(customDimensions.modelId),
         costUSD = todouble(customDimensions.totalEstimatedCostMicros) / 1000000.0
| summarize totalCostUSD = sum(costUSD) by hourStart, modelId
| render timechart
```

### Input Adjustments & Capping

Monitor input validation corrections:

```kusto
customEvents
| where name in ('AI.Cost.InputAdjusted', 'AI.Cost.InputCapped')
| where timestamp > ago(7d)
| extend eventType = name,
         details = iff(name == 'AI.Cost.InputCapped',
                      strcat('Original: ', customDimensions.originalLength, ', Capped: ', customDimensions.cappedLength),
                      strcat('Prompt: ', customDimensions.originalPromptTokens, ' → ', customDimensions.adjustedPromptTokens,
                             ', Completion: ', customDimensions.originalCompletionTokens, ' → ', customDimensions.adjustedCompletionTokens))
| project timestamp, eventType, details
| order by timestamp desc
```

## Simulation Harness Usage

**Script**: `scripts/simulate-ai-cost.mjs` (Issue #306 - in progress)

**Purpose**: Generate synthetic AI cost telemetry events for pre-integration validation and dashboard testing.

**Usage Pattern:**

```bash
# Run simulation with default configuration
node scripts/simulate-ai-cost.mjs

# Configure via environment variables
SIM_CALLS_PER_TEMPLATE=50 COMPLETION_RATIO=3 node scripts/simulate-ai-cost.mjs
```

**Configuration:**

| Variable | Description | Default |
|----------|-------------|---------|
| `SIM_CALLS_PER_TEMPLATE` | Number of iterations per prompt template | `10` |
| `COMPLETION_RATIO` | Completion length as ratio of prompt length | `3` |

**Output:**

- Console summary: total calls, aggregate cost (USD), top 3 token buckets by frequency
- Emitted events: `AI.Cost.Estimated` (per call) + `AI.Cost.WindowSummary` (on flush)
- Exit code: 0 on success, non-zero if no prompts found

**Example Output:**

```
=== AI Cost Simulation Summary ===
Total Calls: 50
Aggregate Cost: $0.001875 USD
Top Token Buckets:
  1. 129-512 (prompt): 35 calls
  2. 513-2k (completion): 42 calls
  3. 33-128 (prompt): 15 calls
=== Simulation Complete ===
```

**Integration Note**: Harness reads prompts from `shared/src/prompts` or inline array. Update prompt sources as AI integration progresses.

## Privacy & Audit Considerations

### No Raw Text in Telemetry

**Policy**: Raw prompt or completion text is NEVER stored in telemetry payloads.

**Enforcement:**

- Token estimation occurs in-memory; text discarded after counting
- Telemetry payloads contain only token counts, buckets, and cost estimates
- Unit tests assert `promptText` and `completionText` fields absent from emission

**Privacy Validation:**

```bash
# Grep check for prohibited fields in telemetry emission
grep -r "promptText\|completionText" shared/src/aiCost*.ts
# Expected result: no matches in telemetry payload preparation
```

### Audit Trail

For compliance scenarios requiring full AI request/response audit:

- Separate audit logging infrastructure required (not covered by cost telemetry)
- Audit logs stored separately with appropriate retention and access controls
- Cost telemetry focuses solely on observability, not compliance audit

**Related Issue**: TBD (audit logging design issue placeholder)

## Dashboard Integration

### Recommended Tiles

#### Cost Overview

- **Total Daily Cost**: Sum `AI.Cost.WindowSummary.totalEstimatedCostMicros` over 24h
- **Cost Trend (7d)**: Timechart of hourly summaries
- **Model Cost Breakdown**: Pie chart by `modelId`

#### Usage Metrics

- **Calls Per Hour**: Count from `AI.Cost.Estimated` or sum `calls` from `WindowSummary`
- **Token Bucket Distribution**: Bar chart (prompt vs completion buckets)
- **Average Cost Per Call**: Total cost ÷ total calls

#### Alerts & Guardrails

- **Threshold Violations**: Table of `AI.Cost.SoftThresholdCrossed` events
- **Input Adjustments**: Count of `AI.Cost.InputAdjusted` and `AI.Cost.InputCapped` events
- **Pricing Overrides**: Recent `AI.Cost.OverrideRejected` events

### Workbook Export

Future enhancement (not in current scope):

- Export dashboard definitions as JSON for Bicep deployment
- Issue to be filed if needed: TBD

## Implementation References

### Source Files

| Component | File | Purpose |
|-----------|------|---------|
| Event Registry | `shared/src/telemetryEvents.ts` | Canonical event name enumeration |
| Token Estimator | `shared/src/tokenEstimator.ts` | Pluggable token counting interface |
| Pricing Table | `shared/src/aiPricing.ts` | Static pricing with JSON override |
| Cost Calculator | `shared/src/aiCostCalculator.ts` | Cost calculation & payload preparation |
| Aggregator | `shared/src/aiCostAggregator.ts` | Hourly summary accumulation & flush |

### Related Issues

| Issue | Title | Status |
|-------|-------|--------|
| #299 | AI Cost Telemetry: Register Events | Closed |
| #300 | AI Cost Telemetry: Pricing Table & Override Infrastructure | Closed |
| #302 | AI Cost Telemetry: Token Estimation Strategy & Interface | Closed |
| #303 | AI Cost Telemetry: Cost Calculator & Event Emission | Closed |
| #304 | AI Cost Telemetry: Hourly Aggregation & Window Summary | Closed |
| #305 | AI Cost Telemetry: Soft Budget Guardrails | Closed |
| #306 | AI Cost Telemetry: Simulation Harness | In Progress |
| #50 | (Epic candidate) | Open |

### Documentation Cross-References

- **Main Telemetry Guide**: `docs/observability.md` (event naming conventions, sampling, correlation)
- **Event Catalog**: `docs/observability/telemetry-catalog.md` (detailed event registry)
- **ADR-002**: `docs/adr/ADR-002-graph-partition-strategy.md` (RU/latency thresholds context)

## Future Enhancements

### Planned

- Production tokenizer integration (`tiktoken` or equivalent)
- Hard budget enforcement with request rejection
- Multi-tenancy cost attribution (per-player or per-feature)
- Daily/weekly summary roll-ups for long-term trend analysis

### Under Consideration

- Real-time cost dashboard with WebSocket updates
- Cost anomaly detection (ML-based spike detection)
- Model recommendation engine (cost vs quality tradeoffs)

_Last updated: 2025-11-06 (initial documentation from issues #299-#306)_
