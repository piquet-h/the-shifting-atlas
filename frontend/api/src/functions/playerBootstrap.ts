import { CORRELATION_HEADER, extractCorrelationId, getPlayerRepository, trackGameEventStrict } from '@atlas/shared'
import { app, HttpRequest, HttpResponseInit } from '@azure/functions'

interface BootstrapResponseBody {
    playerGuid: string
    created: boolean
    currentLocationId: string
    name?: string
}

// Header used by client to suggest an existing GUID (idempotent bootstrap)
const HEADER_PLAYER_GUID = 'x-player-guid'

export async function playerBootstrap(request: HttpRequest): Promise<HttpResponseInit> {
    const started = Date.now()
    const correlationId = extractCorrelationId(request.headers)
    const playerRepo = await getPlayerRepository()
    const existing = request.headers.get(HEADER_PLAYER_GUID) || undefined
    trackGameEventStrict('Onboarding.GuestGuid.Started', {}, { correlationId })
    const { record, created } = await playerRepo.getOrCreate(existing)
    if (created) trackGameEventStrict('Onboarding.GuestGuid.Created', { phase: 'bootstrap' }, { playerGuid: record.id, correlationId })
    // Emit completion event (no GUID duplication beyond existing correlation unless needed for queries)
    trackGameEventStrict('Onboarding.GuestGuid.Completed', { created }, { playerGuid: record.id, correlationId })
    const latencyMs = Date.now() - started
    const body: BootstrapResponseBody = {
        playerGuid: record.id,
        created,
        currentLocationId: record.currentLocationId || 'unknown',
        name: record.name
    }
    return {
        status: 200,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            [CORRELATION_HEADER]: correlationId,
            'x-player-guid': record.id
        },
        jsonBody: { ...body, latencyMs }
    }
}

app.http('playerBootstrap', {
    route: 'player/bootstrap',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: playerBootstrap
})
