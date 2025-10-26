import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { IPlayerRepository } from '../repos/playerRepository.js'
import { trackGameEventStrict } from '../telemetry.js'
import { BaseHandler } from './base/BaseHandler.js'
import { errorResponse, okResponse } from './utils/responseBuilder.js'

interface LinkRequestBody {
    playerGuid?: string
}
interface LinkResponseBody {
    playerGuid: string
    linked: boolean
    alreadyLinked: boolean
    externalId?: string
}

class PlayerLinkHandler extends BaseHandler {
    protected async execute(request: HttpRequest): Promise<HttpResponseInit> {
        const playerRepo = this.getRepository<IPlayerRepository>('IPlayerRepository')

        let body: LinkRequestBody = {}
        try {
            body = (await request.json()) as LinkRequestBody
        } catch {
            // ignore
        }
        const guid = body.playerGuid?.trim()
        if (!guid) {
            return errorResponse(400, 'MissingPlayerGuid', 'playerGuid required', { correlationId: this.correlationId })
        }

        const record = await playerRepo.get(guid)
        if (!record) {
            return errorResponse(404, 'PlayerNotFound', 'player not found', { correlationId: this.correlationId })
        }

        const externalId = request.headers.get('x-external-id') || `ext-${guid.slice(0, 8)}`
        const alreadyLinked = !!record.externalId && record.guest === false

        if (!alreadyLinked) {
            const linkResult = await playerRepo.linkExternalId(guid, externalId)
            if (linkResult.conflict) {
                return errorResponse(409, 'ExternalIdConflict', 'externalId already linked to another player', {
                    correlationId: this.correlationId
                })
            }
            if (linkResult.updated) {
                trackGameEventStrict(
                    'Auth.Player.Upgraded',
                    { linkStrategy: 'merge', hadGuestProgress: true },
                    { playerGuid: guid, correlationId: this.correlationId }
                )
            }
        }

        trackGameEventStrict(
            'Player.Get',
            { playerGuid: guid, status: 200, latencyMs: this.latencyMs },
            { correlationId: this.correlationId, playerGuid: guid }
        )

        const resBody: LinkResponseBody = {
            playerGuid: guid,
            linked: true,
            alreadyLinked,
            externalId: record.externalId
        }
        return okResponse({ ...resBody, latencyMs: this.latencyMs }, { correlationId: this.correlationId, playerGuid: guid })
    }
}

export async function linkPlayerHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const handler = new PlayerLinkHandler()
    return handler.handle(request, context)
}
