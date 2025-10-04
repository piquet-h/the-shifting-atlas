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
    getPlayerHeadingStore,
    normalizeDirection,
    STARTER_LOCATION_ID,
    trackGameEventStrict
} from '@atlas/shared'
import { app, HttpRequest, HttpResponseInit } from '@azure/functions'

const locationRepoPromise = getLocationRepository()
const headingStore = getPlayerHeadingStore()

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

export async function moveHandler(req: HttpRequest): Promise<HttpResponseInit> {
    const started = Date.now()
    const fromId = req.query.get('from') || STARTER_LOCATION_ID
    const rawDir = req.query.get('dir') || ''
    const playerGuid = extractPlayerGuid(req.headers)
    const correlationId = extractCorrelationId(req.headers)

    const lastHeading = playerGuid ? headingStore.getLastHeading(playerGuid) : undefined
    const normalizationResult = normalizeDirection(rawDir, lastHeading)

    if (normalizationResult.status === 'ambiguous') {
        trackGameEventStrict(
            'Navigation.Input.Ambiguous',
            { from: fromId, input: rawDir, reason: 'no-heading' },
            { playerGuid, correlationId }
        )
        return {
            status: 400,
            headers: { [CORRELATION_HEADER]: correlationId },
            jsonBody: {
                error: 'Ambiguous direction',
                input: rawDir,
                clarification: normalizationResult.clarification
            }
        }
    }

    if (normalizationResult.status === 'unknown' || !normalizationResult.canonical) {
        const latencyMs = Date.now() - started
        trackGameEventStrict(
            'Location.Move',
            { from: fromId, direction: rawDir, status: 400, reason: 'invalid-direction', latencyMs },
            { playerGuid, correlationId }
        )
        return {
            status: 400,
            headers: { [CORRELATION_HEADER]: correlationId },
            jsonBody: {
                error: 'Invalid direction',
                input: rawDir,
                clarification: normalizationResult.clarification
            }
        }
    }

    const dir = normalizationResult.canonical

    const locationRepo = await locationRepoPromise
    const from = await locationRepo.get(fromId)
    if (!from) {
        const latencyMs = Date.now() - started
        trackGameEventStrict(
            'Location.Move',
            { from: fromId, direction: dir, status: 404, reason: 'from-missing', latencyMs },
            { playerGuid, correlationId }
        )
        return {
            status: 404,
            headers: { [CORRELATION_HEADER]: correlationId },
            jsonBody: { error: 'Current location not found', from: fromId }
        }
    }
    const exit = from.exits?.find((e) => e.direction === dir)
    if (!exit || !exit.to) {
        const latencyMs = Date.now() - started
        trackGameEventStrict(
            'Location.Move',
            { from: fromId, direction: dir, status: 400, reason: 'no-exit', latencyMs },
            { playerGuid, correlationId }
        )
        return {
            status: 400,
            headers: { [CORRELATION_HEADER]: correlationId },
            jsonBody: { error: 'No such exit', from: fromId, direction: dir }
        }
    }
    const result = await locationRepo.move(fromId, dir)
    if (result.status === 'error') {
        const reason = result.reason
        const statusMap: Record<string, number> = { ['from-missing']: 404, ['no-exit']: 400, ['target-missing']: 500 }
        const latencyMs = Date.now() - started
        trackGameEventStrict(
            'Location.Move',
            { from: fromId, direction: dir, status: statusMap[reason] || 500, reason, latencyMs },
            { playerGuid, correlationId }
        )
        return { status: statusMap[reason] || 500, headers: { [CORRELATION_HEADER]: correlationId }, jsonBody: { error: reason } }
    }

    if (playerGuid) {
        headingStore.setLastHeading(playerGuid, dir)
    }

    const latencyMs = Date.now() - started
    trackGameEventStrict(
        'Location.Move',
        {
            from: fromId,
            to: result.location.id,
            direction: dir,
            status: 200,
            rawInput: rawDir !== dir.toLowerCase() ? rawDir : undefined,
            latencyMs
        },
        { playerGuid, correlationId }
    )
    return { status: 200, headers: { [CORRELATION_HEADER]: correlationId }, jsonBody: result.location }
}

app.http('LocationGet', { route: 'location', methods: ['GET'], authLevel: 'anonymous', handler: getLocationHandler })
app.http('LocationMove', { route: 'location/move', methods: ['GET'], authLevel: 'anonymous', handler: moveHandler })
