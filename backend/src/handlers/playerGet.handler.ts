import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { IPlayerRepository } from '../repos/playerRepository.js'
import { extractCorrelationId, trackGameEventStrict } from '../telemetry.js'
import { getRepository } from './utils/contextHelpers.js'
import { errorResponse, okResponse } from './utils/responseBuilder.js'

export async function getPlayerHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const started = Date.now()
    const correlationId = extractCorrelationId(req.headers)

    const repo = getRepository<IPlayerRepository>(context, 'IPlayerRepository')

    const id = req.query.get('id') || req.headers.get('x-player-guid') || undefined
    if (!id) {
        return errorResponse(400, 'MissingPlayerId', 'Player id or x-player-guid header required', { correlationId })
    }
    const rec = await repo.get(id)
    if (!rec) {
        const latencyMs = Date.now() - started
        trackGameEventStrict('Player.Get', { playerGuid: id, status: 404, latencyMs }, { correlationId })
        return errorResponse(404, 'NotFound', 'Player not found', { correlationId })
    }
    const latencyMs = Date.now() - started
    trackGameEventStrict('Player.Get', { playerGuid: id, status: 200, latencyMs }, { correlationId })
    return okResponse({ id: rec.id, guest: rec.guest, externalId: rec.externalId }, { correlationId, playerGuid: rec.id })
}
