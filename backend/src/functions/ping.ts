import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { SERVICE_BACKEND } from '../shared/serviceConstants.js';

// Structured Ping Response Contract
// Mirrors frontend expectations (see frontend services/ping.ts) and can be extended.
interface PingPayload {
    ok: true;
    status: number; // HTTP status code (always 200 here)
    service: string; // Logical service name
    timestamp: string; // ISO timestamp when response generated
    requestId?: string; // Azure Functions invocation id (if available)
    latencyMs?: number; // Basic server-side measured latency window
    echo?: string; // Optional name/body echo
    version?: string; // Service version placeholder (env-driven later)
}

export async function ping(
    request: HttpRequest,
    context: InvocationContext,
): Promise<HttpResponseInit> {
    const started = Date.now();
    const echo = request.query.get('name') || (await safeReadBodyText(request));

    // Build payload
    const payload: PingPayload = {
        ok: true,
        status: 200,
        service: SERVICE_BACKEND,
        timestamp: new Date().toISOString(),
        requestId: context.invocationId,
        latencyMs: Date.now() - started,
        echo: echo || undefined,
        version: process.env.APP_VERSION || undefined,
    };

    return {
        status: 200,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
        },
        jsonBody: payload,
    };
}

async function safeReadBodyText(request: HttpRequest): Promise<string | undefined> {
    try {
        const text = await request.text();
        return text?.trim() || undefined;
    } catch {
        return undefined;
    }
}

app.http('ping', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: ping,
});
