import { getPlayerRepository, trackGameEventStrict } from '@atlas/shared'
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'

/**
 * playerLink
 * POST /api/player/link
 * Links an existing guest player record to an authenticated principal (simulated).
 * MVP assumptions:
 *  - Auth layer (SWA) not yet wired into this standalone Functions project; we simulate by
 *    accepting an optional header `x-external-id` or generate a placeholder deterministic id.
 *  - Idempotent: calling again for an already linked player returns `alreadyLinked: true`.
 */
interface LinkRequestBody {
    playerGuid?: string
}
interface LinkResponseBody {
    playerGuid: string
    linked: boolean
    alreadyLinked: boolean
    externalId?: string
}

export async function playerLink(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    // Acquire repository per invocation to ensure we see fresh singleton even after test resets
    const playerRepo = getPlayerRepository()
    let body: LinkRequestBody = {}
    try {
        body = (await request.json()) as LinkRequestBody
    } catch {
        // ignore, treat as empty
    }
    const guid = body.playerGuid?.trim()
    if (!guid) {
        return json(400, { error: 'playerGuid required' })
    }
    const record = await playerRepo.get(guid)
    if (!record) {
        return json(404, { error: 'player not found' })
    }

    const externalId = request.headers.get('x-external-id') || `ext-${guid.slice(0, 8)}`

    const alreadyLinked = !!record.externalId && record.guest === false
    if (!alreadyLinked) {
        await playerRepo.linkExternalId(guid, externalId)
        const playerGuid = guid
        trackGameEventStrict('Auth.Player.Upgraded', { linkStrategy: 'merge', hadGuestProgress: true }, { playerGuid })
    }

    const resBody: LinkResponseBody = {
        playerGuid: guid,
        linked: true,
        alreadyLinked,
        externalId: record.externalId
    }
    context.log('playerLink', resBody)
    return json(200, resBody)
}

function json(status: number, jsonBody: unknown): HttpResponseInit {
    return {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
        jsonBody
    }
}

app.http('playerLink', {
    route: 'player/link',
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: playerLink
})

// PlayerRecord shape defined in shared repository (imported via getPlayerRepository())
