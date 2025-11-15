import { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { err, ok } from '@piquet-h/shared'
import type { Container } from 'inversify'
import { inject, injectable } from 'inversify'
import type { IExitRepository } from '../repos/exitRepository.js'
import type { ITelemetryClient } from '../telemetry/ITelemetryClient.js'
import { CORRELATION_HEADER } from '../telemetry/TelemetryService.js'
import { BaseHandler } from './base/BaseHandler.js'

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
            return {
                status: 400,
                headers: {
                    [CORRELATION_HEADER]: this.correlationId,
                    'Content-Type': 'application/json; charset=utf-8'
                },
                jsonBody: err('MissingLocationId', 'locationId query parameter is required', this.correlationId)
            }
        }

        try {
            const exits = await this.exitRepo.getExits(locationId)

            return {
                status: 200,
                headers: {
                    [CORRELATION_HEADER]: this.correlationId,
                    'Content-Type': 'application/json; charset=utf-8'
                },
                jsonBody: ok({ exits }, this.correlationId)
            }
        } catch (error) {
            return {
                status: 500,
                headers: {
                    [CORRELATION_HEADER]: this.correlationId,
                    'Content-Type': 'application/json; charset=utf-8'
                },
                jsonBody: err('InternalError', error instanceof Error ? error.message : 'Unknown error', this.correlationId)
            }
        }
    }
}

export async function getExitsHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const container = context.extraInputs.get('container') as Container
    const handler = container.get(GetExitsHandler)
    return handler.handle(req, context)
}
