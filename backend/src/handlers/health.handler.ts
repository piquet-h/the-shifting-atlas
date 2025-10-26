import { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import type { Container } from 'inversify'
import { inject, injectable } from 'inversify'
import type { ITelemetryClient } from '../telemetry/ITelemetryClient.js'
import { BaseHandler } from './base/BaseHandler.js'
import { okResponse } from './utils/responseBuilder.js'

@injectable()
export class HealthHandler extends BaseHandler {
    constructor(@inject('ITelemetryClient') telemetry: ITelemetryClient) {
        super(telemetry)
    }

    protected async execute(): Promise<HttpResponseInit> {
        // Reuse Ping.Invoked semantic for health
        this.track('Ping.Invoked', { echo: 'health' })
        return okResponse({ status: 'ok', service: 'backend-core', latencyMs: this.latencyMs }, { correlationId: this.correlationId })
    }
}

@injectable()
export class SimplePingHandler extends BaseHandler {
    constructor(@inject('ITelemetryClient') telemetry: ITelemetryClient) {
        super(telemetry)
    }

    protected async execute(req: HttpRequest): Promise<HttpResponseInit> {
        const msg = req.query.get('msg') || 'pong'
        this.track('Ping.Invoked', { echo: msg })
        return okResponse({ reply: msg, latencyMs: this.latencyMs }, { correlationId: this.correlationId })
    }
}

export async function backendHealth(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const container = context.extraInputs.get('container') as Container
    const handler = container.get(HealthHandler)
    return handler.handle(req, context)
}

export async function backendPing(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const container = context.extraInputs.get('container') as Container
    const handler = container.get(SimplePingHandler)
    return handler.handle(req, context)
}
