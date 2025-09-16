import { useCallback, useEffect, useState } from 'react';

/**
 * Azure Static Web Apps Auth (client-side only)
 * Fetches identity from `/.auth/me` (served by SWA when auth is configured).
 * If unauthenticated the endpoint returns an empty object or 204/404 locally.
 * We treat any absence of `clientPrincipal` as anonymous.
 *
 * Sign-out: redirect to `/.auth/logout?post_logout_redirect_uri=/` which clears the
 * server session / provider cookie (where applicable) and then returns to home.
 *
 * NOTE: This is intentionally lean for MVP. A fuller implementation might:
 *  - Cache the principal in context to avoid duplicate fetches across tabs
 *  - Add a `signIn(provider)` helper (`/.auth/login/<provider>`)
 *  - Handle 401 vs network errors distinctly
 */

export interface ClientPrincipal {
    identityProvider: string;
    userId: string;
    userDetails: string; // usually email or username
    userRoles: string[];
}

interface AuthState {
    loading: boolean;
    user: ClientPrincipal | null;
    error: string | null;
    signOut: () => void;
    refresh: () => void;
}

export function useAuth(): AuthState {
    const [user, setUser] = useState<ClientPrincipal | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [nonce, setNonce] = useState(0);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch('/.auth/me', { headers: { 'x-swa-auth': 'true' } });
                if (!res.ok) {
                    // 404/204 when auth not configured locally -> anonymous
                    if (!cancelled) {
                        setUser(null);
                    }
                } else {
                    const data = await res.json();
                    const principal: ClientPrincipal | undefined = data?.clientPrincipal;
                    if (!cancelled) setUser(principal ?? null);
                }
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : 'Unknown error');
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => {
            cancelled = true;
        };
    }, [nonce]);

    const signOut = useCallback(() => {
        // Hard redirect ensures SWA auth cookies cleared server-side.
        window.location.href = '/.auth/logout?post_logout_redirect_uri=/';
    }, []);

    const refresh = useCallback(() => setNonce(n => n + 1), []);

    return { loading, user, error, signOut, refresh };
}

export default useAuth;
