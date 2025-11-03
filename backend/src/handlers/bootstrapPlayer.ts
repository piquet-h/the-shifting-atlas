import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import type { PlayerBootstrapResponse } from '@piquet-h/shared'
import type { Container } from 'inversify'
import { inject, injectable } from 'inversify'
import type { IPlayerRepository } from '../repos/playerRepository.js'
import type { ITelemetryClient } from '../telemetry/ITelemetryClient.js'
import { BaseHandler } from './base/BaseHandler.js'
import { okResponse } from './utils/responseBuilder.js'

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

@injectable()
export class BootstrapPlayerHandler extends BaseHandler {
    constructor(@inject('ITelemetryClient') telemetry: ITelemetryClient) {
        super(telemetry)
    }

    protected async execute(request: HttpRequest): Promise<HttpResponseInit> {
        const playerRepo = this.getRepository<IPlayerRepository>('IPlayerRepository')

        const headerGuid = request.headers.get(HEADER_PLAYER_GUID) || undefined
        const validatedGuid = isValidUuidV4(headerGuid) ? headerGuid : undefined
        const clientHadValidGuid = validatedGuid !== undefined

        this.track('Onboarding.GuestGuid.Started', {})
        const { record, created } = await playerRepo.getOrCreate(validatedGuid)

        const reportedCreated = clientHadValidGuid ? false : created

        if (created) {
            this.track('Onboarding.GuestGuid.Created', { phase: 'bootstrap' })
        }
        this.track('Onboarding.GuestGuid.Completed', { created: reportedCreated })

        const body: PlayerBootstrapResponse = {
            playerGuid: record.id,
            created: reportedCreated,
            currentLocationId: record.currentLocationId || 'unknown',
            name: record.name
        }

        return okResponse({ ...body, latencyMs: this.latencyMs }, { correlationId: this.correlationId, playerGuid: record.id })
    }
}

export async function bootstrapPlayerHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const container = context.extraInputs.get('container') as Container
    const handler = container.get(BootstrapPlayerHandler)
    return handler.handle(request, context)
}
