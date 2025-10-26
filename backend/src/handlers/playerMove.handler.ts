import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import type { Container } from 'inversify'
import { inject, injectable } from 'inversify'
import type { ITelemetryClient } from '../telemetry/ITelemetryClient.js'
import { BaseHandler } from './base/BaseHandler.js'
import { MoveHandler } from './moveHandlerCore.js'

@injectable()
export class PlayerMoveHandler extends BaseHandler {
    constructor(@inject('ITelemetryClient') telemetry: ITelemetryClient) {
        super(telemetry)
    }

    protected async execute(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
        // Delegate to MoveHandler for the actual move logic
        const moveHandler = this.getRepository<MoveHandler>(MoveHandler.name)
        // Call handle() which will invoke MoveHandler's execute() method
        return moveHandler.handle(req, context)
    }
}

export async function handlePlayerMove(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const container = context.extraInputs.get('container') as Container
    const handler = container.get(PlayerMoveHandler)
    return handler.handle(req, context)
}
