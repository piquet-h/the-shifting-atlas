import { HttpRequest, HttpResponseInit } from '@azure/functions'
import { ok } from '@piquet-h/shared'
import { CORRELATION_HEADER, extractCorrelationId, trackGameEventStrict } from '../telemetry.js'

export async function backendHealth(req: HttpRequest): Promise<HttpResponseInit> {
    const started = Date.now()
    const correlationId = extractCorrelationId(req.headers)
    const latencyMs = Date.now() - started
    // Reuse Ping.Invoked semantic for health
    trackGameEventStrict('Ping.Invoked', { echo: 'health', latencyMs }, { correlationId })
    return {
        headers: { [CORRELATION_HEADER]: correlationId, 'Content-Type': 'application/json; charset=utf-8' },
        jsonBody: ok({ status: 'ok', service: 'backend-core', latencyMs }, correlationId)
    }
}

export async function backendPing(req: HttpRequest): Promise<HttpResponseInit> {
    const started = Date.now()
    const msg = req.query.get('msg') || 'pong'
    const correlationId = extractCorrelationId(req.headers)
    const latencyMs = Date.now() - started
    trackGameEventStrict('Ping.Invoked', { echo: msg, latencyMs }, { correlationId })
    return {
        headers: { [CORRELATION_HEADER]: correlationId, 'Content-Type': 'application/json; charset=utf-8' },
        jsonBody: ok({ reply: msg, latencyMs }, correlationId)
    }
}
