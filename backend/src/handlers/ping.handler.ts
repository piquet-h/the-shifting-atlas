import { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { SERVICE_BACKEND } from '@piquet-h/shared'
import { extractCorrelationId, trackGameEventStrict } from '../telemetry.js'
import { okResponse } from './utils/responseBuilder.js'

interface PingData {
    service: string
    timestamp: string
    requestId?: string
    latencyMs: number
    echo?: string
    version?: string
}

export async function ping(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const started = Date.now()
    const correlationId = extractCorrelationId(request.headers)
    const echo = request.query.get('name') || (await safeReadBodyText(request))
    const latencyMs = Date.now() - started
    // Emit telemetry (room-independent service liveness check) – tolerant if AI not configured.
    trackGameEventStrict('Ping.Invoked', { echo: echo || null, latencyMs }, { correlationId })

    const data: PingData = {
        service: SERVICE_BACKEND,
        timestamp: new Date().toISOString(),
        requestId: context.invocationId,
        latencyMs,
        echo: echo || undefined,
        version: process.env.APP_VERSION || undefined
    }

    return okResponse(data, { correlationId })
}

async function safeReadBodyText(request: HttpRequest): Promise<string | undefined> {
    try {
        const text = await request.text()
        return text?.trim() || undefined
    } catch {
        return undefined
    }
}
