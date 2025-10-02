/*
 * Azure Functions Backend Entry Point (TypeScript)
 * Registers initial HTTP functions. Extend using additional files or folders and update package.json main glob if needed.
 */
import { app, HttpRequest, HttpResponseInit } from '@azure/functions'
// Initialize telemetry (side-effect import) & bring in helpers for explicit events
import { CORRELATION_HEADER, extractCorrelationId, trackGameEventStrict } from '@atlas/shared'
// Telemetry side effects are triggered via re-exports; explicit source path import removed to
// avoid depending on internal layout and path mapping.

app.http('BackendHealth', {
    route: 'backend/health',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
        const started = Date.now()
        const correlationId = extractCorrelationId(req.headers)
        const latencyMs = Date.now() - started
        // Reuse Ping.Invoked semantic for health
        trackGameEventStrict('Ping.Invoked', { echo: 'health', latencyMs }, { correlationId })
        return {
            headers: { [CORRELATION_HEADER]: correlationId },
            jsonBody: { status: 'ok', service: 'backend-core', latencyMs }
        }
    }
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
        return { headers: { [CORRELATION_HEADER]: correlationId }, jsonBody: { reply: msg, latencyMs } }
    }
})
