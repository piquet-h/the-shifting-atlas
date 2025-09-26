/**
 * Room & Movement Handlers (In-Memory Repository Backing)
 * ------------------------------------------------------
 * Current State: Uses the shared `IRoomRepository` in-memory implementation
 * seeded from `shared/src/data/villageRooms.json` (a plain JSON world seed).
 * Telemetry events (`Room.Get`, `Room.Move`) capture minimal fields.
 *
 * Persistence Roadmap:
 *  1. Add `CosmosRoomRepository` (Gremlin) implementing IRoomRepository.
 *  2. Select implementation via env: `PERSISTENCE_MODE=cosmos|memory`.
 *  3. Introduce migration/seed script that ingests the JSON seed if graph empty.
 *  4. Expand telemetry dimensions (persistenceMode, fromRoom, toRoom, direction, outcome).
 *  5. Add optimistic concurrency (room.version) with conditional updates.
 *
 * Rationale: Centralizing seed data as JSON enables tooling (map diffing,
 * AI-driven generation, visualization) without code edits.
 */
import {
    CORRELATION_HEADER,
    extractCorrelationId,
    extractPlayerGuid,
    getRoomRepository,
    isDirection,
    STARTER_ROOM_ID,
    trackGameEventStrict
} from '@atlas/shared'
import {app, HttpRequest, HttpResponseInit} from '@azure/functions'
// Repository abstraction (Week 1) replaces direct in-memory store usage.
const roomRepo = getRoomRepository()

export async function getRoomHandler(req: HttpRequest): Promise<HttpResponseInit> {
    const id = req.query.get('id') || STARTER_ROOM_ID
    const room = await roomRepo.get(id)
    const playerGuid = extractPlayerGuid(req.headers)
    const correlationId = extractCorrelationId(req.headers)
    if (!room) {
        trackGameEventStrict('Room.Get', {id, status: 404}, {playerGuid, correlationId})
        return {status: 404, headers: {[CORRELATION_HEADER]: correlationId}, jsonBody: {error: 'Room not found', id}}
    }
    trackGameEventStrict('Room.Get', {id, status: 200}, {playerGuid, correlationId})
    return {status: 200, headers: {[CORRELATION_HEADER]: correlationId}, jsonBody: room}
}

// Basic movement stub: expects direction in query (?dir=north) and current room (?from=<roomId>). If
// omitted, defaults to STARTER_ROOM_ID (UUID). Legacy docs may still reference the old
// human-readable 'starter-room' id; that has been replaced with a UUID.
export async function moveHandler(req: HttpRequest): Promise<HttpResponseInit> {
    const fromId = req.query.get('from') || STARTER_ROOM_ID
    const dir = (req.query.get('dir') || '').toLowerCase()
    const playerGuid = extractPlayerGuid(req.headers)
    const correlationId = extractCorrelationId(req.headers)
    if (dir && !isDirection(dir)) {
        trackGameEventStrict(
            'Room.Move',
            {from: fromId, direction: dir, status: 400, reason: 'invalid-direction'},
            {
                playerGuid,
                correlationId
            }
        )
        return {
            status: 400,
            headers: {[CORRELATION_HEADER]: correlationId},
            jsonBody: {error: 'Invalid direction', direction: dir}
        }
    }
    const from = await roomRepo.get(fromId)
    if (!from) {
        trackGameEventStrict(
            'Room.Move',
            {from: fromId, direction: dir || null, status: 404, reason: 'from-missing'},
            {
                playerGuid,
                correlationId
            }
        )
        return {
            status: 404,
            headers: {[CORRELATION_HEADER]: correlationId},
            jsonBody: {error: 'Current room not found', from: fromId}
        }
    }
    const exit = from.exits?.find((e) => e.direction === dir)
    if (!exit || !exit.to) {
        trackGameEventStrict(
            'Room.Move',
            {from: fromId, direction: dir || null, status: 400, reason: 'no-exit'},
            {
                playerGuid,
                correlationId
            }
        )
        return {
            status: 400,
            headers: {[CORRELATION_HEADER]: correlationId},
            jsonBody: {error: 'No such exit', from: fromId, direction: dir}
        }
    }
    const result = await roomRepo.move(fromId, dir)
    if (result.status === 'error') {
        const reason = result.reason
        const statusMap: Record<string, number> = {['from-missing']: 404, ['no-exit']: 400, ['target-missing']: 500}
        trackGameEventStrict(
            'Room.Move',
            {from: fromId, direction: dir || null, status: statusMap[reason] || 500, reason},
            {playerGuid, correlationId}
        )
        return {
            status: statusMap[reason] || 500,
            headers: {[CORRELATION_HEADER]: correlationId},
            jsonBody: {error: reason}
        }
    }
    trackGameEventStrict(
        'Room.Move',
        {from: fromId, to: result.room.id, direction: dir || null, status: 200},
        {
            playerGuid,
            correlationId
        }
    )
    return {status: 200, headers: {[CORRELATION_HEADER]: correlationId}, jsonBody: result.room}
}

app.http('RoomGet', {
    route: 'room',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: getRoomHandler
})

app.http('RoomMove', {
    route: 'room/move',
    methods: ['GET'], // Keep GET for simplicity in MVP (idempotent for stub). Later change to POST for stateful actions.
    authLevel: 'anonymous',
    handler: moveHandler
})
