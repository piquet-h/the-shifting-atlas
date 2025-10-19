import { app, HttpRequest, HttpResponseInit } from '@azure/functions'
import { STARTER_LOCATION_ID } from '@piquet-h/shared'
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
        return { status: 404, headers: { [CORRELATION_HEADER]: correlationId }, jsonBody: { error: 'Location not found', id } }
    }
    const latencyMs = Date.now() - started
    trackGameEventStrict('Location.Get', { id, status: 200, latencyMs }, { playerGuid, correlationId })
    return { status: 200, headers: { [CORRELATION_HEADER]: correlationId }, jsonBody: location }
}

export async function moveHandler(): Promise<HttpResponseInit> {
    // DEPRECATED ENDPOINT: location/move
    // This endpoint is deprecated. Please use player/move instead.
    return {
        status: 410,
        jsonBody: {
            error: 'This endpoint is deprecated. Use player/move instead.',
            deprecated: true,
            replacement: 'player/move'
        }
    }
}

app.http('LocationGet', { route: 'location', methods: ['GET'], authLevel: 'anonymous', handler: getLocationHandler })
app.http('LocationMove', { route: 'location/move', methods: ['GET'], authLevel: 'anonymous', handler: moveHandler })
