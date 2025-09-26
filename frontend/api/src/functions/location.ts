/**
 * Location & Movement Handlers (In-Memory Repository Backing)
 * ----------------------------------------------------------
 * Current State: Uses the shared `ILocationRepository` in-memory implementation
 * seeded from `shared/src/data/villageLocations.json` (a plain JSON world seed; formerly villageRooms.json pre-refactor).
 * Telemetry events (`Location.Get`, `Location.Move`) capture minimal fields.
 */
import {
    CORRELATION_HEADER,
    extractCorrelationId,
    extractPlayerGuid,
    getLocationRepository,
    isDirection,
    STARTER_LOCATION_ID,
    trackGameEventStrict
} from '@atlas/shared'
import {app, HttpRequest, HttpResponseInit} from '@azure/functions'

const locationRepo = getLocationRepository()

export async function getLocationHandler(req: HttpRequest): Promise<HttpResponseInit> {
    const id = req.query.get('id') || STARTER_LOCATION_ID
    const location = await locationRepo.get(id)
    const playerGuid = extractPlayerGuid(req.headers)
    const correlationId = extractCorrelationId(req.headers)
    if (!location) {
        trackGameEventStrict('Location.Get', {id, status: 404}, {playerGuid, correlationId})
        return {status: 404, headers: {[CORRELATION_HEADER]: correlationId}, jsonBody: {error: 'Location not found', id}}
    }
    trackGameEventStrict('Location.Get', {id, status: 200}, {playerGuid, correlationId})
    return {status: 200, headers: {[CORRELATION_HEADER]: correlationId}, jsonBody: location}
}

export async function moveHandler(req: HttpRequest): Promise<HttpResponseInit> {
    const fromId = req.query.get('from') || STARTER_LOCATION_ID
    const dir = (req.query.get('dir') || '').toLowerCase()
    const playerGuid = extractPlayerGuid(req.headers)
    const correlationId = extractCorrelationId(req.headers)
    if (dir && !isDirection(dir)) {
        trackGameEventStrict(
            'Location.Move',
            {from: fromId, direction: dir, status: 400, reason: 'invalid-direction'},
            {playerGuid, correlationId}
        )
        return {status: 400, headers: {[CORRELATION_HEADER]: correlationId}, jsonBody: {error: 'Invalid direction', direction: dir}}
    }
    const from = await locationRepo.get(fromId)
    if (!from) {
        trackGameEventStrict(
            'Location.Move',
            {from: fromId, direction: dir || null, status: 404, reason: 'from-missing'},
            {playerGuid, correlationId}
        )
        return {status: 404, headers: {[CORRELATION_HEADER]: correlationId}, jsonBody: {error: 'Current location not found', from: fromId}}
    }
    const exit = from.exits?.find((e) => e.direction === dir)
    if (!exit || !exit.to) {
        trackGameEventStrict(
            'Location.Move',
            {from: fromId, direction: dir || null, status: 400, reason: 'no-exit'},
            {playerGuid, correlationId}
        )
        return {
            status: 400,
            headers: {[CORRELATION_HEADER]: correlationId},
            jsonBody: {error: 'No such exit', from: fromId, direction: dir}
        }
    }
    const result = await locationRepo.move(fromId, dir)
    if (result.status === 'error') {
        const reason = result.reason
        const statusMap: Record<string, number> = {['from-missing']: 404, ['no-exit']: 400, ['target-missing']: 500}
        trackGameEventStrict(
            'Location.Move',
            {from: fromId, direction: dir || null, status: statusMap[reason] || 500, reason},
            {playerGuid, correlationId}
        )
        return {status: statusMap[reason] || 500, headers: {[CORRELATION_HEADER]: correlationId}, jsonBody: {error: reason}}
    }
    trackGameEventStrict(
        'Location.Move',
        {from: fromId, to: result.location.id, direction: dir || null, status: 200},
        {playerGuid, correlationId}
    )
    return {status: 200, headers: {[CORRELATION_HEADER]: correlationId}, jsonBody: result.location}
}

app.http('LocationGet', {route: 'location', methods: ['GET'], authLevel: 'anonymous', handler: getLocationHandler})
app.http('LocationMove', {route: 'location/move', methods: ['GET'], authLevel: 'anonymous', handler: moveHandler})
