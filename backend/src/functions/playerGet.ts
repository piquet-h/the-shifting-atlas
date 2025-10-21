import { app, HttpRequest, HttpResponseInit } from '@azure/functions'
import { err, ok } from '@piquet-h/shared'
import { getPlayerRepository } from '../repos/index.js'
import { CORRELATION_HEADER, extractCorrelationId, trackGameEventStrict } from '../telemetry.js'

app.http('PlayerGet', {
    route: 'player/get',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
        const started = Date.now()
        const correlationId = extractCorrelationId(req.headers)
        const repo = await getPlayerRepository()
        const id = req.query.get('id') || req.headers.get('x-player-guid') || undefined
        if (!id) {
            const body = err('MissingPlayerId', 'Player id or x-player-guid header required', correlationId)
            return {
                status: 400,
                headers: {
                    [CORRELATION_HEADER]: correlationId,
                    'Content-Type': 'application/json; charset=utf-8',
                    'Cache-Control': 'no-store'
                },
                jsonBody: body
            }
        }
        const rec = await repo.get(id)
        if (!rec) {
            const latencyMs = Date.now() - started
            trackGameEventStrict('Player.Get', { playerGuid: id, status: 404, latencyMs }, { correlationId })
            const body = err('NotFound', 'Player not found', correlationId)
            return {
                status: 404,
                headers: {
                    [CORRELATION_HEADER]: correlationId,
                    'Content-Type': 'application/json; charset=utf-8',
                    'Cache-Control': 'no-store'
                },
                jsonBody: body
            }
        }
        const latencyMs = Date.now() - started
        trackGameEventStrict('Player.Get', { playerGuid: id, status: 200, latencyMs }, { correlationId })
        const body = ok({ id: rec.id, guest: rec.guest, externalId: rec.externalId }, correlationId)
        return {
            status: 200,
            headers: {
                [CORRELATION_HEADER]: correlationId,
                'x-player-guid': rec.id,
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store'
            },
            jsonBody: body
        }
    }
})
