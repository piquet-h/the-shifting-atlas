import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { err, isDirection, ok } from '@piquet-h/shared'
import { Container } from 'inversify'
import { ILocationRepository } from '../repos/locationRepository.js'
import { CORRELATION_HEADER, extractCorrelationId } from '../telemetry.js'

/**
 * Handler to link two rooms with an EXIT edge.
 * Body: { originId: string, destId: string, dir: string, reciprocal?: boolean, description?: string }
 * Returns: { created: boolean, reciprocalCreated?: boolean }
 */
export async function linkRoomsHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
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

    // Validate with switch for readability
    type ValidationError = { code: string; message: string } | null
    const validationError: ValidationError = (() => {
        switch (true) {
            case typeof originId !== 'string' || !originId:
                return { code: 'MissingOriginId', message: 'originId is required' }
            case typeof destId !== 'string' || !destId:
                return { code: 'MissingDestId', message: 'destId is required' }
            case typeof dir !== 'string' || !isDirection(dir):
                return { code: 'InvalidDirection', message: `dir must be a valid direction, got: ${dir}` }
            default:
                return null
        }
    })()

    if (validationError) {
        return {
            status: 400,
            headers: {
                [CORRELATION_HEADER]: correlationId,
                'Content-Type': 'application/json; charset=utf-8'
            },
            jsonBody: err(validationError.code, validationError.message, correlationId)
        }
    }

    // Link the rooms (type assertions safe after validation)
    try {
        const container = context.extraInputs.get('container') as Container
        const repo = container.get<ILocationRepository>('ILocationRepository')

        const result = await repo.ensureExitBidirectional(originId as string, dir as string, destId as string, {
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
