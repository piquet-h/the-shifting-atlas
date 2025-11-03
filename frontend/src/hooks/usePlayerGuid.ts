/* global localStorage */
import type { PlayerBootstrapResponse } from '@piquet-h/shared'
import { useCallback, useEffect, useState } from 'react'
import { trackGameEventClient } from '../services/telemetry'
import { buildHeaders, buildPlayerUrl, isValidGuid } from '../utils/apiClient'
import { unwrapEnvelope } from '../utils/envelope'

/**
 * usePlayerGuid
 * Responsible for obtaining and persisting a stable player GUID for guest users.
 * Behavior:
 *  - Stores guid in localStorage under key `tsa.playerGuid`.
 *  - Calls GET /api/player/{playerId} to confirm existing GUID or GET /api/player to allocate new.
 *  - Emits telemetry events to Application Insights via trackGameEventClient.
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
            return stored && isValidGuid(stored) ? stored : null
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
                const url = existing ? buildPlayerUrl(existing) : '/api/player'
                const headers = buildHeaders()
                const res = await fetch(url, {
                    method: 'GET',
                    headers
                })
                if (!res.ok) {
                    throw new Error(`Bootstrap failed: ${res.status}`)
                }
                const json = await res.json()
                const unwrapped = unwrapEnvelope<PlayerBootstrapResponse>(json)

                if (!unwrapped.success || !unwrapped.data) {
                    throw new Error('Invalid response format from bootstrap')
                }

                if (aborted) return
                setPlayerGuid(unwrapped.data.playerGuid)
                setCreated(unwrapped.data.created)
                if (unwrapped.data.playerGuid !== existing) writeLocal(unwrapped.data.playerGuid)
                if (unwrapped.data.created) trackGameEventClient('Onboarding.GuestGuid.Created', { playerGuid: unwrapped.data.playerGuid })
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
