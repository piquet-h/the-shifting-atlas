import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import type { Container } from 'inversify'
import { inject, injectable } from 'inversify'
import type { ITelemetryClient } from '../telemetry/ITelemetryClient.js'
import { BaseHandler } from './base/BaseHandler.js'
import { performMove } from './moveHandlerCore.js'
import { buildMoveResponse } from './moveHandlerResponse.js'

@injectable()
export class PlayerMoveHandler extends BaseHandler {
    constructor(@inject('ITelemetryClient') telemetry: ITelemetryClient) {
        super(telemetry)
    }

    protected async execute(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
        const moveResult = await performMove(req, context)
        return buildMoveResponse(moveResult, this.correlationId)
    }
}

export async function handlePlayerMove(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const container = context.extraInputs.get('container') as Container
    const handler = container.get(PlayerMoveHandler)
    return handler.handle(req, context)
}
