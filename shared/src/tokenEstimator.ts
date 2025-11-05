/**
 * AI Cost Telemetry: Token Estimation Strategy & Interface
 *
 * Provides pluggable token estimation interface with initial heuristic implementation.
 * Abstracts token counting so real tokenizer can replace heuristic without changes
 * to cost calculation or telemetry schema.
 *
 * ## Usage
 *
 * ```typescript
 * import { createCharDiv4Estimator } from '@piquet-h/shared'
 *
 * const estimator = createCharDiv4Estimator()
 * const tokens = estimator.estimate("Hello, world!")
 * console.log(`Estimated tokens: ${tokens}`)
 * console.log(`Estimator name: ${estimator.name}`) // 'charDiv4'
 * ```
 *
 * ## Simulation Flag
 *
 * When `estimator.name !== 'production'`, downstream consumers should treat cost estimates
 * as approximations for budget planning only, not billing. Current heuristic estimator
 * uses name 'charDiv4' indicating simulation mode.
 *
 * Future production tokenizer integration will use name 'production' to signal
 * real token counts suitable for billing reconciliation.
 *
 * ## Input Capping
 *
 * Excessively long inputs (>MAX_SIM_PROMPT_CHARS) are clamped to prevent token explosion.
 * Capping triggers AI.Cost.InputCapped telemetry event (registered in #299).
 * Clamping happens at call site (not in estimator itself) to allow telemetry emission.
 *
 * @module tokenEstimator
 */

/**
 * Maximum characters for simulated prompt input before capping.
 * Prevents token explosion in heuristic estimation mode.
 *
 * Value chosen to approximate 32K tokens at charDiv4 ratio (128K chars / 4 = 32K tokens).
 * Real tokenizer integration may adjust or remove this limit.
 */
export const MAX_SIM_PROMPT_CHARS = 128_000

/**
 * Token estimation strategy interface.
 * Implementations provide approximate or exact token counts for AI cost calculation.
 */
export interface TokenEstimator {
    /**
     * Estimate token count for given text input.
     * Must handle empty strings (return 0) and Unicode correctly.
     *
     * @param text - Input text to estimate tokens for
     * @returns Estimated token count (non-negative integer)
     */
    estimate(text: string): number

    /**
     * Estimator name/identifier for telemetry and simulation flag.
     *
     * - 'production': Real tokenizer, suitable for billing
     * - Other values: Heuristic/simulation mode, approximations only
     */
    readonly name: string
}

/**
 * Heuristic token estimator using character count divided by 4.
 *
 * Approximation based on OpenAI's rough guidance that 1 token ≈ 4 characters for English text.
 * Handles Unicode correctly by counting UTF-16 code units (JavaScript string length).
 *
 * Edge cases:
 * - Empty string → 0 tokens
 * - Unicode surrogate pairs (emoji) count correctly (2 code units per pair)
 * - Mixed newline/tab/space handled consistently (counted as characters)
 *
 * This is NOT a real tokenizer and should not be used for billing.
 * Intended for budget threshold alerting and cost projection only.
 */
class CharDiv4Estimator implements TokenEstimator {
    readonly name = 'charDiv4'

    estimate(text: string): number {
        if (text.length === 0) {
            return 0
        }

        // Divide by 4 and round up to avoid underestimating
        // (better to over-warn than under-warn for budget thresholds)
        return Math.ceil(text.length / 4)
    }
}

/**
 * Create default heuristic token estimator (charDiv4).
 *
 * @returns CharDiv4Estimator instance
 */
export function createCharDiv4Estimator(): TokenEstimator {
    return new CharDiv4Estimator()
}
