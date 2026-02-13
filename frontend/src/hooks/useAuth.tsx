/* global AbortController AbortSignal StorageEvent localStorage */
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

/**
 * Azure Static Web Apps Auth (client-side only)
 * Fetches identity from `/.auth/me` (served by SWA when auth is configured).
 * If unauthenticated the endpoint returns an empty object or 204/404 locally.
 * We treat any absence of `clientPrincipal` as anonymous.
 *
 * Sign-out: redirect to `/.auth/logout?post_logout_redirect_uri=/` which clears the
 * server session / provider cookie (where applicable) and then returns to home.
 */

export interface ClientPrincipal {
    identityProvider: string
    userId: string
    userDetails: string // usually email or username
    userRoles: string[]
}

export interface AuthContextValue {
    loading: boolean
    user: ClientPrincipal | null
    isAuthenticated: boolean
    error: string | null
    signIn: (provider?: string, redirectPath?: string) => void
    signOut: (redirectPath?: string) => void
    refresh: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

// LocalStorage channel key for broadcast across tabs (not security critical).
const LS_BROADCAST_KEY = 'tsa.auth.refresh'

async function fetchPrincipal(signal?: AbortSignal): Promise<ClientPrincipal | null> {
    try {
        const res = await fetch('/.auth/me', { headers: { 'x-swa-auth': 'true' }, signal })
        if (!res.ok) return null // 404/204 -> anonymous
        const data = await res.json()
        return (data?.clientPrincipal as ClientPrincipal) ?? null
    } catch {
        // Network error or fetch failure
        throw new Error('Login temporarily unavailable')
    }
}

export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
    const [user, setUser] = useState<ClientPrincipal | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const abortRef = useRef<AbortController | null>(null)
    const loadingRef = useRef(true)
    const [nonce, setNonce] = useState(0)

    const load = useCallback(async () => {
        abortRef.current?.abort()
        const controller = new AbortController()
        abortRef.current = controller
        setLoading(true)
        loadingRef.current = true
        setError(null)
        try {
            const principal = await fetchPrincipal(controller.signal)
            setUser(principal)
        } catch (e) {
            if ((e as any)?.name !== 'AbortError') {
                setError(e instanceof Error ? e.message : 'Unknown error')
            }
        } finally {
            setLoading(false)
            loadingRef.current = false
        }
    }, [])

    useEffect(() => {
        load()
        return () => abortRef.current?.abort()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nonce])

    // Cross-tab refresh broadcast
    useEffect(() => {
        function onStorage(ev: StorageEvent) {
            if (ev.key === LS_BROADCAST_KEY) {
                setNonce((n) => n + 1)
            }
        }
        window.addEventListener('storage', onStorage)
        return () => window.removeEventListener('storage', onStorage)
    }, [])

    const broadcast = useCallback(() => {
        try {
            localStorage.setItem(LS_BROADCAST_KEY, Date.now().toString())
        } catch {
            /* ignore */
        }
    }, [])

    const refresh = useCallback(() => setNonce((n) => n + 1), [])

    const signIn = useCallback((provider = 'msa', redirectPath = '/') => {
        const performLogin = async () => {
            // Wait deterministically for initial auth check to complete
            while (loadingRef.current) {
                await new Promise((resolve) => setTimeout(resolve, 10))
            }
            const url = `/.auth/login/${encodeURIComponent(provider)}?post_login_redirect_uri=${encodeURIComponent(redirectPath)}`
            window.location.href = url
        }
        performLogin()
    }, [])

    const signOut = useCallback(
        (redirectPath = '/') => {
            const url = `/.auth/logout?post_logout_redirect_uri=${encodeURIComponent(redirectPath)}`
            broadcast()
            window.location.href = url
        },
        [broadcast]
    )

    const value: AuthContextValue = useMemo(
        () => ({
            loading,
            user,
            isAuthenticated: !!user,
            error,
            signIn,
            signOut,
            refresh
        }),
        [loading, user, error, signIn, signOut, refresh]
    )

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// Hook consumers will use.
export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
    return ctx
}

export default useAuth
