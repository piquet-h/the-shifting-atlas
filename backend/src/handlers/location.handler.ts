import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { STARTER_LOCATION_ID } from '@piquet-h/shared'
import { ILocationRepository } from '../repos/locationRepository.js'
import { extractCorrelationId, extractPlayerGuid, trackGameEventStrict } from '../telemetry.js'
import { getRepository } from './utils/contextHelpers.js'
import { errorResponse, okResponse } from './utils/responseBuilder.js'

export async function getLocationHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const started = Date.now()
    const id = req.query.get('id') || STARTER_LOCATION_ID

    const locationRepo = getRepository<ILocationRepository>(context, 'ILocationRepository')

    const location = await locationRepo.get(id)
    const playerGuid = extractPlayerGuid(req.headers)
    const correlationId = extractCorrelationId(req.headers)
    if (!location) {
        const latencyMs = Date.now() - started
        trackGameEventStrict('Location.Get', { id, status: 404, latencyMs }, { playerGuid, correlationId })
        return errorResponse(404, 'NotFound', 'Location not found', { correlationId })
    }
    const latencyMs = Date.now() - started
    trackGameEventStrict('Location.Get', { id, status: 200, latencyMs }, { playerGuid, correlationId })
    return okResponse(location, { correlationId })
}
