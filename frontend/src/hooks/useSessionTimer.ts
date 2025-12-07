/**
 * useSessionTimer
 * Tracks elapsed playtime for current session.
 * Persists across page refreshes via localStorage.
 * Returns formatted duration string (HH:MM:SS).
 */
import { useEffect, useState } from 'react'

const SESSION_START_KEY = 'atlas_session_start'

/**
 * Get session start timestamp from localStorage or create new one
 */
function getSessionStart(): number {
    const stored = localStorage.getItem(SESSION_START_KEY)
    if (stored) {
        const timestamp = parseInt(stored, 10)
        if (!isNaN(timestamp) && timestamp > 0) {
            return timestamp
        }
    }
    // Initialize new session
    const now = Date.now()
    localStorage.setItem(SESSION_START_KEY, now.toString())
    return now
}

/**
 * Format elapsed milliseconds as HH:MM:SS
 */
function formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60

    return [hours, minutes, seconds].map((n) => n.toString().padStart(2, '0')).join(':')
}

export interface UseSessionTimerResult {
    /** Formatted duration string (HH:MM:SS) */
    duration: string
    /** Elapsed milliseconds */
    elapsedMs: number
    /** Reset timer to current timestamp */
    reset: () => void
}

/**
 * Hook to track session duration with automatic updates
 * Updates every second for smooth timer display
 */
export function useSessionTimer(): UseSessionTimerResult {
    const [sessionStart] = useState<number>(getSessionStart)
    const [elapsedMs, setElapsedMs] = useState<number>(Date.now() - sessionStart)

    useEffect(() => {
        const interval = setInterval(() => {
            setElapsedMs(Date.now() - sessionStart)
        }, 1000)

        return () => clearInterval(interval)
    }, [sessionStart])

    const reset = () => {
        const now = Date.now()
        localStorage.setItem(SESSION_START_KEY, now.toString())
        setElapsedMs(0)
    }

    return {
        duration: formatDuration(elapsedMs),
        elapsedMs,
        reset
    }
}

export default useSessionTimer
