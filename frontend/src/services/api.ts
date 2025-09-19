const BASE: string = (import.meta.env.VITE_API_BASE as string) || '/api';

// A lightweight ping response. Some backends may return JSON, others plain text or empty body.
// We normalize into this shape.
export interface PingResponse {
    ok: boolean; // true if request succeeded (HTTP 200-299)
    /** Optional echoed greeting or body content */
    bodyText?: string;
    /** Raw status code returned */
    status: number;
    /** Error message if the ping failed */
    error?: string;
}

export async function fetchPing(): Promise<PingResponse> {
    try {
        const res = await fetch(`${BASE}/ping`);
        const status = res.status;
        let bodyText: string | undefined;
        try {
            // Attempt to parse as text (covers text or empty). If JSON, keep raw string for now; could extend later.
            bodyText = await res.text();
        } catch {
            bodyText = undefined;
        }
        if (!res.ok) {
            return { ok: false, status, bodyText, error: `Ping failed (${status})` };
        }
        return { ok: true, status, bodyText };
    } catch (err) {
        return {
            ok: false,
            status: 0,
            error: err instanceof Error ? err.message : 'Unknown error',
        };
    }
}

export default { fetchPing };
