import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { ok } from '@piquet-h/shared'
import { Container } from 'inversify'
import { IPlayerRepository } from '../repos/playerRepository.js'
import { CORRELATION_HEADER, extractCorrelationId, trackGameEventStrict } from '../telemetry.js'

interface BootstrapResponseBody {
    playerGuid: string
    created: boolean
    currentLocationId: string
    name?: string
}

const HEADER_PLAYER_GUID = 'x-player-guid'

/**
 * Validates that a string is a valid UUID v4.
 */
function isValidUuidV4(value: string | null | undefined): boolean {
    if (!value || typeof value !== 'string') return false
    const trimmed = value.trim()
    if (trimmed.length === 0) return false
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    return uuidV4Regex.test(trimmed)
}

export async function bootstrapPlayerHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const started = Date.now()
    const correlationId = extractCorrelationId(request.headers)

    const container = context.extraInputs.get('container') as Container
    const playerRepo = container.get<IPlayerRepository>('IPlayerRepository')

    const headerGuid = request.headers.get(HEADER_PLAYER_GUID) || undefined
    const validatedGuid = isValidUuidV4(headerGuid) ? headerGuid : undefined
    const clientHadValidGuid = validatedGuid !== undefined

    trackGameEventStrict('Onboarding.GuestGuid.Started', {}, { correlationId })
    const { record, created } = await playerRepo.getOrCreate(validatedGuid)

    const reportedCreated = clientHadValidGuid ? false : created

    if (created) {
        trackGameEventStrict('Onboarding.GuestGuid.Created', { phase: 'bootstrap' }, { playerGuid: record.id, correlationId })
    }
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
