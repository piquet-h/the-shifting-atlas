import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { Direction, err, ok, STARTER_LOCATION_ID } from '@piquet-h/shared'
import { Container } from 'inversify'
import { ExitEdgeResult, generateExitsSummaryCache } from '../repos/exitRepository.js'
import { ILocationRepository } from '../repos/locationRepository.js'
import { CORRELATION_HEADER, extractCorrelationId, extractPlayerGuid, trackGameEventStrict } from '../telemetry.js'
import { checkRateLimit } from '../middleware/rateLimitMiddleware.js'
import { rateLimiters } from '../middleware/rateLimiter.js'
import { isValidGuid } from '../handlers/utils/validation.js'

// LOOK command: Returns location description + exits summary cache (regenerates if missing)
app.http('LocationLook', {
    route: 'location/{locationId}',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
        // Check rate limit
        const rateLimitResponse = checkRateLimit(req, rateLimiters.look, 'location/look')
        if (rateLimitResponse) {
            return rateLimitResponse
        }

        const started = Date.now()
        const correlationId = extractCorrelationId(req.headers)
        const playerGuid = extractPlayerGuid(req.headers)

        const container = context.extraInputs.get('container') as Container
        const repo = container.get<ILocationRepository>('ILocationRepository')

        // Extract locationId from path parameter, fallback to query for backward compatibility
        const id = req.params.locationId || req.query.get('id') || STARTER_LOCATION_ID

        // Validate GUID format if provided and not the default starter location
        if (id && id !== STARTER_LOCATION_ID) {
            if (!isValidGuid(id)) {
                const latencyMs = Date.now() - started
                trackGameEventStrict(
                    'Navigation.Look.Issued',
                    { locationId: id, status: 400, latencyMs, reason: 'invalid-guid' },
                    { playerGuid, correlationId }
                )
                return {
                    status: 400,
                    headers: {
                        [CORRELATION_HEADER]: correlationId,
                        'Content-Type': 'application/json; charset=utf-8',
                        'Cache-Control': 'no-store'
                    },
                    jsonBody: err('InvalidLocationId', 'Location id must be a valid GUID format', correlationId)
                }
            }
        }

        const fromLocationId = req.query.get('fromLocationId') || undefined

        const loc = await repo.get(id)
        if (!loc) {
            const latencyMs = Date.now() - started
            trackGameEventStrict('Navigation.Look.Issued', { id, status: 404, latencyMs, fromLocationId }, { playerGuid, correlationId })
            return {
                status: 404,
                headers: {
                    [CORRELATION_HEADER]: correlationId,
                    'Content-Type': 'application/json; charset=utf-8',
                    'Cache-Control': 'no-store'
                },
                jsonBody: err('NotFound', 'Location not found', correlationId)
            }
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

        const latencyMs = Date.now() - started
        trackGameEventStrict(
            'Navigation.Look.Issued',
            {
                locationId: id,
                fromLocationId,
                status: 200,
                latencyMs,
                cacheHit: !!loc.exitsSummaryCache
            },
            { playerGuid, correlationId }
        )

        return {
            status: 200,
            headers: {
                [CORRELATION_HEADER]: correlationId,
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store'
            },
            jsonBody: ok(
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
                correlationId
            )
        }
    }
})
