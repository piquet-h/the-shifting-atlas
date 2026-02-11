/**
 * Location Look Handler
 *
 * Returns location data with compiled description.
 * Backend owns composition logic using DescriptionComposer service.
 *
 * Response includes:
 * - description.text: Compiled markdown text
 * - description.html: Sanitized HTML version
 * - description.provenance: Metadata about layers applied and compilation timestamp
 */
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { buildExitInfoArray, Direction, STARTER_LOCATION_ID } from '@piquet-h/shared'
import type { Container } from 'inversify'
import { inject, injectable } from 'inversify'
import { checkRateLimit } from '../middleware/rateLimitMiddleware.js'
import { rateLimiters } from '../middleware/rateLimiter.js'
import { ExitEdgeResult, generateExitsSummaryCache } from '../repos/exitRepository.js'
import type { ILocationRepository } from '../repos/locationRepository.js'
import { DescriptionComposer } from '../services/descriptionComposer.js'
import { HeroProseGenerator } from '../services/heroProseGenerator.js'
import type { ViewContext } from '../services/types.js'
import type { ITelemetryClient } from '../telemetry/ITelemetryClient.js'
import { BaseHandler } from './base/BaseHandler.js'
import { errorResponse, okResponse } from './utils/responseBuilder.js'
import { isValidGuid } from './utils/validation.js'

@injectable()
export class LocationLookHandler extends BaseHandler {
    constructor(
        @inject('ITelemetryClient') telemetry: ITelemetryClient,
        @inject('ILocationRepository') private locationRepo: ILocationRepository,
        @inject(DescriptionComposer) private descriptionComposer: DescriptionComposer,
        @inject(HeroProseGenerator) private heroProseGenerator: HeroProseGenerator
    ) {
        super(telemetry)
    }

