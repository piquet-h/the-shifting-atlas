/**
 * AI Description Service
 *
 * Provides batched location description generation using Azure OpenAI.
 * Supports up to 20 locations per batch with cost tracking and fallback to template-based descriptions.
 *
 * Features:
 * - Batch generation (1-20 locations per request)
 * - Terrain-guided prompt construction
 * - Exponential backoff retry (3 attempts)
 * - Cost calculation per location
 * - Telemetry for batch operations and failures
 * - Template fallback on persistent errors
 *
 * Configuration:
 * - Model: GPT-4 (from Azure OpenAI client config)
 * - Temperature: 0.7 (narrative creativity)
 * - Max tokens: 200 per location (~50-70 words)
 *
 * See: docs/architecture/world-spatial-generation-architecture.md (Section 2)
 */

import { injectable, inject, optional } from 'inversify'
import type { Direction, TerrainType } from '@piquet-h/shared'
import { getTerrainGuidance } from '@piquet-h/shared'
import { prepareAICostTelemetry } from '@piquet-h/shared'
import type { ILayerRepository } from '../repos/layerRepository.js'
import type { IAzureOpenAIClient } from './azureOpenAIClient.js'
import { TOKENS } from '../di/tokens.js'
import type { TelemetryService } from '../telemetry/TelemetryService.js'

/** Maximum number of locations allowed in a single batch request */
const MAX_BATCH_SIZE = 20

/** Maximum tokens per location description (~50-70 words) */
const MAX_TOKENS_PER_LOCATION = 200

/** Temperature for AI generation (0.7 for narrative creativity) */
const GENERATION_TEMPERATURE = 0.7

/** Maximum retry attempts for transient errors */
const MAX_RETRY_ATTEMPTS = 3

/** Initial retry delay in milliseconds */
const INITIAL_RETRY_DELAY_MS = 1000

/**
 * Description style for batch generation.
 * Determines tone and verbosity of generated descriptions.
 */
export type DescriptionStyle = 'concise' | 'atmospheric' | 'utilitarian'

/**
 * Single location request for batch generation.
 * Contains all context needed to generate a spatially-aware description.
 */
export interface LocationDescriptionRequest {
    /** Unique location identifier */
    locationId: string
    /** Terrain type (influences spatial affordances) */
    terrain: TerrainType
    /** Direction player arrives from */
    arrivalDirection: Direction
    /** Exit directions that should be mentioned in description */
    neighbors: Direction[]
    /** Optional narrative context (currently unused per agent instructions) */
    narrativeContext?: {
        weather?: string
        time?: string
        recentEvents?: string
    }
}

/**
 * Batch description request containing multiple locations.
 * Max batch size: 20 locations.
 */
export interface BatchDescriptionRequest {
    /** Array of locations to generate descriptions for (1-20 locations) */
    locations: LocationDescriptionRequest[]
    /** Description style (tone and verbosity) */
    style: DescriptionStyle
}

/**
 * Generated description result for a single location.
 * Includes cost tracking and token usage.
 */
export interface GeneratedDescription {
    /** Location identifier (matches request) */
    locationId: string
    /** Generated description text (2-3 sentences) */
    description: string
    /** Cost in USD for this description */
    cost: number
    /** Total tokens used (prompt + completion) */
    tokensUsed: number
    /** Model used for generation */
    model: string
}

/**
 * AI Description Service Interface
 */
export interface IAIDescriptionService {
    /**
     * Generate descriptions for multiple locations in a single batch.
     * Uses Azure OpenAI with retry logic and fallback to templates on failure.
     *
     * @param request - Batch description request (1-20 locations)
     * @returns Array of generated descriptions with cost tracking
     * @throws Error if batch size exceeds 20 locations
     */
    batchGenerateDescriptions(request: BatchDescriptionRequest): Promise<GeneratedDescription[]>
}

/**
 * AI Description Service Implementation
 * Uses Azure OpenAI client for batch generation with cost tracking.
 */
@injectable()
export class AIDescriptionService implements IAIDescriptionService {
    constructor(
        @inject(TOKENS.AzureOpenAIClient) private aiClient: IAzureOpenAIClient,
        @inject('TelemetryService') private telemetry: TelemetryService,
        @inject(TOKENS.LayerRepository) @optional() private layerRepository?: ILayerRepository
    ) {}

    async batchGenerateDescriptions(request: BatchDescriptionRequest): Promise<GeneratedDescription[]> {
        // Validate batch size
        if (request.locations.length > MAX_BATCH_SIZE) {
            throw new Error(`Batch size exceeds maximum of ${MAX_BATCH_SIZE} locations (got ${request.locations.length})`)
        }

        const results: GeneratedDescription[] = []
        let totalTokens = 0
        let totalCost = 0
        const startTime = Date.now()

        // Generate description for each location (sequential for now; could be parallelized)
        for (const location of request.locations) {
            const description = await this.generateSingleDescription(location, request.style)
            results.push(description)
            totalTokens += description.tokensUsed
            totalCost += description.cost

            // Persist generated description as base layer (if repository available)
            if (this.layerRepository) {
                await this.persistBaseLayer(location.locationId, description, location.terrain, request.style)
            }
        }

        const avgLatencyMs = (Date.now() - startTime) / request.locations.length

        // Emit telemetry for batch operation
        this.telemetry.trackGameEvent('AI.Description.BatchGenerated', {
            requestCount: request.locations.length,
            totalTokens,
            totalCost,
            model: results[0]?.model || 'unknown',
            avgLatencyMs,
            style: request.style
        })

        return results
    }

