import { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { SERVICE_BACKEND } from '@piquet-h/shared'
import type { Container } from 'inversify'
import { inject, injectable } from 'inversify'
import type { ITelemetryClient } from '../telemetry/ITelemetryClient.js'
import { BaseHandler } from './base/BaseHandler.js'
import { okResponse } from './utils/responseBuilder.js'

interface PingData {
    service: string
    timestamp: string
    requestId?: string
    latencyMs: number
    echo?: string
    version?: string
}

@injectable()
export class PingHandler extends BaseHandler {
    constructor(@inject('ITelemetryClient') telemetry: ITelemetryClient) {
        super(telemetry)
    }

    protected async execute(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
        const echo = request.query.get('name') || (await safeReadBodyText(request))

        // Emit telemetry (room-independent service liveness check)
        this.track('Ping.Invoked', { echo: echo || null })

        const data: PingData = {
            service: SERVICE_BACKEND,
            timestamp: new Date().toISOString(),
            requestId: context.invocationId,
            latencyMs: this.latencyMs,
            echo: echo || undefined,
            version: process.env.APP_VERSION || undefined
        }

        return okResponse(data, { correlationId: this.correlationId })
    }
}

export async function ping(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const container = context.extraInputs.get('container') as Container
    const handler = container.get(PingHandler)
    return handler.handle(request, context)
}

async function safeReadBodyText(request: HttpRequest): Promise<string | undefined> {
    try {
        const text = await request.text()
        return text?.trim() || undefined
    } catch {
        return undefined
    }
}
