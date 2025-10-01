import { getLocationRepository, STARTER_LOCATION_ID } from '@atlas/shared'
import { app, HttpRequest, HttpResponseInit } from '@azure/functions'

/*
 * MCP Server: world-query (Phase 0 Stub)
 * Route: /mcp/world-query
 * Supported operations (query params):
 *  - op=getLocation&id=<locationId>
 *  - op=getStarter (shorthand) returns starter location
 * Future: listRecentEvents, getPlayerState
 */
const locationRepo = getLocationRepository()

export async function worldQueryHandler(req: HttpRequest): Promise<HttpResponseInit> {
    const op = req.query.get('op') || 'getStarter'
    if (op === 'getStarter') {
        const location = await locationRepo.get(STARTER_LOCATION_ID)
        return json(200, { location })
    }
    if (op === 'getLocation') {
        const id = req.query.get('id') || STARTER_LOCATION_ID
        const location = await locationRepo.get(id)
        if (!location) return json(404, { error: 'Location not found', id })
        return json(200, { location })
    }
    return json(400, { error: 'Unsupported op' })
}

function json(status: number, body: unknown): HttpResponseInit {
    return { status, jsonBody: body, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } }
}

app.http('McpWorldQuery', {
    route: 'mcp/world-query',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: worldQueryHandler
})
