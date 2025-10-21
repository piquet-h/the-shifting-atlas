import type { HttpRequest, HttpResponseInit } from '@azure/functions'
import { extractCorrelationId } from '../telemetry.js'
import { performMove } from './moveHandlerCore.js'
import { buildMoveResponse } from './moveHandlerResponse.js'

export async function handlePlayerMove(req: HttpRequest): Promise<HttpResponseInit> {
    const correlationId = extractCorrelationId(req.headers)
    const moveResult = await performMove(req)
    return buildMoveResponse(moveResult, correlationId)
}
