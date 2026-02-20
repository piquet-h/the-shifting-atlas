/**
 * ArrivalPauseOverlay Component
 *
 * Displays an immersive arrival pause when the backend indicates generation is
 * in progress for a pending navigation path (ExitGenerationRequested).
 *
 * Unlike SoftDenialOverlay, this component:
 * - Has NO manual retry button — auto-refreshes instead
 * - Shows escalating narrative copy across attempts
 * - Signals readiness to the parent when the hook exhausts attempts
 *
 * Features:
 * - Auto-refresh via useArrivalPause hook (configurable delay + retry cap)
 * - Attempt-based narrative escalation (deterministic, direction-keyed)
 * - Explore Elsewhere and Dismiss action buttons
 * - Telemetry: Navigation.ArrivalPause.Shown on mount
 * - Accessible: role="dialog", ARIA labels, Escape key to dismiss
 *
 * Reference: Issue #809 - Immersive arrival pause for pending paths
 */

import React, { useCallback, useEffect } from 'react'
import { useTelemetry } from '../telemetry/TelemetryContext'
import { useArrivalPause } from '../hooks/useArrivalPause'

export interface ArrivalPauseOverlayProps {
    /** The direction the player attempted to move */
    direction: string
    /** Optional correlation ID for telemetry */
    correlationId?: string
    /** Called by the hook when it is time to refresh location state */
    onRefresh: () => void
    /** Called when auto-refresh attempts are exhausted */
    onExhausted: () => void
    /** Called when the player chooses to explore other directions */
    onExplore: () => void
    /** Called when the player dismisses the overlay */
    onDismiss: () => void
    /** Maximum auto-refresh attempts (default: 3) */
    maxAttempts?: number
    /** Delay between refresh attempts in ms (default: 2000) */
    refreshDelayMs?: number
    /** Optional CSS class for container styling */
    className?: string
}

/**
 * ArrivalPauseOverlay
 * Shows an immersive pause narrative with auto-refresh while a path is being generated.
 */
export default function ArrivalPauseOverlay({
    direction,
    correlationId,
    onRefresh,
    onExhausted,
    onExplore,
    onDismiss,
    maxAttempts,
    refreshDelayMs,
    className
}: ArrivalPauseOverlayProps): React.ReactElement {
    const telemetry = useTelemetry()

    const { attempt, isExhausted, narrativeCopy } = useArrivalPause({
        direction,
        correlationId,
        maxAttempts,
        refreshDelayMs,
        onRefresh,
        onExhausted
    })

    // Track display event on mount
    useEffect(() => {
        telemetry.trackGameEvent('Navigation.ArrivalPause.Shown', {
            direction,
            correlationId
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Action handlers
    const handleExplore = useCallback(() => {
        onExplore()
    }, [onExplore])

    const handleDismiss = useCallback(() => {
        onDismiss()
    }, [onDismiss])

    // Handle keyboard Escape to dismiss
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                handleDismiss()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [handleDismiss])

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="arrival-pause-title"
            aria-describedby="arrival-pause-narrative"
            className={['fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm', className]
                .filter(Boolean)
                .join(' ')}
        >
            <div className="card mx-4 max-w-lg w-full rounded-xl p-6 sm:p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <h2 id="arrival-pause-title" className="text-responsive-lg font-semibold text-atlas-accent mb-4 flex items-center gap-2">
                    <span aria-hidden="true" className="text-xl">
                        ✦
                    </span>
                    The Atlas Awakens
                </h2>

                {/* Narrative text */}
                <p id="arrival-pause-narrative" className="text-responsive-base text-slate-200 leading-relaxed mb-6 whitespace-pre-wrap">
                    {narrativeCopy}
                </p>

                {/* Progress indicator (hidden when exhausted) */}
                {!isExhausted && (
                    <p className="text-responsive-sm text-slate-400 italic mb-6 flex items-center gap-2">
                        <span aria-hidden="true" className="animate-pulse">
                            ●
                        </span>
                        Charting the {direction} path… attempt {attempt + 1} of {maxAttempts ?? 3}
                    </p>
                )}

                {/* Exhausted hint */}
                {isExhausted && (
                    <p className="text-responsive-sm text-slate-400 italic mb-6">The world will reveal itself when it is ready.</p>
                )}

                {/* Action buttons — no manual retry; auto-refresh handles checking */}
                <div className="flex flex-col sm:flex-row gap-3">
                    <button
                        type="button"
                        onClick={handleExplore}
                        className="flex-1 px-4 py-3 rounded-lg bg-atlas-accent/20 hover:bg-atlas-accent/30 ring-1 ring-atlas-accent/40 text-atlas-accent font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-atlas-accent active:scale-[0.98]"
                    >
                        Explore Elsewhere
                    </button>
                    <button
                        type="button"
                        onClick={handleDismiss}
                        className="flex-1 px-4 py-3 rounded-lg bg-slate-700/50 hover:bg-slate-600/60 ring-1 ring-slate-500/30 text-slate-300 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-400 active:scale-[0.98]"
                    >
                        Dismiss
                    </button>
                </div>

                {/* Keyboard hint */}
                <p className="text-xs text-slate-500 mt-4 text-center">
                    Press <kbd className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 font-mono text-[10px]">Esc</kbd> to dismiss
                </p>
            </div>
        </div>
    )
}
