import {SERVICE_SWA_API, trackEvent} from '@atlas/shared'
import {app, HttpRequest, HttpResponseInit, InvocationContext} from '@azure/functions'

interface PingPayload {
    ok: true
    status: number
    service: string
    timestamp: string
    requestId?: string
    latencyMs?: number
    echo?: string
    version?: string
}

async function readEcho(req: HttpRequest): Promise<string | undefined> {
    try {
        const body = await req.text()
        return body?.trim() || undefined
    } catch {
        return undefined
    }
}

export async function pingHandler(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
    const started = Date.now()
    const echo = req.query.get('name') || (await readEcho(req))
    const payload: PingPayload = {
        ok: true,
        status: 200,
        service: SERVICE_SWA_API,
        timestamp: new Date().toISOString(),
        requestId: ctx.invocationId,
        latencyMs: Date.now() - started,
        echo: echo || undefined,
        version: process.env.APP_VERSION || undefined
    }
    trackEvent('ping.invoked', {echo: echo || null, latencyMs: payload.latencyMs})
    return {
        status: 200,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
        },
        jsonBody: payload
    }
}

app.http('Ping', {
    route: 'ping',
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: pingHandler
})
