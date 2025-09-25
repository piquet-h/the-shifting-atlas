import {SERVICE_BACKEND} from '@atlas/shared'
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

export async function ping(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const started = Date.now()
    const echo = request.query.get('name') || (await safeReadBodyText(request))

    const payload: PingPayload = {
        ok: true,
        status: 200,
        service: SERVICE_BACKEND,
        timestamp: new Date().toISOString(),
        requestId: context.invocationId,
        latencyMs: Date.now() - started,
        echo: echo || undefined,
        version: process.env.APP_VERSION || undefined
    }

    return {
        status: 200,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
        },
        jsonBody: payload
    }
}

async function safeReadBodyText(request: HttpRequest): Promise<string | undefined> {
    try {
        const text = await request.text()
        return text?.trim() || undefined
    } catch {
        return undefined
    }
}

app.http('ping', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: ping
})
