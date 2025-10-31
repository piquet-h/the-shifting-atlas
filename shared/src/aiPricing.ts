/**
 * AI Cost Telemetry: Static pricing table with JSON override infrastructure.
 *
 * Provides configurable per-1K token pricing (prompt + completion) for AI model cost estimation.
 * Pricing rates enable pre-integration cost projection and budget threshold alerting.
 *
 * ## Usage
 *
 * ```typescript
 * import { getPricing } from '@piquet-h/shared'
 *
 * const pricing = getPricing('gpt-4o-mini')
 * console.log(`Prompt: $${pricing.promptPer1k}, Completion: $${pricing.completionPer1k}`)
 * // If model not found, returns 'generic' fallback with original modelId preserved
 * ```
 *
 * ## Runtime Override (Backend Integration)
 *
 * Backend can read AI_PRICING_JSON environment variable and apply override at startup:
 *
 * ```typescript
 * // In backend initialization (e.g., app.ts or startup.ts)
 * const overrideJson = getEnvironmentVariable('AI_PRICING_JSON')
 * if (overrideJson) {
 *     const result = applyPricingOverride(overrideJson)
 *     if (!result.success) {
 *         // Emit AI.Cost.OverrideRejected telemetry with result.reason
 *     }
 * }
 * ```
 *
 * Malformed JSON triggers rejection with detailed reason.
 * Empty/whitespace string is treated as no override (no error).
 *
 * ## Error Handling
 *
 * - Invalid JSON format → Override rejected, default pricing used
 * - Missing numeric fields → Override rejected, default pricing used
 * - Negative values → Override rejected, default pricing used
 * - Unknown modelId in lookup → Returns 'generic' fallback, preserves original modelId
 *
 * @module aiPricing
 */

/**
 * Per-model pricing rates for AI token costs (USD per 1000 tokens).
 * Separate rates for prompt (input) and completion (output) tokens.
 */
export interface ModelPricing {
    /** Model identifier (e.g., 'gpt-4o-mini', 'generic') */
    modelId: string
    /** Cost per 1000 prompt (input) tokens in USD */
    promptPer1k: number
    /** Cost per 1000 completion (output) tokens in USD */
    completionPer1k: number
}

/**
 * Default pricing table for AI models.
 * Includes 'generic' fallback and sample production model.
 *
 * Pricing sources:
 * - OpenAI pricing page (as of 2024-10-31)
 * - Generic fallback: median of common models
 */
const DEFAULT_PRICING: Record<string, ModelPricing> = {
    generic: {
        modelId: 'generic',
        promptPer1k: 0.0015,
        completionPer1k: 0.002
    },
    'gpt-4o-mini': {
        modelId: 'gpt-4o-mini',
        promptPer1k: 0.00015,
        completionPer1k: 0.0006
    }
}

/**
 * Runtime pricing table (default + runtime overrides).
 * Mutable to support backend initialization with environment overrides.
 */
let PRICING: Record<string, ModelPricing> = { ...DEFAULT_PRICING }

/**
 * Result of applying a pricing override.
 */
export interface PricingOverrideResult {
    /** True if override was successfully applied */
    success: boolean
    /** Reason for rejection if success is false, null otherwise */
    reason: string | null
}

/**
 * Parse and merge pricing override JSON into pricing table.
 * This function is called by backend at startup with AI_PRICING_JSON environment variable.
 *
 * @param overrideJson - JSON string containing pricing overrides
 * @returns Result indicating success or rejection reason
 */
export function applyPricingOverride(overrideJson: string | undefined): PricingOverrideResult {
    // Empty or missing value → no override, no error
    if (!overrideJson || overrideJson.trim() === '') {
        return { success: true, reason: null }
    }

    try {
        const override = JSON.parse(overrideJson)

        // Validate override structure
        if (typeof override !== 'object' || override === null || Array.isArray(override)) {
            return {
                success: false,
                reason: 'Pricing override must be an object mapping modelId to pricing'
            }
        }

        // Validate each model entry
        for (const [modelId, pricing] of Object.entries(override)) {
            const p = pricing as unknown

            if (typeof p !== 'object' || p === null) {
                return {
                    success: false,
                    reason: `Invalid pricing entry for model '${modelId}': must be an object`
                }
            }

            const candidate = p as Record<string, unknown>

            if (typeof candidate.promptPer1k !== 'number' || typeof candidate.completionPer1k !== 'number') {
                return {
                    success: false,
                    reason: `Invalid pricing entry for model '${modelId}': promptPer1k and completionPer1k must be numbers`
                }
            }

            if (candidate.promptPer1k < 0 || candidate.completionPer1k < 0) {
                return {
                    success: false,
                    reason: `Invalid pricing entry for model '${modelId}': pricing must be non-negative`
                }
            }
        }

        // Merge override into pricing table (overwrite existing keys)
        for (const [modelId, pricing] of Object.entries(override)) {
            const p = pricing as Record<string, number>
            PRICING[modelId] = {
                modelId,
                promptPer1k: p.promptPer1k,
                completionPer1k: p.completionPer1k
            }
        }

        return { success: true, reason: null }
    } catch (err) {
        return {
            success: false,
            reason: `Failed to parse pricing override JSON: ${err instanceof Error ? err.message : String(err)}`
        }
    }
}

/**
 * Get pricing for a specific AI model.
 * Falls back to 'generic' pricing if model not found.
 *
 * @param modelId - Model identifier (e.g., 'gpt-4o-mini')
 * @returns Pricing information (with original modelId preserved if fallback used)
 */
export function getPricing(modelId: string): ModelPricing {
    const pricing = PRICING[modelId]

    if (pricing) {
        return pricing
    }

    // Fallback to generic pricing, preserve original modelId for telemetry
    const fallback = PRICING['generic']
    return {
        ...fallback,
        modelId // Preserve original modelId for telemetry tracking
    }
}

/**
 * Get all registered model IDs in the current pricing table.
 * Useful for diagnostics and validation.
 *
 * @returns Array of model IDs
 */
export function getRegisteredModelIds(): string[] {
    return Object.keys(PRICING)
}

/**
 * Reset pricing table to defaults (for testing only).
 * @internal
 */
export function _resetPricingForTests(): void {
    PRICING = { ...DEFAULT_PRICING }
}
