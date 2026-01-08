/**
 * AI Cost Telemetry: Cost Calculator & Payload Preparation
 *
 * Provides cost calculation and telemetry payload preparation for AI operations (simulation phase).
 * Produces consistent, privacy-safe telemetry data without storing raw prompt/completion text.
 *
 * ## Usage
 *
 * ```typescript
 * import { prepareAICostTelemetry } from '@piquet-h/shared'
 *
 * // Option 1: Pass text (will be estimated)
 * const payload = prepareAICostTelemetry({
 *     modelId: 'gpt-4o-mini',
 *     promptText: 'Generate a dungeon description...',
 *     completionText: 'The dark corridor stretches...'
 * })
 *
 * // Backend emits telemetry using the payload
 * // (Backend code - not in shared package)
 * telemetryClient.emit('AI.Cost.Estimated', payload)
 *
 * if (payload.hadNegativeTokens) {
 *     telemetryClient.emit('AI.Cost.InputAdjusted', { ... })
 * }
 *
 * // Option 2: Pass explicit token counts (from real tokenizer)
 * const payload2 = prepareAICostTelemetry({
 *     modelId: 'gpt-4o-mini',
 *     promptTokens: 150,
 *     completionTokens: 450
 * })
 *
 * // Option 3: Pass TokenMetadata from OpenAI response (production)
 * const metadata: TokenMetadata = {
 *     modelId: 'gpt-4o-mini',
 *     promptTokens: 150,
 *     completionTokens: 450,
 *     totalTokens: 600,
 *     estimatorName: 'production',
 *     cachedTokens: 100
 * }
 * const payload3 = prepareAICostTelemetry({
 *     modelId: 'gpt-4o-mini',
 *     tokenMetadata: metadata
 * })
 * ```
 *
 * ## Telemetry Payload Fields
 *
 * - modelId: AI model identifier
 * - promptTokens: Prompt token count
 * - completionTokens: Completion token count
 * - estimatedCostMicros: Estimated cost in microdollars (USD * 1,000,000)
 * - promptBucket: Token bucket for prompt (e.g., "33-128")
 * - completionBucket: Token bucket for completion
 * - pricingSource: 'model' or 'fallback'
 * - estimator: Token estimator name (e.g., 'charDiv4', 'production')
 * - simulation: true if estimator is not 'production'
 * - hadNegativeTokens: true if negative tokens were clamped
 * - originalPromptTokens: Original value (if negative)
 * - originalCompletionTokens: Original value (if negative)
 * - cachedTokens: Number of cached tokens (if provided via TokenMetadata)
 *
 * ## Privacy
 *
 * NO raw promptText or completionText is included in the returned payload.
 * Only token counts and buckets are present.
 *
 * ## Edge Cases
 *
 * - Negative tokens: Clamped to 0, hadNegativeTokens=true
 * - Missing completion tokens: Treated as 0
 * - Unknown modelId: Uses fallback pricing, pricingSource='fallback'
 *
 * @module aiCostCalculator
 */

import { getPricing, getRegisteredModelIds } from './aiPricing.js'
import { createCharDiv4Estimator } from './tokenEstimator.js'
import type { TokenMetadata } from './types/tokenMetadata.js'

/**
 * Token count buckets for telemetry aggregation.
 * Chosen to align with common prompt/completion size thresholds.
 */
export type TokenBucket = '0-32' | '33-128' | '129-512' | '513-2k' | '2k+'

/**
 * Result of cost calculation.
 */
export interface CostCalculationResult {
    /** Estimated cost in microdollars (USD * 1,000,000) */
    estimatedCostMicros: number
    /** Token bucket for prompt tokens */
    promptBucket: TokenBucket
    /** Token bucket for completion tokens */
    completionBucket: TokenBucket
    /** Pricing source: 'model' if model found in pricing table, 'fallback' otherwise */
    pricingSource: 'model' | 'fallback'
}

/**
 * Calculate token bucket for given token count.
 *
 * @param tokens - Token count (must be non-negative)
 * @returns Token bucket string
 */
export function getTokenBucket(tokens: number): TokenBucket {
    if (tokens <= 32) {
        return '0-32'
    } else if (tokens <= 128) {
        return '33-128'
    } else if (tokens <= 512) {
        return '129-512'
    } else if (tokens <= 2000) {
        return '513-2k'
    } else {
        return '2k+'
    }
}

/**
 * Calculate estimated cost for AI operation using pricing table.
 *
 * @param modelId - AI model identifier (e.g., 'gpt-4o-mini')
 * @param promptTokens - Prompt token count (clamped to non-negative)
 * @param completionTokens - Completion token count (clamped to non-negative)
 * @returns Cost calculation result with buckets and pricing source
 */
export function calculateCost(modelId: string, promptTokens: number, completionTokens: number): CostCalculationResult {
    // Clamp negative values to 0
    const safePromptTokens = Math.max(0, promptTokens)
    const safeCompletionTokens = Math.max(0, completionTokens)

    // Get pricing (falls back to generic if model not found)
    const pricing = getPricing(modelId)

    // Check if we got the actual model or fallback
    // If the model exists in the pricing table, we're using model pricing
    // Otherwise getPricing returned fallback with original modelId preserved
    const registeredIds = getRegisteredModelIds()
    const pricingSource: 'model' | 'fallback' = registeredIds.includes(modelId) ? 'model' : 'fallback'

    // Calculate cost per 1K tokens, then scale to actual token count
    const promptCostUsd = (safePromptTokens / 1000) * pricing.promptPer1k
    const completionCostUsd = (safeCompletionTokens / 1000) * pricing.completionPer1k
    const totalCostUsd = promptCostUsd + completionCostUsd

    // Convert to microdollars and round to whole number
    const estimatedCostMicros = Math.round(totalCostUsd * 1_000_000)

    return {
        estimatedCostMicros,
        promptBucket: getTokenBucket(safePromptTokens),
        completionBucket: getTokenBucket(safeCompletionTokens),
        pricingSource
    }
}

