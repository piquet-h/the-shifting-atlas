import { app, HttpRequest, HttpResponseInit } from '@azure/functions'
import { err, ok, STARTER_LOCATION_ID } from '@piquet-h/shared'
import { getLocationRepository } from '../repos/index.js'
import { CORRELATION_HEADER, extractCorrelationId, extractPlayerGuid, trackGameEventStrict } from '../telemetry.js'

// Read-only wrapper returning envelope variant of LocationGet
app.http('LocationLook', {
    route: 'location/look',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
        const started = Date.now()
        const correlationId = extractCorrelationId(req.headers)
        const playerGuid = extractPlayerGuid(req.headers)
        const repo = await getLocationRepository()
        const id = req.query.get('id') || STARTER_LOCATION_ID
        const loc = await repo.get(id)
        if (!loc) {
            const latencyMs = Date.now() - started
            trackGameEventStrict('Location.Get', { id, status: 404, latencyMs }, { playerGuid, correlationId })
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
        const latencyMs = Date.now() - started
        trackGameEventStrict('Location.Get', { id, status: 200, latencyMs }, { playerGuid, correlationId })
        return {
            status: 200,
            headers: {
                [CORRELATION_HEADER]: correlationId,
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store'
            },
            jsonBody: ok(loc, correlationId)
        }
    }
})
