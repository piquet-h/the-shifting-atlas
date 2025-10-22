import { app, HttpRequest, HttpResponseInit } from '@azure/functions'
import { err, isDirection, ok } from '@piquet-h/shared'
import { getLocationRepository } from '../repos/index.js'
import { CORRELATION_HEADER, extractCorrelationId } from '../telemetry.js'

/**
 * Handler to link two rooms with an EXIT edge.
 * Body: { originId: string, destId: string, dir: string, reciprocal?: boolean, description?: string }
 * Returns: { created: boolean, reciprocalCreated?: boolean }
 */
export async function linkRoomsHandler(req: HttpRequest): Promise<HttpResponseInit> {
    const correlationId = extractCorrelationId(req.headers)

    // Parse request body
    let body: Record<string, unknown>
    try {
        const text = await req.text()
        body = text ? JSON.parse(text) : {}
    } catch {
        return {
            status: 400,
            headers: {
                [CORRELATION_HEADER]: correlationId,
                'Content-Type': 'application/json; charset=utf-8'
            },
            jsonBody: err('InvalidJson', 'Request body must be valid JSON', correlationId)
        }
    }

    // Validate required fields
    const originId = body.originId
    const destId = body.destId
    const dir = body.dir
    const reciprocal = body.reciprocal === true
    const description = typeof body.description === 'string' ? body.description : undefined

    if (typeof originId !== 'string' || !originId) {
        return {
            status: 400,
            headers: {
                [CORRELATION_HEADER]: correlationId,
                'Content-Type': 'application/json; charset=utf-8'
            },
            jsonBody: err('MissingOriginId', 'originId is required', correlationId)
        }
    }

    if (typeof destId !== 'string' || !destId) {
        return {
            status: 400,
            headers: {
                [CORRELATION_HEADER]: correlationId,
                'Content-Type': 'application/json; charset=utf-8'
            },
            jsonBody: err('MissingDestId', 'destId is required', correlationId)
        }
    }

    if (typeof dir !== 'string' || !isDirection(dir)) {
        return {
            status: 400,
            headers: {
                [CORRELATION_HEADER]: correlationId,
                'Content-Type': 'application/json; charset=utf-8'
            },
            jsonBody: err('InvalidDirection', `dir must be a valid direction, got: ${dir}`, correlationId)
        }
    }

    // Link the rooms
    try {
        const repo = await getLocationRepository()
        const result = await repo.ensureExitBidirectional(originId, dir, destId, {
            reciprocal,
            description,
            reciprocalDescription: description
        })

        return {
            status: 200,
            headers: {
                [CORRELATION_HEADER]: correlationId,
                'Content-Type': 'application/json; charset=utf-8'
            },
            jsonBody: ok(result, correlationId)
        }
    } catch (error) {
        return {
            status: 500,
            headers: {
                [CORRELATION_HEADER]: correlationId,
                'Content-Type': 'application/json; charset=utf-8'
            },
            jsonBody: err('InternalError', error instanceof Error ? error.message : 'Unknown error', correlationId)
        }
    }
}

/**
 * HTTP endpoint to link two rooms with an EXIT edge.
 * POST /api/location/link-rooms
 */
app.http('HttpLinkRooms', {
    route: 'location/link-rooms',
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: linkRoomsHandler
})
