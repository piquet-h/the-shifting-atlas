import { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import type { Container } from 'inversify'
import { inject, injectable } from 'inversify'
import type { IExitRepository } from '../repos/exitRepository.js'
import type { ITelemetryClient } from '../telemetry/ITelemetryClient.js'
import { BaseHandler } from './base/BaseHandler.js'
import { errorResponse, internalErrorResponse, okResponse } from './utils/responseBuilder.js'

/**
 * Handler to get all exits from a location.
 * Returns: { exits: Array<{ direction, toLocationId, description?, kind?, state? }> }
 */
@injectable()
export class GetExitsHandler extends BaseHandler {
    constructor(
        @inject('ITelemetryClient') telemetry: ITelemetryClient,
        @inject('IExitRepository') private exitRepo: IExitRepository
    ) {
        super(telemetry)
    }

    protected async execute(req: HttpRequest): Promise<HttpResponseInit> {
        const locationId = req.query.get('locationId')
        if (!locationId) {
            return errorResponse(400, 'MissingLocationId', 'locationId query parameter is required', {
                correlationId: this.correlationId
            })
        }

        try {
            const exits = await this.exitRepo.getExits(locationId)

            return okResponse({ exits }, { correlationId: this.correlationId })
        } catch (error) {
            return internalErrorResponse(error, { correlationId: this.correlationId })
        }
    }
}

export async function getExitsHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const container = context.extraInputs.get('container') as Container
    const handler = container.get(GetExitsHandler)
    return handler.handle(req, context)
}
