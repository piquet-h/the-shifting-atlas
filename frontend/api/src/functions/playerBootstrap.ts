import { getPlayerRepository, trackGameEventStrict } from '@atlas/shared'
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'

interface BootstrapResponseBody {
    playerGuid: string
    created: boolean
    currentLocationId: string
    name?: string
}

// Header used by client to suggest an existing GUID (idempotent bootstrap)
const HEADER_PLAYER_GUID = 'x-player-guid'

export async function playerBootstrap(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    // Obtain repository per invocation (avoids stale singleton reference in tests after resets)
    const playerRepo = getPlayerRepository()
    const existing = request.headers.get(HEADER_PLAYER_GUID) || undefined
    trackGameEventStrict('Onboarding.GuestGuid.Started', {})
    const { record, created } = await playerRepo.getOrCreate(existing)
    if (created) trackGameEventStrict('Onboarding.GuestGuid.Created', { phase: 'bootstrap' }, { playerGuid: record.id })
    const body: BootstrapResponseBody = {
        playerGuid: record.id,
        created,
        currentLocationId: record.currentLocationId || 'unknown',
        name: record.name
    }
    context.log('playerBootstrap', body)
    return { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, jsonBody: body }
}

app.http('playerBootstrap', {
    route: 'player/bootstrap',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: playerBootstrap
})
