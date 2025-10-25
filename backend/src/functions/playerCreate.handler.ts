import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { ensurePlayerForRequest, ok } from '@piquet-h/shared'
import { Container } from 'inversify'
import { IPlayerRepository } from '../repos/playerRepository.js'
import { CORRELATION_HEADER, extractCorrelationId, trackGameEventStrict } from '../telemetry.js'

export async function createPlayerHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const started = Date.now()
    const correlationId = extractCorrelationId(req.headers)

    const container = context.extraInputs.get('container') as Container
    const repo = container.get<IPlayerRepository>('IPlayerRepository')

    const result = await ensurePlayerForRequest(req.headers, repo)
    if (result.created) {
        const latencyMs = Date.now() - started
        trackGameEventStrict('Player.Created', { playerGuid: result.playerGuid, method: result.source, latencyMs }, { correlationId })
    }
    const latencyMs = Date.now() - started
    trackGameEventStrict('Player.Get', { playerGuid: result.playerGuid, status: 200, latencyMs }, { correlationId })
    const body = ok(
        {
            id: result.playerGuid,
            created: result.created,
            source: result.source,
            externalId: result.externalId
        },
        correlationId
    )
    return {
        status: 200,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            [CORRELATION_HEADER]: correlationId,
            'x-player-guid': result.playerGuid
        },
        jsonBody: body
    }
}
