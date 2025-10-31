import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { Direction, STARTER_LOCATION_ID } from '@piquet-h/shared'
import type { Container } from 'inversify'
import { inject, injectable } from 'inversify'
import { checkRateLimit } from '../middleware/rateLimitMiddleware.js'
import { rateLimiters } from '../middleware/rateLimiter.js'
import { ExitEdgeResult, generateExitsSummaryCache } from '../repos/exitRepository.js'
import { ILocationRepository } from '../repos/locationRepository.js'
import type { ITelemetryClient } from '../telemetry/ITelemetryClient.js'
import { BaseHandler } from './base/BaseHandler.js'
import { errorResponse, okResponse } from './utils/responseBuilder.js'
import { isValidGuid } from './utils/validation.js'

@injectable()
export class LocationLookHandler extends BaseHandler {
    constructor(@inject('ITelemetryClient') telemetry: ITelemetryClient) {
        super(telemetry)
    }

    protected async execute(req: HttpRequest): Promise<HttpResponseInit> {
        // Check rate limit
        const rateLimitResponse = checkRateLimit(req, rateLimiters.look, 'location/look')
        if (rateLimitResponse) {
            return rateLimitResponse
        }

        const repo = this.getRepository<ILocationRepository>('ILocationRepository')

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

        this.track('Navigation.Look.Issued', {
            locationId: id,
            fromLocationId,
            status: 200,
            latencyMs: this.latencyMs,
            cacheHit: !!loc.exitsSummaryCache
        })

        return okResponse(
            {
                locationId: loc.id,
                name: loc.name,
                baseDescription: loc.description,
                exits: (loc.exits || []).reduce(
                    (acc, e) => {
                        if (e.direction && e.to) {
                            acc[e.direction] = e.to
                        }
                        return acc
                    },
                    {} as Record<string, string>
                ),
                exitsSummaryCache,
                metadata: {
                    tags: loc.tags
                },
                revision: loc.version
            },
            { correlationId: this.correlationId, playerGuid: this.playerGuid }
        )
    }
}

export async function getLocationLookHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const container = context.extraInputs.get('container') as Container
    const handler = container.get(LocationLookHandler)
    return handler.handle(req, context)
}
