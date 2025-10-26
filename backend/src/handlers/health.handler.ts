import { HttpRequest, HttpResponseInit } from '@azure/functions'
import { extractCorrelationId, trackGameEventStrict } from '../telemetry.js'
import { okResponse } from './utils/responseBuilder.js'

export async function backendHealth(req: HttpRequest): Promise<HttpResponseInit> {
    const started = Date.now()
    const correlationId = extractCorrelationId(req.headers)
    const latencyMs = Date.now() - started
    // Reuse Ping.Invoked semantic for health
    trackGameEventStrict('Ping.Invoked', { echo: 'health', latencyMs }, { correlationId })
    return okResponse({ status: 'ok', service: 'backend-core', latencyMs }, { correlationId })
}

export async function backendPing(req: HttpRequest): Promise<HttpResponseInit> {
    const started = Date.now()
    const msg = req.query.get('msg') || 'pong'
    const correlationId = extractCorrelationId(req.headers)
    const latencyMs = Date.now() - started
    trackGameEventStrict('Ping.Invoked', { echo: msg, latencyMs }, { correlationId })
    return okResponse({ reply: msg, latencyMs }, { correlationId })
}