/**
 * Options for preparing AI cost telemetry payload.
 * Supports text-based estimation, explicit token counts, and real token metadata from LLM responses.
 */
export interface PrepareAICostTelemetryOptions {
    /** AI model identifier */
    modelId: string
    /** Prompt text (will be estimated if promptTokens/tokenMetadata not provided) */
    promptText?: string
    /** Completion text (will be estimated if completionText/tokenMetadata not provided) */
    completionText?: string
    /** Explicit prompt token count (overrides promptText estimation) */
    promptTokens?: number
    /** Explicit completion token count (overrides completionText estimation) */
    completionTokens?: number
    /** Token metadata from LLM response (overrides all other token sources) */
    tokenMetadata?: TokenMetadata
}

/**
 * Telemetry payload for AI cost estimation.
 * Contains all data needed to emit AI.Cost.Estimated event (no raw text included).
 */
export interface AICostTelemetryPayload {
    /** AI model identifier */
    modelId: string
    /** Prompt token count (clamped to non-negative) */
    promptTokens: number
    /** Completion token count (clamped to non-negative) */
    completionTokens: number
    /** Estimated cost in microdollars (USD * 1,000,000) */
    estimatedCostMicros: number
    /** Token bucket for prompt tokens */
    promptBucket: TokenBucket
    /** Token bucket for completion tokens */
    completionBucket: TokenBucket
    /** Pricing source: 'model' if model found, 'fallback' otherwise */
    pricingSource: 'model' | 'fallback'
    /** Token estimator name (e.g., 'charDiv4', 'production') */
    estimator: string
    /** True if estimator is not 'production' (simulation mode) */
    simulation: boolean
    /** True if negative tokens were clamped (requires AI.Cost.InputAdjusted event) */
    hadNegativeTokens: boolean
    /** Original prompt tokens before clamping (only if hadNegativeTokens is true) */
    originalPromptTokens?: number
    /** Original completion tokens before clamping (only if hadNegativeTokens is true) */
    originalCompletionTokens?: number
    /** Number of cached tokens (from TokenMetadata when available) */
    cachedTokens?: number
}

/**
 * Prepare AI cost telemetry payload for emission.
 * Accepts text (for estimation), explicit token counts, or real token metadata from LLM responses.
 * Clamps negative tokens and marks payload for AI.Cost.InputAdjusted emission.
 *
 * This function performs all calculation and data preparation but does NOT emit telemetry.
 * Backend consumers should emit AI.Cost.Estimated (always) and AI.Cost.InputAdjusted (if hadNegativeTokens).
 *
 * @param options - Cost telemetry preparation options
 * @returns Complete telemetry payload ready for emission (privacy-safe, no raw text)
 */
export function prepareAICostTelemetry(options: PrepareAICostTelemetryOptions): AICostTelemetryPayload {
    const { modelId, promptText, completionText, tokenMetadata } = options

    // If tokenMetadata is provided, use it (takes precedence over all other sources)
    if (tokenMetadata) {
        const result = calculateCost(modelId, tokenMetadata.promptTokens, tokenMetadata.completionTokens)

        return {
            modelId,
            promptTokens: tokenMetadata.promptTokens,
            completionTokens: tokenMetadata.completionTokens,
            estimatedCostMicros: result.estimatedCostMicros,
            promptBucket: result.promptBucket,
            completionBucket: result.completionBucket,
            pricingSource: result.pricingSource,
            estimator: tokenMetadata.estimatorName,
            simulation: tokenMetadata.estimatorName !== 'production',
            hadNegativeTokens: false, // Metadata from LLM should never have negative tokens
            cachedTokens: tokenMetadata.cachedTokens
        }
    }

    // Fall back to estimation or explicit token counts
    // Create estimator for text-based inputs
    const estimator = createCharDiv4Estimator()

    // Determine token counts (explicit or estimated)
    let promptTokens: number
    let completionTokens: number

    if (options.promptTokens !== undefined) {
        promptTokens = options.promptTokens
    } else if (promptText !== undefined) {
        promptTokens = estimator.estimate(promptText)
    } else {
        promptTokens = 0
    }

    if (options.completionTokens !== undefined) {
        completionTokens = options.completionTokens
    } else if (completionText !== undefined) {
        completionTokens = estimator.estimate(completionText)
    } else {
        completionTokens = 0
    }

    // Check for negative values
    const hadNegativeTokens = promptTokens < 0 || completionTokens < 0
    const originalPromptTokens = promptTokens < 0 ? promptTokens : undefined
    const originalCompletionTokens = completionTokens < 0 ? completionTokens : undefined

    // Calculate cost (clamping happens inside)
    const result = calculateCost(modelId, promptTokens, completionTokens)

    return {
        modelId,
        promptTokens: Math.max(0, promptTokens),
        completionTokens: Math.max(0, completionTokens),
        estimatedCostMicros: result.estimatedCostMicros,
        promptBucket: result.promptBucket,
        completionBucket: result.completionBucket,
        pricingSource: result.pricingSource,
        estimator: estimator.name,
        simulation: estimator.name !== 'production',
        hadNegativeTokens,
        originalPromptTokens,
        originalCompletionTokens
    }
}
