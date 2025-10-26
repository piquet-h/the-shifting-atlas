import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { BaseHandler } from './base/BaseHandler.js'
import { buildMoveResponse } from './moveHandlerResponse.js'
import { performMove } from './moveHandlerCore.js'

class PlayerMoveHandler extends BaseHandler {
    protected async execute(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
        const moveResult = await performMove(req, context)
        return buildMoveResponse(moveResult, this.correlationId)
    }
}

export async function handlePlayerMove(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const handler = new PlayerMoveHandler()
    return handler.handle(req, context)
}
