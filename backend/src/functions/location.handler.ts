import type { HttpRequest, HttpResponseInit } from '@azure/functions'
import { STARTER_LOCATION_ID, err, ok } from '@piquet-h/shared'
import { getLocationRepository } from '../repos/index.js'
import { CORRELATION_HEADER, extractCorrelationId, extractPlayerGuid, trackGameEventStrict } from '../telemetry.js'

const locationRepoPromise = getLocationRepository()

export async function getLocationHandler(req: HttpRequest): Promise<HttpResponseInit> {
    const started = Date.now()
    const id = req.query.get('id') || STARTER_LOCATION_ID
    const locationRepo = await locationRepoPromise
    const location = await locationRepo.get(id)
    const playerGuid = extractPlayerGuid(req.headers)
    const correlationId = extractCorrelationId(req.headers)
    if (!location) {
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
        jsonBody: ok(location, correlationId)
    }
}
