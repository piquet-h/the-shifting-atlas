import {getRoomRepository, STARTER_ROOM_ID} from '@atlas/shared'
import {app, HttpRequest, HttpResponseInit} from '@azure/functions'

/*
 * MCP Server: world-query (Phase 0 Stub)
 * Route: /mcp/world-query
 * Supported operations (query params):
 *  - op=getRoom&id=<roomId>
 *  - op=getStarter (shorthand) returns starter room
 * Future: listRecentEvents, getPlayerState
 */
const roomRepo = getRoomRepository()

export async function worldQueryHandler(req: HttpRequest): Promise<HttpResponseInit> {
    const op = req.query.get('op') || 'getStarter'
    if (op === 'getStarter') {
        const room = await roomRepo.get(STARTER_ROOM_ID)
        return json(200, {room})
    }
    if (op === 'getRoom') {
        const id = req.query.get('id') || STARTER_ROOM_ID
        const room = await roomRepo.get(id)
        if (!room) return json(404, {error: 'Room not found', id})
        return json(200, {room})
    }
    return json(400, {error: 'Unsupported op'})
}

function json(status: number, body: unknown): HttpResponseInit {
    return {status, jsonBody: body, headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'}}
}

app.http('McpWorldQuery', {
    route: 'mcp/world-query',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: worldQueryHandler
})
