import { app, HttpRequest, HttpResponseInit } from '@azure/functions'
import { getPlayerRepository, trackGameEventStrict } from '@piquet-h/shared'

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
    const playerRepo = await getPlayerRepository()
    let body: LinkRequestBody = {}
    try {
        body = (await request.json()) as LinkRequestBody
    } catch {
        // ignore
    }
    const guid = body.playerGuid?.trim()
    if (!guid) return json(400, { error: 'playerGuid required' })
    const record = await playerRepo.get(guid)
    if (!record) return json(404, { error: 'player not found' })
    const externalId = request.headers.get('x-external-id') || `ext-${guid.slice(0, 8)}`
    const alreadyLinked = !!record.externalId && record.guest === false
    if (!alreadyLinked) {
        const linkResult = await playerRepo.linkExternalId(guid, externalId)
        if (linkResult.conflict) {
            return json(409, { code: 'externalId-conflict', playerId: linkResult.existingPlayerId })
        }
        if (linkResult.updated) {
            trackGameEventStrict('Auth.Player.Upgraded', { linkStrategy: 'merge', hadGuestProgress: true }, { playerGuid: guid })
        }
    }
    const latencyMs = Date.now() - started
    trackGameEventStrict('Player.Get', { playerGuid: guid, status: 200, latencyMs }, {})
    const resBody: LinkResponseBody = { playerGuid: guid, linked: true, alreadyLinked, externalId: record.externalId }
    return json(200, resBody)
}

function json(status: number, jsonBody: unknown): HttpResponseInit {
    return {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
        jsonBody
    }
}

app.http('playerLink', { route: 'player/link', methods: ['POST'], authLevel: 'anonymous', handler: playerLink })
