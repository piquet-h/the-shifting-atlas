import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { STARTER_LOCATION_ID } from '@piquet-h/shared'
import { Container } from 'inversify'
import { formatError } from '../http/errorEnvelope.js'
import { ILocationRepository } from '../repos/locationRepository.js'
import { extractCorrelationId } from '../telemetry/TelemetryService.js'

/*
 * MCP Server: world-query (Phase 0 Stub)
 * Route: /mcp/world-query
 * Supported operations (query params):
 *  - op=getLocation&id=<locationId>
 *  - op=getStarter (shorthand) returns starter location
 * Future: listRecentEvents, getPlayerState
 */

export async function worldQueryHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const container = context.extraInputs.get('container') as Container
    const locationRepo = container.get<ILocationRepository>('ILocationRepository')
    const correlationId = extractCorrelationId(req.headers)

    const op = req.query.get('op') || 'getStarter'
    if (op === 'getStarter') {
        const location = await locationRepo.get(STARTER_LOCATION_ID)
        return json(200, { location }, correlationId)
    }
    if (op === 'getLocation') {
        const id = req.query.get('id') || STARTER_LOCATION_ID
        const location = await locationRepo.get(id)
        if (!location) return jsonError(404, 'NotFound', 'Location not found', correlationId)
        return json(200, { location }, correlationId)
    }
    return jsonError(400, 'UnsupportedOperation', 'Unsupported op', correlationId)
}

function json(status: number, body: unknown, correlationId?: string): HttpResponseInit {
    return {
        status,
        jsonBody: { success: true, data: body, correlationId },
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    }
}

function jsonError(status: number, code: string, message: string, correlationId?: string): HttpResponseInit {
    return {
        status,
        jsonBody: formatError(code, message, correlationId),
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    }
}

app.http('McpWorldQuery', {
    route: 'mcp/world-query',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: worldQueryHandler
})
