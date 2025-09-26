import {
    CORRELATION_HEADER,
    err,
    extractCorrelationId,
    extractPlayerGuid,
    getLocationRepository,
    ok,
    STARTER_LOCATION_ID,
    trackGameEventStrict
} from '@atlas/shared'
import {app, HttpRequest, HttpResponseInit} from '@azure/functions'

// Read-only wrapper returning envelope variant of LocationGet
app.http('LocationLook', {
    route: 'location/look',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
        const correlationId = extractCorrelationId(req.headers)
        const playerGuid = extractPlayerGuid(req.headers)
        const repo = getLocationRepository()
        const id = req.query.get('id') || STARTER_LOCATION_ID
        const loc = await repo.get(id)
        if (!loc) {
            trackGameEventStrict('Location.Get', {id, status: 404}, {playerGuid, correlationId})
            return {
                status: 404,
                headers: {[CORRELATION_HEADER]: correlationId},
                jsonBody: err('NotFound', 'Location not found', correlationId)
            }
        }
        trackGameEventStrict('Location.Get', {id, status: 200}, {playerGuid, correlationId})
        return {
            status: 200,
            headers: {[CORRELATION_HEADER]: correlationId},
            jsonBody: ok(loc, correlationId)
        }
    }
})
