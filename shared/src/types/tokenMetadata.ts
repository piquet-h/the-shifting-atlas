/**
 * Token metadata collection types for AI cost telemetry.
 *
 * Provides types and interfaces for collecting token usage metadata from LLM responses,
 * enabling accurate cost calculation and telemetry tracking.
 *
 * @module types/tokenMetadata
 */

/**
 * Token usage metadata from an LLM response.
 *
 * Captures token counts returned by the LLM API for cost calculation and telemetry.
 * Supports both estimated (heuristic) and actual (production) token counts.
 */
export interface TokenMetadata {
    /** Model identifier (e.g., 'gpt-4o-mini', 'generic') */
    modelId: string

    /** Number of prompt (input) tokens consumed */
    promptTokens: number

    /** Number of completion (output) tokens generated */
    completionTokens: number

    /** Total tokens (promptTokens + completionTokens) */
    totalTokens: number

    /** Estimator name or 'production' for real token counts */
    estimatorName: string

    /**
     * Number of cached prompt tokens (optional).
     * Only present when prompt caching is enabled and cached tokens are detected.
     * Should not exceed promptTokens.
     */
    cachedTokens?: number
}

/**
 * Interface for collecting token metadata from LLM responses.
 *
 * Implementations aggregate token counts into TokenMetadata for telemetry emission.
 */
export interface TokenMetadataCollector {
    /**
     * Collect token metadata from LLM response.
     *
     * @param modelId - Model identifier (e.g., 'gpt-4o-mini')
     * @param promptTokens - Number of prompt (input) tokens
     * @param completionTokens - Number of completion (output) tokens
     * @param estimatorName - Estimator name or 'production' for real counts
     * @param cachedTokens - Optional number of cached tokens (prompt cache hits)
     * @returns TokenMetadata object for telemetry emission
     */
    collect(modelId: string, promptTokens: number, completionTokens: number, estimatorName: string, cachedTokens?: number): TokenMetadata
}
