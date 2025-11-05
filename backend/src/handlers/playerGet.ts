import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import type { Container } from 'inversify'
import { inject, injectable } from 'inversify'
import type { IPlayerRepository } from '../repos/playerRepository.js'
import type { ITelemetryClient } from '../telemetry/ITelemetryClient.js'
import { withTiming } from '../telemetry/timing.js'
import { BaseHandler } from './base/BaseHandler.js'
import { errorResponse, okResponse } from './utils/responseBuilder.js'
import { isValidGuid } from './utils/validation.js'

@injectable()
export class PlayerGetHandler extends BaseHandler {
    constructor(
        @inject('ITelemetryClient') telemetry: ITelemetryClient,
        @inject('IPlayerRepository') private playerRepo: IPlayerRepository
    ) {
        super(telemetry)
    }

    protected async execute(req: HttpRequest): Promise<HttpResponseInit> {
        // Extract playerId from path parameter, fallback to header for backward compatibility
        const id = req.params.playerId || req.headers.get('x-player-guid') || undefined
        if (!id) {
            return errorResponse(400, 'MissingPlayerId', 'Player id required in path or x-player-guid header', {
                correlationId: this.correlationId
            })
        }

        // Validate GUID format
        if (!isValidGuid(id)) {
            return errorResponse(400, 'InvalidPlayerId', 'Player id must be a valid GUID format', {
                correlationId: this.correlationId
            })
        }
        
        // Use withTiming to measure repository call latency
        const rec = await withTiming(
            'PlayerRepository.get',
            () => this.playerRepo.get(id),
            { category: 'repository', correlationId: this.correlationId }
        )
        
        if (!rec) {
            this.track('Player.Get', { playerGuid: id, status: 404 })
            return errorResponse(404, 'NotFound', 'Player not found', { correlationId: this.correlationId })
        }
        this.track('Player.Get', { playerGuid: id, status: 200 })
        return okResponse(
            { id: rec.id, guest: rec.guest, externalId: rec.externalId },
            { correlationId: this.correlationId, playerGuid: rec.id }
        )
    }
}

export async function getPlayerHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const container = context.extraInputs.get('container') as Container
    const handler = container.get(PlayerGetHandler)
    return handler.handle(req, context)
}
