import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { extractCorrelationId } from '../telemetry.js'
import { performMove } from './moveHandlerCore.js'
import { buildMoveResponse } from './moveHandlerResponse.js'

export async function handlePlayerMove(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const correlationId = extractCorrelationId(req.headers)
    const moveResult = await performMove(req, context)
    return buildMoveResponse(moveResult, correlationId)
}
