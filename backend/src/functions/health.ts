/*
 * Azure Functions Backend Entry Point (TypeScript)
 * Registers initial HTTP functions. Extend using additional files or folders and update package.json main glob if needed.
 */
import { app, HttpRequest, HttpResponseInit } from '@azure/functions'
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

app.http('BackendHealth', {
    route: 'backend/health',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: backendHealth
})

app.http('BackendPing', {
    route: 'backend/ping',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
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
})
