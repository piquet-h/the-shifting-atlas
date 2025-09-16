const BASE: string = (import.meta.env.VITE_API_BASE as string) || '/api';

export interface HealthResponse {
    status?: string;
    service?: string;
    message?: string;
    error?: string;
    [key: string]: unknown;
}

export async function fetchHealth(): Promise<HealthResponse> {
    try {
        const res = await fetch(`${BASE}/health`);
        if (!res.ok) throw new Error('Network response not ok');
        return res.json() as Promise<HealthResponse>;
    } catch (err) {
        return { error: err instanceof Error ? err.message : 'Unknown error' };
    }
}

export default { fetchHealth };
