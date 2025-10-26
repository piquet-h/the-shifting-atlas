import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { STARTER_LOCATION_ID } from '@piquet-h/shared'
import type { Container } from 'inversify'
import { inject, injectable } from 'inversify'
import { ILocationRepository } from '../repos/locationRepository.js'
import type { ITelemetryClient } from '../telemetry/ITelemetryClient.js'
import { BaseHandler } from './base/BaseHandler.js'
import { errorResponse, okResponse } from './utils/responseBuilder.js'

@injectable()
export class LocationHandler extends BaseHandler {
    constructor(@inject('ITelemetryClient') telemetry: ITelemetryClient) {
        super(telemetry)
    }

    protected async execute(req: HttpRequest): Promise<HttpResponseInit> {
        const id = req.query.get('id') || STARTER_LOCATION_ID

        const locationRepo = this.getRepository<ILocationRepository>('ILocationRepository')

        const location = await locationRepo.get(id)
        if (!location) {
            this.track('Location.Get', { id, status: 404 })
            return errorResponse(404, 'NotFound', 'Location not found', { correlationId: this.correlationId })
        }
        this.track('Location.Get', { id, status: 200 })
        return okResponse(location, { correlationId: this.correlationId })
    }
}

export async function getLocationHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const container = context.extraInputs.get('container') as Container
    const handler = container.get(LocationHandler)
    return handler.handle(req, context)
}
