import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { ensurePlayerForRequest } from '@piquet-h/shared'
import type { Container } from 'inversify'
import { inject, injectable } from 'inversify'
import { IPlayerRepository } from '../repos/playerRepository.js'
import type { ITelemetryClient } from '../telemetry/ITelemetryClient.js'
import { BaseHandler } from './base/BaseHandler.js'
import { okResponse } from './utils/responseBuilder.js'

@injectable()
export class PlayerCreateHandler extends BaseHandler {
    constructor(@inject('ITelemetryClient') telemetry: ITelemetryClient) {
        super(telemetry)
    }

    protected async execute(req: HttpRequest): Promise<HttpResponseInit> {
        const repo = this.getRepository<IPlayerRepository>('IPlayerRepository')

        const result = await ensurePlayerForRequest(req.headers, repo)
        if (result.created) {
            this.track('Player.Created', { playerGuid: result.playerGuid, method: result.source })
        }
        this.track('Player.Get', { playerGuid: result.playerGuid, status: 200 })
        return okResponse(
            {
                id: result.playerGuid,
                created: result.created,
                source: result.source,
                externalId: result.externalId
            },
            { correlationId: this.correlationId, playerGuid: result.playerGuid }
        )
    }
}

export async function createPlayerHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const container = context.extraInputs.get('container') as Container
    const handler = container.get(PlayerCreateHandler)
    return handler.handle(req, context)
}
