import { app, HttpRequest, HttpResponseInit } from '@azure/functions'
import { err, ok } from '@piquet-h/shared'
import { getPlayerRepository } from '../repos/index.js'
import { CORRELATION_HEADER, extractCorrelationId, trackGameEventStrict } from '../telemetry.js'

interface LinkRequestBody {
    playerGuid?: string
}
interface LinkResponseBody {
    playerGuid: string
    linked: boolean
    alreadyLinked: boolean
    externalId?: string
}

export async function playerLink(request: HttpRequest): Promise<HttpResponseInit> {
    const started = Date.now()
    const correlationId = extractCorrelationId(request.headers)
    const playerRepo = await getPlayerRepository()
    let body: LinkRequestBody = {}
    try {
        body = (await request.json()) as LinkRequestBody
    } catch {
        // ignore
    }
    const guid = body.playerGuid?.trim()
    if (!guid) return json(400, err('MissingPlayerGuid', 'playerGuid required', correlationId))
    const record = await playerRepo.get(guid)
    if (!record) return json(404, err('PlayerNotFound', 'player not found', correlationId))
    const externalId = request.headers.get('x-external-id') || `ext-${guid.slice(0, 8)}`
    const alreadyLinked = !!record.externalId && record.guest === false
    if (!alreadyLinked) {
        const linkResult = await playerRepo.linkExternalId(guid, externalId)
        if (linkResult.conflict) {
            return json(409, err('ExternalIdConflict', 'externalId already linked to another player', correlationId))
        }
        if (linkResult.updated) {
            trackGameEventStrict('Auth.Player.Upgraded', { linkStrategy: 'merge', hadGuestProgress: true }, { playerGuid: guid })
        }
    }
    const latencyMs = Date.now() - started
    trackGameEventStrict('Player.Get', { playerGuid: guid, status: 200, latencyMs }, { correlationId, playerGuid: guid })
    const resBody: LinkResponseBody = { playerGuid: guid, linked: true, alreadyLinked, externalId: record.externalId }
    return json(200, ok({ ...resBody, latencyMs }, correlationId), guid)
}

function json(status: number, envelope: unknown, playerGuid?: string): HttpResponseInit {
    const correlationIdValue =
        typeof envelope === 'object' && envelope && 'correlationId' in (envelope as { correlationId?: string })
            ? (envelope as { correlationId?: string }).correlationId
            : undefined
    return {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            ...(playerGuid ? { 'x-player-guid': playerGuid } : {}),
            ...(correlationIdValue ? { [CORRELATION_HEADER]: correlationIdValue } : {})
        },
        jsonBody: envelope
    }
}

app.http('playerLink', { route: 'player/link', methods: ['POST'], authLevel: 'anonymous', handler: playerLink })
