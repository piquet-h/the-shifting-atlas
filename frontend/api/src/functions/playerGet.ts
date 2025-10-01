import { CORRELATION_HEADER, err, extractCorrelationId, getPlayerRepository, ok, trackGameEventStrict } from '@atlas/shared'
import { app, HttpRequest, HttpResponseInit } from '@azure/functions'

app.http('PlayerGet', {
    route: 'player/get',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
        const correlationId = extractCorrelationId(req.headers)
        const repo = getPlayerRepository()
        const id = req.query.get('id') || req.headers.get('x-player-guid') || undefined
        if (!id) {
            const body = err('MissingPlayerId', 'Player id or x-player-guid header required', correlationId)
            return { status: 400, headers: { [CORRELATION_HEADER]: correlationId }, jsonBody: body }
        }
        const rec = await repo.get(id)
        if (!rec) {
            trackGameEventStrict('Player.Get', { playerGuid: id, status: 404 }, { correlationId })
            const body = err('NotFound', 'Player not found', correlationId)
            return { status: 404, headers: { [CORRELATION_HEADER]: correlationId }, jsonBody: body }
        }
        trackGameEventStrict('Player.Get', { playerGuid: id, status: 200 }, { correlationId })
        const body = ok({ id: rec.id, guest: rec.guest, externalId: rec.externalId }, correlationId)
        return {
            status: 200,
            headers: { [CORRELATION_HEADER]: correlationId, 'x-player-guid': rec.id },
            jsonBody: body
        }
    }
})
