/**
 * Hero Prose Generator Service
 *
 * Generates AI-crafted opening prose for locations using Azure OpenAI.
 * Handles prompt construction, generation timeout, and fallback behavior.
 *
 * Design:
 * - Bounded blocking: Configurable timeout budget (default 1200ms)
 * - Fallback-first: Always returns gracefully on timeout/error (no exceptions)
 * - Cache-aware: Checks for existing hero prose before attempting generation
 * - Idempotent: Uses promptHash to prevent duplicate generations
 *
 * See: docs/architecture/hero-prose-layer-convention.md
 */

import { inject, injectable } from 'inversify'
import { createHash } from 'node:crypto'
import type { ILayerRepository } from '../repos/layerRepository.js'
import { TelemetryService } from '../telemetry/TelemetryService.js'
import type { IAzureOpenAIClient } from './azureOpenAIClient.js'
import { selectHeroProse } from './heroProse.js'

export interface GenerateHeroProseOptions {
    locationId: string
    locationName: string
    baseDescription: string
    /**
     * Strict timeout budget in milliseconds (default: 1200ms)
     * Ensures HTTP response latency p95 stays under 500ms
     */
    timeoutMs?: number
}

export interface HeroProseGenerationResult {
    success: boolean
    prose?: string
    reason?: 'cache-hit' | 'generated' | 'timeout' | 'error' | 'invalid-response'
    tokenUsage?: {
        prompt: number
        completion: number
        total: number
    }
}

/**
 * Hero Prose Generator
 * Generates and caches AI-crafted location descriptions
 */
@injectable()
export class HeroProseGenerator {
    private readonly DEFAULT_TIMEOUT_MS = 1200

    constructor(
        @inject('IAzureOpenAIClient') private openaiClient: IAzureOpenAIClient,
        @inject('ILayerRepository') private layerRepo: ILayerRepository,
        @inject(TelemetryService) private telemetry: TelemetryService
    ) {}

    /**
     * Generate hero prose for a location with cache awareness
     *
     * @param options Location data and configuration
     * @returns Generation result with prose or fallback reason
     */
    async generateHeroProse(options: GenerateHeroProseOptions): Promise<HeroProseGenerationResult> {
        const { locationId, locationName, baseDescription, timeoutMs = this.DEFAULT_TIMEOUT_MS } = options
        const startTime = Date.now()

        this.telemetry.trackGameEvent('Description.HeroProse.Generate.Start', {
            locationId,
            locationName,
            timeoutMs
        })

        try {
            // Check for existing hero prose layer (cache hit)
            // NOTE: getLayersForLocation is deprecated; use scope-based history queries.
            const existingDynamic = await this.layerRepo.queryLayerHistory(`loc:${locationId}`, 'dynamic')
            const existingHero = selectHeroProse(existingDynamic)

            if (existingHero && existingHero.value) {
                this.telemetry.trackGameEvent('Description.HeroProse.Generate.CacheHit', {
                    locationId,
                    latencyMs: Date.now() - startTime
                })
                return {
                    success: true,
                    prose: existingHero.value,
                    reason: 'cache-hit'
                }
            }

            // Build prompt for generation
            const prompt = this.buildPrompt(locationName, baseDescription)
            const promptHash = this.hashPrompt(prompt)

            // Attempt generation with timeout
            const result = await this.openaiClient.generate({
                prompt,
                maxTokens: 200,
                temperature: 0.8,
                timeoutMs
            })

            const latencyMs = Date.now() - startTime

            // Handle timeout
            if (latencyMs >= timeoutMs) {
                this.telemetry.trackGameEvent('Description.HeroProse.Generate.Timeout', {
                    locationId,
                    latencyMs,
                    timeoutMs
                })
                return {
                    success: false,
                    reason: 'timeout'
                }
            }

            // Handle generation failure
            if (!result) {
                this.telemetry.trackGameEvent('Description.HeroProse.Generate.Failure', {
                    locationId,
                    reason: 'openai-error',
                    latencyMs
                })
                return {
                    success: false,
                    reason: 'error'
                }
            }

            // Validate generated prose
            const prose = result.content.trim()
            if (!prose || prose.length > 1200) {
                this.telemetry.trackGameEvent('Description.HeroProse.Generate.Failure', {
                    locationId,
                    reason: 'invalid-content',
                    contentLength: prose.length,
                    latencyMs
                })
                return {
                    success: false,
                    reason: 'invalid-response'
                }
            }

            // Persist as hero layer
            await this.layerRepo.setLayerForLocation(
                locationId,
                'dynamic',
                0, // fromTick (immediate)
                null, // toTick (indefinite)
                prose,
                {
                    replacesBase: true,
                    role: 'hero',
                    promptHash
                }
            )

            this.telemetry.trackGameEvent('Description.HeroProse.Generate.Success', {
                locationId,
                contentLength: prose.length,
                promptHash,
                tokenUsage: result.tokenUsage.total,
                latencyMs
            })

            return {
                success: true,
                prose,
                reason: 'generated',
                tokenUsage: result.tokenUsage
            }
        } catch (error) {
            const latencyMs = Date.now() - startTime
            this.telemetry.trackGameEvent('Description.HeroProse.Generate.Failure', {
                locationId,
                reason: 'unexpected-error',
                error: error instanceof Error ? error.message : String(error),
                latencyMs
            })
            return {
                success: false,
                reason: 'error'
            }
        }
    }

    /**
     * Build prompt for hero prose generation
     * Instructs the model to create vivid, atmospheric prose
     */
    private buildPrompt(locationName: string, baseDescription: string): string {
        return `You are a fantasy world writer. Create a single vivid paragraph of hero prose for a location.

Location: ${locationName}
Base description: ${baseDescription}

Write 1-2 sentences of atmospheric, vivid prose (max 200 tokens) that enhances the base description. Focus on sensory details, mood, and ambiance. Do not introduce new structural facts or entities.`
    }

    /**
     * Hash prompt for idempotency tracking
     */
    private hashPrompt(prompt: string): string {
        return createHash('sha256').update(prompt).digest('hex').slice(0, 8)
    }
}
