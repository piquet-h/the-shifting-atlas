/**
 * Room & Movement Handlers (MVP Stub)
 * ------------------------------------------------------
 * Current State: Uses an in-memory `roomStore` (see domain/roomStore.ts) with two starter rooms
 * and basic directional exits. Telemetry events (`Room.Get`, `Room.Move`) capture minimal fields.
 *
 * Migration Plan (Persistence):
 *  1. Introduce a repository interface (getRoom(id), move(fromId, direction)) in shared package.
 *  2. Provide memory + Cosmos Gremlin implementations; select via env `PERSISTENCE_MODE`.
 *  3. Replace direct `roomStore` access here with repository calls.
 *  4. Extend telemetry dimensions (persistenceMode, fromRoom, toRoom, direction, outcome).
 *  5. Add optimistic concurrency (room.version) once multi-writer scenarios emerge.
 *
 * Rationale: Keeping this stub lean accelerates traversal loop validation while isolating
 * persistence concerns behind a soon-to-arrive interface—reducing refactor surface.
 */
import {STARTER_ROOM_ID, trackEvent} from '@atlas/shared'
import {app, HttpRequest, HttpResponseInit} from '@azure/functions'
import {roomStore} from '../domain/roomStore.js'

export async function getRoomHandler(req: HttpRequest): Promise<HttpResponseInit> {
    const id = req.query.get('id') || STARTER_ROOM_ID
    const room = roomStore.get(id)
    if (!room) {
        trackEvent('Room.Get', {id, status: 404})
        return {status: 404, jsonBody: {error: 'Room not found', id}}
    }
    trackEvent('Room.Get', {id, status: 200})
    return {status: 200, jsonBody: room}
}

// Basic movement stub: expects direction in query (?dir=north) and current room (?from=starter-room)
export async function moveHandler(req: HttpRequest): Promise<HttpResponseInit> {
    const fromId = req.query.get('from') || STARTER_ROOM_ID
    const dir = (req.query.get('dir') || '').toLowerCase()
    const from = roomStore.get(fromId)
    if (!from) {
        trackEvent('Room.Move', {from: fromId, direction: dir || null, status: 404, reason: 'from-missing'})
        return {status: 404, jsonBody: {error: 'Current room not found', from: fromId}}
    }
    const exit = from.exits?.find((e) => e.direction === dir)
    if (!exit || !exit.to) {
        trackEvent('Room.Move', {from: fromId, direction: dir || null, status: 400, reason: 'no-exit'})
        return {status: 400, jsonBody: {error: 'No such exit', from: fromId, direction: dir}}
    }
    const dest = roomStore.get(exit.to)
    if (!dest) {
        trackEvent('Room.Move', {from: fromId, direction: dir || null, status: 500, reason: 'target-missing'})
        return {status: 500, jsonBody: {error: 'Exit target missing', to: exit.to}}
    }
    trackEvent('Room.Move', {from: fromId, to: dest.id, direction: dir || null, status: 200})
    return {status: 200, jsonBody: dest}
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
