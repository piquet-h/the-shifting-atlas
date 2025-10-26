import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { ensurePlayerForRequest } from '@piquet-h/shared'
import { IPlayerRepository } from '../repos/playerRepository.js'
import { extractCorrelationId, trackGameEventStrict } from '../telemetry.js'
import { getRepository } from './utils/contextHelpers.js'
import { okResponse } from './utils/responseBuilder.js'

export async function createPlayerHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const started = Date.now()
    const correlationId = extractCorrelationId(req.headers)

    const repo = getRepository<IPlayerRepository>(context, 'IPlayerRepository')

    const result = await ensurePlayerForRequest(req.headers, repo)
    if (result.created) {
        const latencyMs = Date.now() - started
        trackGameEventStrict('Player.Created', { playerGuid: result.playerGuid, method: result.source, latencyMs }, { correlationId })
    }
    const latencyMs = Date.now() - started
    trackGameEventStrict('Player.Get', { playerGuid: result.playerGuid, status: 200, latencyMs }, { correlationId })
    return okResponse(
        {
            id: result.playerGuid,
            created: result.created,
            source: result.source,
            externalId: result.externalId
        },
        { correlationId, playerGuid: result.playerGuid }
    )
}