    protected async execute(req: HttpRequest): Promise<HttpResponseInit> {
        // Check rate limit
        const rateLimitResponse = checkRateLimit(req, rateLimiters.look, 'location/look')
        if (rateLimitResponse) {
            return rateLimitResponse
        }

        const repo = this.locationRepo

        // Extract locationId from path parameter, fallback to query for backward compatibility
        const id = req.params.locationId || req.query.get('id') || STARTER_LOCATION_ID

        // Validate GUID format if provided and not the default starter location
        if (id && id !== STARTER_LOCATION_ID) {
            if (!isValidGuid(id)) {
                this.track('Navigation.Look.Issued', {
                    locationId: id,
                    status: 400,
                    latencyMs: this.latencyMs,
                    reason: 'invalid-guid'
                })
                return errorResponse(400, 'InvalidLocationId', 'Location id must be a valid GUID format', {
                    correlationId: this.correlationId
                })
            }
        }

        const fromLocationId = req.query.get('fromLocationId') || undefined

        const loc = await repo.get(id)
        if (!loc) {
            this.track('Navigation.Look.Issued', { id, status: 404, latencyMs: this.latencyMs, fromLocationId })
            return errorResponse(404, 'NotFound', 'Location not found', { correlationId: this.correlationId })
        }

        // Determine if canonical writes are planned (exitsSummaryCache write needed)
        const canonicalWritesPlanned = !loc.exitsSummaryCache

        // Check if exitsSummaryCache exists; if not, generate and persist
        let exitsSummaryCache = loc.exitsSummaryCache
        if (!exitsSummaryCache) {
            // Convert exits to ExitEdgeResult format
            const exitEdges: ExitEdgeResult[] = (loc.exits || []).map((e) => ({
                direction: e.direction as Direction,
                toLocationId: e.to || '',
                description: e.description
            }))

            exitsSummaryCache = generateExitsSummaryCache(exitEdges)

            // Persist the generated cache
            await repo.updateExitsSummaryCache(id, exitsSummaryCache)
        }

        // Build view context from query parameters (optional)
        const context: ViewContext = {
            weather: req.query.get('weather') || undefined,
            time: req.query.get('time') || undefined,
            season: req.query.get('season') || undefined,
            timestamp: new Date().toISOString()
        }

        // Attempt hero prose generation ONLY when no canonical writes are planned
        // Bounded blocking is allowed only for perception actions with no pending canonical writes.
        // When canonical writes are planned, skip generation and use safe fallback (baseline description).
        if (!canonicalWritesPlanned) {
            try {
                const generationStartTime = Date.now()
                const configuredTimeoutMs = Number.parseInt(process.env.HERO_PROSE_TIMEOUT_MS ?? '1200', 10)
                const timeoutMs = Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0 ? configuredTimeoutMs : 1200
                await this.heroProseGenerator.generateHeroProse({
                    locationId: id,
                    locationName: loc.name,
                    baseDescription: loc.description,
                    timeoutMs
                })
                const generationLatency = Date.now() - generationStartTime
                if (generationLatency > 500) {
                    this.track('Timing.Op', {
                        op: 'hero-prose-generation',
                        ms: generationLatency,
                        locationId: id,
                        category: 'hero-generation-slow'
                    })
                }
            } catch {
                // Generation errors don't block the response - fall back to base description
                // Telemetry already emitted by HeroProseGenerator
            }
        }

        try {
            const startCompilation = Date.now()

            // Compile description using DescriptionComposer
            // Pass location's description as the base - layers are applied on top
            const compiled = await this.descriptionComposer.compileForLocation(id, context, {
                baseDescription: loc.description
            })

            const compilationLatency = Date.now() - startCompilation

            // Warn if compilation took longer than target (500ms p95)
            if (compilationLatency > 500) {
                this.track('Timing.Op', {
                    op: 'location-description-compile',
                    ms: compilationLatency,
                    locationId: id,
                    layerCount: compiled.provenance.layers.length,
                    category: 'slow-compilation'
                })
            }

            // Count superseded sentences (placeholder for now)
            const supersededCount = 0

            this.track('Navigation.Look.Issued', {
                locationId: id,
                fromLocationId,
                status: 200,
                latencyMs: this.latencyMs,
                compilationLatencyMs: compilationLatency,
                layerCount: compiled.provenance.layers.length,
                supersededSentences: supersededCount,
                cacheHit: !!loc.exitsSummaryCache,
                heroProseAttempted: !canonicalWritesPlanned,
                heroProseSkipReason: canonicalWritesPlanned ? 'canonical-writes-planned' : undefined
            })

            // Build exit availability info
            // Note: loc.exits is from Location interface (array format), need to convert to LocationNode format
            const exitsMap: Partial<Record<Direction, string>> = {}
            if (loc.exits) {
                for (const exit of loc.exits) {
                    if (exit.to) {
                        exitsMap[exit.direction as Direction] = exit.to
                    }
                }
            }
            
            const exitInfoArray = buildExitInfoArray(exitsMap, undefined) // LocationNode.exitAvailability not yet wired from persistence

            return okResponse(
                {
                    id: loc.id,
                    name: loc.name,
                    description: {
                        text: compiled.text,
                        html: compiled.html,
                        provenance: {
                            compiledAt: compiled.provenance.compiledAt,
                            layersApplied: compiled.provenance.layers.map((l) => l.layerType),
                            supersededSentences: supersededCount
                        }
                    },
                    exits: exitInfoArray,
                    metadata: {
                        exitsSummaryCache,
                        tags: loc.tags,
                        revision: loc.version
                    }
                },
                { correlationId: this.correlationId, playerGuid: this.playerGuid }
            )
        } catch (error) {
            // Log composition service failure
            this.track('Description.Generate.Failure', {
                locationId: id,
                status: 500,
                latencyMs: this.latencyMs,
                error: error instanceof Error ? error.message : String(error),
                stage: 'compilation'
            })

            return errorResponse(500, 'InternalError', 'Failed to compile location description', {
                correlationId: this.correlationId
            })
        }
    }
}

export async function getLocationLookHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const container = context.extraInputs.get('container') as Container
    const handler = container.get(LocationLookHandler)
    return handler.handle(req, context)
}
