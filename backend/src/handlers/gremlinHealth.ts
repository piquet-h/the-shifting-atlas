import { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import type { Container } from 'inversify'
import { inject, injectable } from 'inversify'
import type { IGremlinClient } from '../gremlin/gremlinClient.js'
import { IPersistenceConfig, resolvePersistenceMode } from '../persistenceConfig.js'
import type { ITelemetryClient } from '../telemetry/ITelemetryClient.js'
import { BaseHandler } from './base/BaseHandler.js'
import { okResponse, serviceUnavailableResponse } from './utils/responseBuilder.js'

export interface GremlinHealthResponse {
    mode: 'memory' | 'cosmos'
    canQuery: boolean
    latencyMs: number
    strictFallback: boolean
    reason?: string
}

@injectable()
export class GremlinHealthHandler extends BaseHandler {
    constructor(@inject('ITelemetryClient') telemetry: ITelemetryClient) {
        super(telemetry)
    }

    protected async execute(): Promise<HttpResponseInit> {
        const mode = resolvePersistenceMode()
        const strictMode = process.env.PERSISTENCE_STRICT === '1' || process.env.PERSISTENCE_STRICT === 'true'

        let canQuery = true
        let queryLatencyMs = 0
        let reason: string | undefined

        // If mode is cosmos, attempt a lightweight query
        if (mode === 'cosmos') {
            const queryStart = Date.now()
            try {
                // Get persistence config to ensure cosmos is properly configured
                const config = this.container.get<IPersistenceConfig>('PersistenceConfig')
                if (!config.cosmos) {
                    canQuery = false
                    reason = 'cosmos-config-missing'
                } else {
                    // Attempt lightweight query
                    // Note: Using basic submit() for now. Future enhancement (issue #79) will add
                    // RU charge metrics via submitWithMetrics() for cost monitoring.
                    const gremlinClient = this.container.get<IGremlinClient>('GremlinClient')
                    await gremlinClient.submit('g.V().limit(1)')
                    queryLatencyMs = Date.now() - queryStart
                }
            } catch (error) {
                canQuery = false
                queryLatencyMs = Date.now() - queryStart
                reason = error instanceof Error ? error.message : 'query-failed'
            }
        }

        const response: GremlinHealthResponse = {
            mode,
            canQuery,
            latencyMs: mode === 'cosmos' ? queryLatencyMs : 0,
            strictFallback: strictMode,
            reason: canQuery ? undefined : reason
        }

        // Emit telemetry
        this.track('Health.Gremlin.Check', {
            mode,
            canQuery,
            latencyMs: response.latencyMs,
            strictMode,
            reason: response.reason
        })

        // Return 503 if strict mode is enabled and query failed
        if (strictMode && !canQuery) {
            return serviceUnavailableResponse(response, { correlationId: this.correlationId })
        }

        return okResponse(response, { correlationId: this.correlationId })
    }
}

export async function gremlinHealth(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const container = context.extraInputs.get('container') as Container
    const handler = container.get(GremlinHealthHandler)
    return handler.handle(req, context)
}
