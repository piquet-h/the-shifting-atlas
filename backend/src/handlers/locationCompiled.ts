/**
 * Location Compiled Description Handler
 *
 * Returns pre-compiled location descriptions for frontend rendering.
 * Backend owns composition logic using DescriptionComposer service.
 *
 * Response includes:
 * - compiledDescription (string): Opaque compiled markdown text
 * - compiledDescriptionHtml (string): Sanitized HTML version
 * - provenance: Metadata about layers applied and compilation timestamp
 */
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { STARTER_LOCATION_ID } from '@piquet-h/shared'
import type { Container } from 'inversify'
import { inject, injectable } from 'inversify'
import { checkRateLimit } from '../middleware/rateLimitMiddleware.js'
import { rateLimiters } from '../middleware/rateLimiter.js'
import type { ILocationRepository } from '../repos/locationRepository.js'
import { DescriptionComposer } from '../services/descriptionComposer.js'
import type { ViewContext } from '../services/types.js'
import type { ITelemetryClient } from '../telemetry/ITelemetryClient.js'
import { BaseHandler } from './base/BaseHandler.js'
import { errorResponse, okResponse } from './utils/responseBuilder.js'
import { isValidGuid } from './utils/validation.js'

@injectable()
export class LocationCompiledDescriptionHandler extends BaseHandler {
    constructor(
        @inject('ITelemetryClient') telemetry: ITelemetryClient,
        @inject('ILocationRepository') private locationRepo: ILocationRepository,
        @inject(DescriptionComposer) private descriptionComposer: DescriptionComposer
    ) {
        super(telemetry)
    }

    protected async execute(req: HttpRequest): Promise<HttpResponseInit> {
        // Check rate limit
        const rateLimitResponse = checkRateLimit(req, rateLimiters.look, 'location/compiled')
        if (rateLimitResponse) {
            return rateLimitResponse
        }

        // Extract locationId from path parameter, fallback to query for backward compatibility
        const id = req.params.locationId || req.query.get('id') || STARTER_LOCATION_ID

        // Validate GUID format if provided and not the default starter location
        if (id && id !== STARTER_LOCATION_ID) {
            if (!isValidGuid(id)) {
                this.track('Navigation.Look.Issued', {
                    locationId: id,
                    status: 400,
                    latencyMs: this.latencyMs,
                    reason: 'invalid-guid',
                    compiled: true
                })
                return errorResponse(400, 'InvalidLocationId', 'Location id must be a valid GUID format', {
                    correlationId: this.correlationId
                })
            }
        }

        // Check if location exists
        const location = await this.locationRepo.get(id)
        if (!location) {
            this.track('Navigation.Look.Issued', {
                locationId: id,
                status: 404,
                latencyMs: this.latencyMs,
                compiled: true
            })
            return errorResponse(404, 'NotFound', 'Location not found', {
                correlationId: this.correlationId
            })
        }

        // Build view context from query parameters (optional)
        const context: ViewContext = {
            weather: req.query.get('weather') || undefined,
            time: req.query.get('time') || undefined,
            season: req.query.get('season') || undefined,
            timestamp: new Date().toISOString()
        }

        try {
            const startCompilation = Date.now()

            // Compile description using DescriptionComposer
            const compiled = await this.descriptionComposer.compileForLocation(id, context)

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

            // Count superseded sentences
            // NOTE: DescriptionComposer doesn't currently track superseded sentence count in provenance.
            // The composer applies supersede masking but doesn't expose the count of removed sentences.
            // Future enhancement: Update DescriptionComposer to track this in provenance.
            // For now, return 0 as a placeholder until composer enhancement.
            const supersededCount = 0

            // Build response
            const response = {
                locationId: id,
                name: location.name,
                compiledDescription: compiled.text,
                compiledDescriptionHtml: compiled.html,
                exits: (location.exits || []).map((e) => e.direction),
                provenance: {
                    compiledAt: compiled.provenance.compiledAt,
                    layersApplied: compiled.provenance.layers.map((l) => l.layerType),
                    supersededSentences: supersededCount
                }
            }

            this.track('Navigation.Look.Issued', {
                locationId: id,
                status: 200,
                latencyMs: this.latencyMs,
                compilationLatencyMs: compilationLatency,
                layerCount: compiled.provenance.layers.length,
                supersededSentences: supersededCount,
                compiled: true
            })

            return okResponse(response, {
                correlationId: this.correlationId,
                playerGuid: this.playerGuid
            })
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

export async function getLocationCompiledHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const container = context.extraInputs.get('container') as Container
    const handler = container.get(LocationCompiledDescriptionHandler)
    return handler.handle(req, context)
}
