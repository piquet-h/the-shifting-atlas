import { app, HttpRequest, HttpResponseInit } from '@azure/functions'
import { err, ok } from '@piquet-h/shared'
import { createGremlinClient } from '../gremlin/gremlinClient.js'
import { loadPersistenceConfigAsync, resolvePersistenceMode } from '../persistenceConfig.js'
import { ExitRepository } from '../repos/exitRepository.js'
import { CORRELATION_HEADER, extractCorrelationId } from '../telemetry.js'

/**
 * Handler to get all exits from a location.
 * Returns: { exits: Array<{ direction, toLocationId, description?, kind?, state? }> }
 */
export async function getExitsHandler(req: HttpRequest): Promise<HttpResponseInit> {
    const correlationId = extractCorrelationId(req.headers)

    const locationId = req.query.get('locationId')
    if (!locationId) {
        return {
            status: 400,
            headers: {
                [CORRELATION_HEADER]: correlationId,
                'Content-Type': 'application/json; charset=utf-8'
            },
            jsonBody: err('MissingLocationId', 'locationId query parameter is required', correlationId)
        }
    }

    try {
        const mode = resolvePersistenceMode()
        let exits: unknown[] = []

        if (mode === 'cosmos') {
            const cfg = await loadPersistenceConfigAsync()
            if (cfg.mode === 'cosmos' && cfg.cosmos) {
                const client = await createGremlinClient(cfg.cosmos)
                const repo = new ExitRepository(client)
                exits = await repo.getExits(locationId)
            } else {
                // Fallback to in-memory (no exits in static data)
                exits = []
            }
        } else {
            // In-memory mode: no exit repository, return empty for now
            // (In-memory exits are handled via Location.exits array in locationRepository)
            exits = []
        }

        return {
            status: 200,
            headers: {
                [CORRELATION_HEADER]: correlationId,
                'Content-Type': 'application/json; charset=utf-8'
            },
            jsonBody: ok({ exits }, correlationId)
        }
    } catch (error) {
        return {
            status: 500,
            headers: {
                [CORRELATION_HEADER]: correlationId,
                'Content-Type': 'application/json; charset=utf-8'
            },
            jsonBody: err('InternalError', error instanceof Error ? error.message : 'Unknown error', correlationId)
        }
    }
}

/**
 * HTTP endpoint to get all exits from a location.
 * GET /api/location/exits?locationId=<id>
 */
app.http('HttpGetExits', {
    route: 'location/exits',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: getExitsHandler
})
