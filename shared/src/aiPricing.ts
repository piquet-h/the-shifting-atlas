/**
 * Static AI pricing with optional JSON overrides.
 * Use `getPricing(modelId)`; backend may call `applyPricingOverride(json)` at startup.
 */

/** Per‑model pricing (USD per 1000 tokens). */
export interface ModelPricing {
    /** Model identifier (e.g., 'gpt-4o-mini', 'generic') */
    modelId: string
    /** Cost per 1000 prompt (input) tokens in USD */
    promptPer1k: number
    /** Cost per 1000 completion (output) tokens in USD */
    completionPer1k: number
}

/** Default pricing (includes 'generic' fallback). */
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

/** Runtime pricing (defaults + overrides). */
let PRICING: Record<string, ModelPricing> = { ...DEFAULT_PRICING }

/** Result of a pricing override application. */
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
    // Empty or missing → no override
    if (!overrideJson || overrideJson.trim() === '') {
        return { success: true, reason: null }
    }

    try {
        const override = JSON.parse(overrideJson)

        // Validate structure
        if (typeof override !== 'object' || override === null || Array.isArray(override)) {
            return {
                success: false,
                reason: 'Pricing override must be an object mapping modelId to pricing'
            }
        }

        // Validate each entry
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

        // Merge (overwrite existing keys)
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

/** Get pricing for modelId; falls back to 'generic' but preserves original modelId. */
export function getPricing(modelId: string): ModelPricing {
    const pricing = PRICING[modelId]

    if (pricing) {
        return pricing
    }

    // Fallback, preserve original modelId
    const fallback = PRICING['generic']
    return {
        ...fallback,
        modelId // Preserve original modelId for telemetry tracking
    }
}

/** Get all registered model IDs. */
export function getRegisteredModelIds(): string[] {
    return Object.keys(PRICING)
}

/** Reset to defaults (testing only). */
export function _resetPricingForTests(): void {
    PRICING = { ...DEFAULT_PRICING }
}
