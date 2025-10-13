import { app, HttpRequest, HttpResponseInit } from '@azure/functions'
import { CORRELATION_HEADER, extractCorrelationId, getPlayerRepository, trackGameEventStrict } from '@piquet-h/shared'

/**
 * Player Bootstrap (migrated from legacy SWA managed API)
 * Route: GET /api/player/bootstrap
 * Behavior: Idempotently returns an existing guest player GUID or creates a new one.
 * Migration Notes: This logic previously lived in `frontend/api/src/functions/playerBootstrap.ts` and is now
 * the authoritative backend implementation. The SWA managed API has been deprecated.
 */
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
    if (created) {
        trackGameEventStrict('Onboarding.GuestGuid.Created', { phase: 'bootstrap' }, { playerGuid: record.id, correlationId })
    }
    // Emit completion event
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
