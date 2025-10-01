/* global localStorage */
import { useCallback, useEffect, useState } from 'react'
import { trackGameEventClient } from '../services/telemetry'

/**
 * usePlayerGuid
 * Responsible for obtaining and persisting a stable player GUID for guest users.
 * MVP (PR1):
 *  - Stores guid in localStorage under key `tsa.playerGuid`.
 *  - Calls GET /api/player (alias to bootstrap) to allocate or confirm a GUID.
 *  - Emits simple console telemetry placeholders (future: dedicated telemetry endpoint).
 */
export interface PlayerGuidState {
    playerGuid: string | null
    loading: boolean
    created: boolean | null // null until first response
    error: string | null
    refresh: () => void // force re-run bootstrap (rare)
}

const STORAGE_KEY = 'tsa.playerGuid'

export function usePlayerGuid(): PlayerGuidState {
    const [playerGuid, setPlayerGuid] = useState<string | null>(null)
    const [created, setCreated] = useState<boolean | null>(null)
    const [loading, setLoading] = useState<boolean>(true)
    const [error, setError] = useState<string | null>(null)
    const [nonce, setNonce] = useState(0)

    const readLocal = useCallback(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY)
            return stored && /^[0-9a-fA-F-]{36}$/.test(stored) ? stored : null
        } catch {
            return null
        }
    }, [])

    const writeLocal = useCallback((guid: string) => {
        try {
            localStorage.setItem(STORAGE_KEY, guid)
        } catch {
            /* ignore */
        }
    }, [])

    useEffect(() => {
        let aborted = false
        const run = async () => {
            setLoading(true)
            setError(null)
            const existing = readLocal()
            if (existing) setPlayerGuid(existing) // optimistic usage
            try {
                trackGameEventClient('Onboarding.GuestGuid.Started')
                const res = await fetch('/api/player/bootstrap', {
                    method: 'GET',
                    headers: existing ? { 'x-player-guid': existing } : undefined
                })
                if (!res.ok) {
                    throw new Error(`Bootstrap failed: ${res.status}`)
                }
                const data = (await res.json()) as { playerGuid: string; created: boolean }
                if (aborted) return
                setPlayerGuid(data.playerGuid)
                setCreated(data.created)
                if (data.playerGuid !== existing) writeLocal(data.playerGuid)
                if (data.created) trackGameEventClient('Onboarding.GuestGuid.Created', { playerGuid: data.playerGuid })
            } catch (e) {
                if (!aborted) setError(e instanceof Error ? e.message : 'Unknown error')
            } finally {
                if (!aborted) setLoading(false)
            }
        }
        run()
        return () => {
            aborted = true
        }
    }, [nonce, readLocal, writeLocal])

    const refresh = useCallback(() => {
        setNonce((n) => n + 1)
    }, [])

    return { playerGuid, loading, created, error, refresh }
}

export default usePlayerGuid
