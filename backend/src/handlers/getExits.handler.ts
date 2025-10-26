import { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { err, ok } from '@piquet-h/shared'
import type { Container } from 'inversify'
import { IExitRepository } from '../repos/exitRepository.js'
import { CORRELATION_HEADER, extractCorrelationId } from '../telemetry.js'

/**
 * Handler to get all exits from a location.
 * Returns: { exits: Array<{ direction, toLocationId, description?, kind?, state? }> }
 */
export async function getExitsHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const correlationId = extractCorrelationId(req.headers)

    const locationId = req.query.get('locationId')
    if (!locationId) {
        return {
            status: 400,
            headers: {
                [CORRELATION_HEADER]: correlationId,
                'Content-Type': 'application/json; charset=utf-8'
            },
            jsonBody: err('MissingLocationId', 'locationId query parameter is required', correlationId)
        }
    }

    try {
        const container = context.extraInputs.get('container') as Container
        const exitRepo = container.get<IExitRepository>('IExitRepository')
        const exits = await exitRepo.getExits(locationId)

        return {
            status: 200,
            headers: {
                [CORRELATION_HEADER]: correlationId,
                'Content-Type': 'application/json; charset=utf-8'
            },
            jsonBody: ok({ exits }, correlationId)
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
