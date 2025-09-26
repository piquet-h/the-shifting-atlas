import {
    CORRELATION_HEADER,
    ensurePlayerForRequest,
    extractCorrelationId,
    getPlayerRepository,
    ok,
    trackGameEventStrict
} from '@atlas/shared'
import {app, HttpRequest, HttpResponseInit} from '@azure/functions'

app.http('PlayerCreate', {
    route: 'player/create',
    methods: ['POST', 'GET'], // allow GET for simplicity during MVP
    authLevel: 'anonymous',
    handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
        const correlationId = extractCorrelationId(req.headers)
        const repo = getPlayerRepository()
        const result = await ensurePlayerForRequest(req.headers, repo)
        if (result.created) {
            trackGameEventStrict('Player.Created', {playerGuid: result.playerGuid, method: result.source}, {correlationId})
        }
        trackGameEventStrict('Player.Get', {playerGuid: result.playerGuid, status: 200}, {correlationId})
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
