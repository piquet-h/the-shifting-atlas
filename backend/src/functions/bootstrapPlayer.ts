import { app, HttpRequest, HttpResponseInit } from '@azure/functions'
import { ok } from '@piquet-h/shared'
import { getPlayerRepository } from '../repos/index.js'
import { CORRELATION_HEADER, extractCorrelationId, trackGameEventStrict } from '../telemetry.js'

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

/**
 * Validates that a string is a valid UUID v4.
 * Returns true only for properly formatted UUID v4 (version 4, variant 1).
 */
function isValidUuidV4(value: string | null | undefined): boolean {
    if (!value || typeof value !== 'string') return false
    // Trim whitespace and check if empty
    const trimmed = value.trim()
    if (trimmed.length === 0) return false
    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    // where y is one of [8, 9, a, b] (variant bits)
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    return uuidV4Regex.test(trimmed)
}

export async function playerBootstrap(request: HttpRequest): Promise<HttpResponseInit> {
    const started = Date.now()
    const correlationId = extractCorrelationId(request.headers)
    const playerRepo = await getPlayerRepository()
    const headerGuid = request.headers.get(HEADER_PLAYER_GUID) || undefined

    // Validate the header GUID - if invalid/empty, pass undefined to generate new
    const validatedGuid = isValidUuidV4(headerGuid) ? headerGuid : undefined
    const clientHadValidGuid = validatedGuid !== undefined

    trackGameEventStrict('Onboarding.GuestGuid.Started', {}, { correlationId })
    const { record, created } = await playerRepo.getOrCreate(validatedGuid)

    // For bootstrap idempotency: if client provided a valid GUID, report created=false
    // (even if we just created the player record, from client's perspective it's not new)
    const reportedCreated = clientHadValidGuid ? false : created

    if (created) {
        trackGameEventStrict('Onboarding.GuestGuid.Created', { phase: 'bootstrap' }, { playerGuid: record.id, correlationId })
    }
    // Emit completion event
    trackGameEventStrict('Onboarding.GuestGuid.Completed', { created: reportedCreated }, { playerGuid: record.id, correlationId })
    const latencyMs = Date.now() - started
    const body: BootstrapResponseBody = {
        playerGuid: record.id,
        created: reportedCreated,
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
        jsonBody: ok({ ...body, latencyMs }, correlationId)
    }
}

app.http('playerBootstrap', {
    route: 'player/bootstrap',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: playerBootstrap
})
