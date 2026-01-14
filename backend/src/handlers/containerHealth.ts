import { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import type { Container } from 'inversify'
import { inject, injectable } from 'inversify'
import { TOKENS } from '../di/tokens.js'
import type { ITelemetryClient } from '../telemetry/ITelemetryClient.js'
import { BaseHandler } from './base/BaseHandler.js'
import { okResponse, serviceUnavailableResponse } from './utils/responseBuilder.js'

interface ContainerBindingStatus {
    token: string
    bound: boolean
}

interface ContainerHealthResponse {
    status: 'ok' | 'degraded'
    missing: string[]
    bindings: ContainerBindingStatus[]
    latencyMs: number
}

// Tokens and classes we consider critical for normal operation. If any are missing, health is degraded.
const REQUIRED_TOKENS: string[] = [
    TOKENS.TelemetryClient,
    TOKENS.PlayerRepository,
    TOKENS.LocationRepository,
    TOKENS.ExitRepository,
    TOKENS.DescriptionRepository,
    TOKENS.PersistenceConfig
]

// (Handler classes intentionally omitted to avoid cross-package coupling; token presence is sufficient.)

@injectable()
export class ContainerHealthHandler extends BaseHandler {
    constructor(@inject(TOKENS.TelemetryClient) telemetry: ITelemetryClient) {
        super(telemetry)
    }

    protected async execute(): Promise<HttpResponseInit> {
        const bindings: ContainerBindingStatus[] = []
        const missing: string[] = []

        for (const token of REQUIRED_TOKENS) {
            const bound = this.container.isBound(token)
            bindings.push({ token, bound })
            if (!bound) missing.push(token)
        }

        const status: 'ok' | 'degraded' = missing.length === 0 ? 'ok' : 'degraded'

        // Emit telemetry using existing Ping.Invoked event to avoid adding a new shared enum (cross-package PR split).
        this.track('Ping.Invoked', {
            echo: 'container-health',
            status,
            missing: missing.join(',') || 'none'
        })

        const response: ContainerHealthResponse = {
            status,
            missing,
            bindings,
            latencyMs: this.latencyMs
        }

        if (status === 'degraded') {
            return serviceUnavailableResponse(response, { correlationId: this.correlationId })
        }
        return okResponse(response, { correlationId: this.correlationId })
    }
}

export async function containerHealth(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const container = context.extraInputs.get('container') as Container
    const handler = container.get(ContainerHealthHandler)
    return handler.handle(req, context)
}
