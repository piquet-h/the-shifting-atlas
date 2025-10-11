/* global localStorage */
import { useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import { usePlayerGuid } from './usePlayerGuid'

/**
 * useLinkGuestOnAuth
 * When a user signs in (SWA auth) and we have a locally persisted guest GUID,
 * call the linking endpoint to promote that guest to a regular profile.
 * Idempotent: stores localStorage flag to avoid duplicate POSTs
 */
export function useLinkGuestOnAuth() {
    const { isAuthenticated } = useAuth()
    const { playerGuid } = usePlayerGuid()
    const [linking, setLinking] = useState(false)
    const [linked, setLinked] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const FLAG_KEY = 'tsa.playerGuidLinked'
        if (!isAuthenticated || !playerGuid) return
        if (localStorage.getItem(FLAG_KEY)) {
            setLinked(true)
            return
        }
        let aborted = false
        const run = async () => {
            setLinking(true)
            setError(null)
            try {
                const res = await fetch('/api/player/link', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ playerGuid })
                })
                if (!res.ok) throw new Error(`Link failed: ${res.status}`)
                const data = await res.json()
                if (aborted) return
                if (data?.linked) {
                    localStorage.setItem(FLAG_KEY, '1')
                    setLinked(true)
                }
            } catch (e) {
                if (!aborted) setError(e instanceof Error ? e.message : 'Unknown error')
            } finally {
                if (!aborted) setLinking(false)
            }
        }
        run()
        return () => {
            aborted = true
        }
    }, [isAuthenticated, playerGuid])

    return { linking, linked, error }
}

export default useLinkGuestOnAuth
