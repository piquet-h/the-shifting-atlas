import { app, HttpRequest, HttpResponseInit } from '@azure/functions'
import {
    CORRELATION_HEADER,
    ensurePlayerForRequest,
    extractCorrelationId,
    getPlayerRepository,
    ok,
    trackGameEventStrict
} from '@piquet-h/shared'

app.http('PlayerCreate', {
    route: 'player/create',
    methods: ['POST', 'GET'], // allow GET for simplicity during MVP
    authLevel: 'anonymous',
    handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
        const started = Date.now()
        const correlationId = extractCorrelationId(req.headers)
        const repo = await getPlayerRepository()
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
})
