/**
 * usePlayerGuid
 * React hook for obtaining and managing player GUID.
 *
 * Thin orchestrator that delegates to:
 * - playerService: API calls and telemetry
 * - localStorage utilities: Persistent storage
 *
 * Prevents race conditions by guarding against concurrent bootstrap requests.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { bootstrapPlayer, getStoredPlayerGuid } from '../services/playerService'

export interface PlayerGuidState {
    playerGuid: string | null
    loading: boolean
    created: boolean | null // null until first response
    error: string | null
    refresh: () => void // force re-run bootstrap (rare)
}

export function usePlayerGuid(): PlayerGuidState {
    const [playerGuid, setPlayerGuid] = useState<string | null>(null)
    const [created, setCreated] = useState<boolean | null>(null)
    const [loading, setLoading] = useState<boolean>(true)
    const [error, setError] = useState<string | null>(null)
    const [nonce, setNonce] = useState(0)
    const bootstrapInProgress = useRef(false)
    const hasBootstrapped = useRef(false)

    useEffect(() => {
        // Prevent any bootstrap if we've already successfully completed one
        if (hasBootstrapped.current) return

        // Prevent concurrent bootstrap requests
        if (bootstrapInProgress.current) return

        let aborted = false

        const run = async () => {
            bootstrapInProgress.current = true
            setLoading(true)
            setError(null)

            // Optimistically set from storage while verifying
            const existing = getStoredPlayerGuid()
            if (existing) setPlayerGuid(existing)

            try {
                const result = await bootstrapPlayer(existing)

                if (aborted) return

                setPlayerGuid(result.playerGuid)
                setCreated(result.created)
                hasBootstrapped.current = true
            } catch (e) {
                if (!aborted) {
                    setError(e instanceof Error ? e.message : 'Unknown error')
                }
            } finally {
                if (!aborted) {
                    setLoading(false)
                }
                bootstrapInProgress.current = false
            }
        }

        run()

        return () => {
            aborted = true
        }
    }, [nonce])

    const refresh = useCallback(() => {
        setNonce((n) => n + 1)
    }, [])

    return { playerGuid, loading, created, error, refresh }
}

export default usePlayerGuid
