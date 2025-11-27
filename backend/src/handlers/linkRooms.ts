import { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { isDirection } from '@piquet-h/shared'
import { Container, inject, injectable } from 'inversify'
import type { ILocationRepository } from '../repos/locationRepository.js'
import type { ITelemetryClient } from '../telemetry/ITelemetryClient.js'
import { BaseHandler } from './base/BaseHandler.js'
import { errorResponse, internalErrorResponse, okResponse } from './utils/responseBuilder.js'

/**
 * Handler to link two rooms with an EXIT edge.
 * Body: { originId: string, destId: string, dir: string, reciprocal?: boolean, description?: string }
 * Returns: { created: boolean, reciprocalCreated?: boolean }
 */
@injectable()
export class LinkRoomsHandler extends BaseHandler {
    constructor(
        @inject('ITelemetryClient') telemetry: ITelemetryClient,
        @inject('ILocationRepository') private locationRepo: ILocationRepository
    ) {
        super(telemetry)
    }

    protected async execute(req: HttpRequest): Promise<HttpResponseInit> {
        // Parse request body
        let body: Record<string, unknown>
        try {
            const text = await req.text()
            body = text ? JSON.parse(text) : {}
        } catch {
            return errorResponse(400, 'InvalidJson', 'Request body must be valid JSON', {
                correlationId: this.correlationId
            })
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
            return errorResponse(400, validationError.code, validationError.message, {
                correlationId: this.correlationId
            })
        }

        // Link the rooms (type assertions safe after validation)
        try {
            const result = await this.locationRepo.ensureExitBidirectional(originId as string, dir as string, destId as string, {
                reciprocal,
                description,
                reciprocalDescription: description
            })

            return okResponse(result, { correlationId: this.correlationId })
        } catch (error) {
            return internalErrorResponse(error, { correlationId: this.correlationId })
        }
    }
}

export async function linkRoomsHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const container = context.extraInputs.get('container') as Container
    const handler = container.get(LinkRoomsHandler)
    return handler.handle(req, context)
}
