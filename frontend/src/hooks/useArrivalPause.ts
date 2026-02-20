/**
 * useArrivalPause Hook
 *
 * Manages auto-refresh timing and retry state when a navigation attempt receives
 * an ExitGenerationRequested response (pending path).  Replaces the manual "Try
 * Again" retry pattern with an immersive pause that automatically checks whether
 * the path has been generated.
 *
 * Features:
 * - Configurable refresh delay and max attempts
 * - Deterministic narrative copy per attempt (escalating)
 * - Timer cleanup on unmount (no leaks)
 * - Telemetry for each auto-refresh attempt and exhaustion
 *
 * Reference: Issue #809 - Immersive arrival pause for pending paths
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTelemetry } from '../telemetry/TelemetryContext'

/** Narrative copy per attempt (0-indexed, deterministic) */
export const ARRIVAL_PAUSE_COPY = [
    'The mist hangs thick to the {direction}. Something stirs beyond the edge of the known world…',
    'The mist thins… you sense the path to the {direction} is nearly charted.',
    "The cartographer's ink dries slowly. The {direction} way will reveal itself in moments."
]

/** Narrative copy when max attempts are exhausted */
export const ARRIVAL_PAUSE_EXHAUSTED_COPY = 'The {direction} path remains shrouded for now. The world reveals itself on its own time.'

const DEFAULT_MAX_ATTEMPTS = 3
const DEFAULT_REFRESH_DELAY_MS = 2000

export interface UseArrivalPauseOptions {
    /** Direction the player attempted to move */
    direction: string
    /** Optional correlation ID for telemetry */
    correlationId?: string
    /** Maximum number of auto-refresh attempts before giving up (default: 3) */
    maxAttempts?: number
    /** Delay between refresh attempts in milliseconds (default: 2000) */
    refreshDelayMs?: number
    /** Called when it is time to refresh location state */
    onRefresh: () => void
    /** Called when max attempts have been exhausted */
    onExhausted: () => void
}

export interface UseArrivalPauseResult {
    /** Current attempt count (0 = waiting for first refresh) */
    attempt: number
    /** Maximum configured attempts */
    maxAttempts: number
    /** True when max attempts have been exhausted */
    isExhausted: boolean
    /** Narrative copy to display (varies by attempt) */
    narrativeCopy: string
}

/** Apply {direction} placeholder to a narrative template */
function applyDirectionPlaceholder(template: string, direction: string): string {
    return template.replace(/\{direction\}/g, direction)
}

/**
 * useArrivalPause
 *
 * Schedules auto-refresh attempts for a pending navigation path.
 * Emits telemetry for each attempt and when exhausted.
 * Clears timers on unmount to prevent memory leaks.
 */
export function useArrivalPause({
    direction,
    correlationId,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    refreshDelayMs = DEFAULT_REFRESH_DELAY_MS,
    onRefresh,
    onExhausted
}: UseArrivalPauseOptions): UseArrivalPauseResult {
    const [attempt, setAttempt] = useState(0)
    const [isExhausted, setIsExhausted] = useState(false)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const telemetry = useTelemetry()

    const clearTimer = useCallback(() => {
        if (timerRef.current !== null) {
            clearTimeout(timerRef.current)
            timerRef.current = null
        }
    }, [])

    useEffect(() => {
        if (isExhausted) return

        timerRef.current = setTimeout(() => {
            const nextAttempt = attempt + 1

            telemetry.trackGameEvent('Navigation.ArrivalPause.AutoRefresh', {
                direction,
                attempt: nextAttempt,
                correlationId
            })

            onRefresh()

            if (nextAttempt >= maxAttempts) {
                setIsExhausted(true)
                telemetry.trackGameEvent('Navigation.ArrivalPause.Exhausted', {
                    direction,
                    correlationId
                })
                onExhausted()
            } else {
                setAttempt(nextAttempt)
            }
        }, refreshDelayMs)

        return () => clearTimer()
    }, [isExhausted, attempt, direction, correlationId, maxAttempts, refreshDelayMs, onRefresh, onExhausted, telemetry, clearTimer])

    const narrativeCopy = isExhausted
        ? applyDirectionPlaceholder(ARRIVAL_PAUSE_EXHAUSTED_COPY, direction)
        : applyDirectionPlaceholder(ARRIVAL_PAUSE_COPY[Math.min(attempt, ARRIVAL_PAUSE_COPY.length - 1)], direction)

    return { attempt, maxAttempts, isExhausted, narrativeCopy }
}

export default useArrivalPause
