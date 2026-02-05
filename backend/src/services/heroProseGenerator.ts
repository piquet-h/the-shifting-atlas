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

import { enrichHeroProseAttributes } from '@piquet-h/shared'
import { inject, injectable } from 'inversify'
import { createHash } from 'node:crypto'
import type { ILayerRepository } from '../repos/layerRepository.js'
import { TelemetryService } from '../telemetry/TelemetryService.js'
import type { AzureOpenAIClientConfig, IAzureOpenAIClient } from './azureOpenAIClient.js'
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
        @inject(TelemetryService) private telemetry: TelemetryService,
        @inject('AzureOpenAIClientConfig') private config: AzureOpenAIClientConfig
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

        try {
            // Check for existing hero prose layer (cache hit)
            // NOTE: getLayersForLocation is deprecated; use scope-based history queries.
            const existingDynamic = await this.layerRepo.queryLayerHistory(`loc:${locationId}`, 'dynamic')
            const existingHero = selectHeroProse(existingDynamic)

            if (existingHero && existingHero.value) {
                const props = {}
                enrichHeroProseAttributes(props, {
                    locationId,
                    latencyMs: Date.now() - startTime
                })
                this.telemetry.trackGameEvent('Description.Hero.CacheHit', props)
                return {
                    success: true,
                    prose: existingHero.value,
                    reason: 'cache-hit'
                }
            }

            // Cache miss - need to generate
            const cacheMissLatency = Date.now() - startTime
            const cacheMissProps = {}
            enrichHeroProseAttributes(cacheMissProps, {
                locationId,
                latencyMs: cacheMissLatency
            })
            this.telemetry.trackGameEvent('Description.Hero.CacheMiss', cacheMissProps)

            // Check if Azure OpenAI is configured
            if (!this.config.endpoint) {
                const configMissingProps = {}
                enrichHeroProseAttributes(configMissingProps, {
                    locationId,
                    outcomeReason: 'config-missing',
                    latencyMs: Date.now() - startTime
                })
                this.telemetry.trackGameEvent('Description.Hero.GenerateFailure', configMissingProps)
                return {
                    success: false,
                    reason: 'error'
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
                const timeoutProps = {}
                enrichHeroProseAttributes(timeoutProps, {
                    locationId,
                    latencyMs,
                    outcomeReason: 'timeout',
                    model: this.config.model
                })
                this.telemetry.trackGameEvent('Description.Hero.GenerateFailure', timeoutProps)
                return {
                    success: false,
                    reason: 'timeout'
                }
            }

            // Handle generation failure (null result from OpenAI client)
            if (!result) {
                const errorProps = {}
                enrichHeroProseAttributes(errorProps, {
                    locationId,
                    outcomeReason: 'error',
                    latencyMs,
                    model: this.config.model
                })
                this.telemetry.trackGameEvent('Description.Hero.GenerateFailure', errorProps)
                return {
                    success: false,
                    reason: 'error'
                }
            }

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
                this.telemetry.trackGameEvent('Description.Hero.GenerateFailure', invalidProps)
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

            const successProps = {}
            enrichHeroProseAttributes(successProps, {
                locationId,
                latencyMs,
                model: this.config.model,
                tokenUsage: result.tokenUsage.total
            })
            this.telemetry.trackGameEvent('Description.Hero.GenerateSuccess', successProps)

            return {
                success: true,
                prose,
                reason: 'generated',
                tokenUsage: result.tokenUsage
            }
        } catch (error) {
            const latencyMs = Date.now() - startTime
            const errorProps = {
                error: error instanceof Error ? error.message : String(error)
            }
            enrichHeroProseAttributes(errorProps, {
                locationId,
                outcomeReason: 'error',
                latencyMs,
                model: this.config.endpoint ? this.config.model : undefined
            })
            this.telemetry.trackGameEvent('Description.Hero.GenerateFailure', errorProps)
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