    /**
     * Generate description for a single location with retry logic.
     * Falls back to template-based description on persistent failure.
     */
    private async generateSingleDescription(location: LocationDescriptionRequest, style: DescriptionStyle): Promise<GeneratedDescription> {
        // Attempt generation with retries
        for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
            const result = await this.attemptGeneration(location, style)
            if (result) {
                return result
            }

            // Exponential backoff before retry
            if (attempt < MAX_RETRY_ATTEMPTS - 1) {
                await this.sleep(INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt))
            }
        }

        // All retries failed - fall back to template
        this.telemetry.trackGameEvent('AI.Description.Fallback', {
            locationId: location.locationId,
            terrain: location.terrain,
            reason: 'max-retries-exceeded'
        })

        return this.generateTemplateFallback(location)
    }

    /**
     * Attempt to generate description using AI client.
     * Returns null on failure (for retry logic).
     */
    private async attemptGeneration(location: LocationDescriptionRequest, style: DescriptionStyle): Promise<GeneratedDescription | null> {
        const prompt = this.buildLocationPrompt(location, style)

        const result = await this.aiClient.generate({
            prompt,
            maxTokens: MAX_TOKENS_PER_LOCATION,
            temperature: GENERATION_TEMPERATURE,
            timeoutMs: 30000
        })

        if (!result) {
            return null
        }

        // Calculate cost using shared cost calculator
        const costData = prepareAICostTelemetry({
            modelId: 'gpt-4', // Model identifier for cost calculation
            promptTokens: result.tokenUsage.prompt,
            completionTokens: result.tokenUsage.completion
        })

        return {
            locationId: location.locationId,
            description: result.content,
            cost: costData.estimatedCostMicros / 1_000_000, // Convert microdollars to USD
            tokensUsed: result.tokenUsage.total,
            model: 'gpt-4'
        }
    }

    /**
     * Build AI prompt for location description generation.
     * Incorporates terrain guidance, arrival direction, and exit requirements.
     *
     * Per agent instructions: descriptions should be objective without temporal/weather elements.
     */
    private buildLocationPrompt(location: LocationDescriptionRequest, style: DescriptionStyle): string {
        const guidance = getTerrainGuidance(location.terrain)
        const exitList = location.neighbors.join(', ')

        // Build style-specific instructions
        let styleInstructions = ''
        switch (style) {
            case 'concise':
                styleInstructions = '2-3 sentences, clear and direct'
                break
            case 'atmospheric':
                styleInstructions = '2-3 sentences, evocative and immersive'
                break
            case 'utilitarian':
                styleInstructions = '1-2 sentences, functional and minimal'
                break
        }

        // Construct prompt (objective, no temporal/weather elements per agent instructions)
        return `Describe a ${location.terrain} location in a fantasy world.
Player arrives from ${location.arrivalDirection}.
Exits should exist toward: ${exitList}.

Terrain guidance: ${guidance.promptHint}

Requirements:
- ${styleInstructions}
- Mention each exit direction naturally (e.g., "To the east, a creek...")
- Justify spatial affordances (why can player go that direction?)
- No mechanics or stats, pure narrative
- Be objective: no temporal elements, no weather conditions, no time-of-day references
- Focus on permanent physical features and spatial relationships

Example: "Windswept moorland stretches endlessly beneath vast sky. To the south, timber gates are visible. Eastward, a creek cuts through the heath. West, dark forest marks the wilderness edge."`
    }

    /**
     * Generate template-based fallback description.
     * Used when AI generation fails after all retries.
     */
    private generateTemplateFallback(location: LocationDescriptionRequest): GeneratedDescription {
        const exitList = location.neighbors.join(', ')
        const terrainName = location.terrain.replace('-', ' ')

        const description = `A ${terrainName} area. You arrive from ${location.arrivalDirection}. Paths lead ${exitList}.`

        return {
            locationId: location.locationId,
            description,
            cost: 0,
            tokensUsed: 0,
            model: 'template-fallback'
        }
    }

    /**
     * Sleep utility for exponential backoff.
     */
    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms))
    }

    /**
     * Persist generated description as a base layer in the layer repository.
     * Base layers are indefinite (fromTick=0, toTick=null) and include generation metadata.
     *
     * @param locationId - Location identifier
     * @param description - Generated description result
     * @param terrain - Terrain type used for generation
     * @param style - Description style used
     */
    private async persistBaseLayer(
        locationId: string,
        description: GeneratedDescription,
        terrain: TerrainType,
        style: DescriptionStyle
    ): Promise<void> {
        if (!this.layerRepository) {
            return
        }

        const startTime = Date.now()

        try {
            await this.layerRepository.setLayerForLocation(
                locationId,
                'base',
                0, // effectiveFromTick: start at world tick 0
                null, // effectiveToTick: indefinite
                description.description,
                {
                    // Metadata for provenance and debugging
                    model: description.model,
                    style,
                    terrain,
                    tokensUsed: description.tokensUsed,
                    cost: description.cost,
                    generatedAt: new Date().toISOString()
                }
            )

            this.telemetry.trackGameEvent('AI.Description.BaseLayerPersisted', {
                locationId,
                layerType: 'base',
                model: description.model,
                latencyMs: Date.now() - startTime
            })
        } catch (error) {
            // Log persistence failure but don't fail the batch operation
            this.telemetry.trackGameEvent('AI.Description.BaseLayerPersistFailed', {
                locationId,
                error: error instanceof Error ? error.message : String(error),
                latencyMs: Date.now() - startTime
            })
        }
    }
}
