const BASE: string = (import.meta.env.VITE_API_BASE as string) || '/api';

export interface PingResponse {
    ok: boolean;
    status: number;
    /** Milliseconds between request start and first byte read */
    latencyMs: number;
    /** Parsed JSON when server returns JSON body */
    json?: unknown;
    /** Raw text body (if non-JSON or JSON parse failed) */
    text?: string;
    error?: string;
}

export async function fetchPing(): Promise<PingResponse> {
    const performance: { now: () => number } | undefined =
        typeof window !== 'undefined' && window.performance ? window.performance : undefined;
    const start = performance ? performance.now() : Date.now();
    try {
        const res = await fetch(`${BASE}/ping`);
        const status = res.status;
        const end = performance ? performance.now() : Date.now();
        const latencyMs = end - start;

        let text: string | undefined;
        let json: unknown | undefined;

        // Try to parse JSON first (most robust for structured responses)
        try {
            const clone = res.clone();
            text = await clone.text();
            if (text) {
                try {
                    json = JSON.parse(text);
                } catch {
                    // Not valid JSON, keep text only.
                }
            }
        } catch {
            // Ignore body parse errors
        }

        if (!res.ok) {
            return {
                ok: false,
                status,
                latencyMs,
                text,
                json,
                error: `Ping failed (${status})`,
            };
        }

        return { ok: true, status, latencyMs, text, json };
    } catch (err) {
        return {
            ok: false,
            status: 0,
            latencyMs: (performance ? performance.now() : Date.now()) - start,
            error: err instanceof Error ? err.message : 'Unknown error',
        };
    }
}

export default { fetchPing };
