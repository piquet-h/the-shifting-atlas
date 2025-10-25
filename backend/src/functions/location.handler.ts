import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { app } from '@azure/functions'
import { STARTER_LOCATION_ID, err, ok } from '@piquet-h/shared'
import { Container } from 'inversify'
import { ILocationRepository } from '../repos/locationRepository.js'
import { CORRELATION_HEADER, extractCorrelationId, extractPlayerGuid, trackGameEventStrict } from '../telemetry.js'

export async function getLocationHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const started = Date.now()
    const id = req.query.get('id') || STARTER_LOCATION_ID

    const container = context.extraInputs.get('container') as Container
    const locationRepo = container.get<ILocationRepository>('ILocationRepository')

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

app.http('HttpGetLocation', {
    route: 'location',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: getLocationHandler
})
