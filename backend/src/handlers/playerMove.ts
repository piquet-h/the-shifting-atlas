import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import type { Container } from 'inversify'
import { inject, injectable } from 'inversify'
import type { ITelemetryClient } from '../telemetry/ITelemetryClient.js'
import { BaseHandler } from './base/BaseHandler.js'
import { MoveHandler } from './moveCore.js'

@injectable()
export class PlayerMoveHandler extends BaseHandler {
    constructor(
        @inject('ITelemetryClient') telemetry: ITelemetryClient,
        @inject(MoveHandler) private moveHandler: MoveHandler
    ) {
        super(telemetry)
    }

    protected async execute(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
        // Validate playerId from path parameter with header fallback for backward compatibility
        const playerId = req.params.playerId || req.headers.get('x-player-guid')
        if (!playerId) {
            return {
                status: 400,
                headers: {
                    'x-correlation-id': this.correlationId,
                    'Content-Type': 'application/json; charset=utf-8'
                },
                jsonBody: {
                    error: 'MissingPlayerId',
                    message: 'Player id required in path or x-player-guid header',
                    correlationId: this.correlationId
                }
            }
        }

        // Validate GUID format
        const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        if (!guidRegex.test(playerId)) {
            return {
                status: 400,
                headers: {
                    'x-correlation-id': this.correlationId,
                    'Content-Type': 'application/json; charset=utf-8'
                },
                jsonBody: {
                    error: 'InvalidPlayerId',
                    message: 'Player id must be a valid GUID format',
                    correlationId: this.correlationId
                }
            }
        }

        // Delegate to MoveHandler for the actual move logic
        // Call handle() which will invoke MoveHandler's execute() method
        return this.moveHandler.handle(req, context)
    }
}

export async function handlePlayerMove(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const container = context.extraInputs.get('container') as Container
    const handler = container.get(PlayerMoveHandler)
    return handler.handle(req, context)
}
