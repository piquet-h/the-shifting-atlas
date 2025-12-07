/**
 * SoftDenialOverlay Component
 *
 * Displays contextual soft-denial narrative when the backend returns 'generate' status
 * for a navigation attempt. Instead of a hard "can't go that way" error, this provides
 * a diegetic (in-world) response that maintains immersion.
 *
 * Features:
 * - Location-context narratives (indoor/outdoor/underground/urban)
 * - Optional AI-cached narratives (future enhancement)
 * - Player action buttons: Retry, Explore Elsewhere, Quit
 * - Telemetry events for UX analytics
 * - Accessible with keyboard navigation and screen reader support
 *
 * Reference: docs/design-modules/navigation-and-traversal.md (Exit Generation Hints)
 */

import React, { useCallback, useEffect, useMemo } from 'react'
import { useTelemetry } from '../telemetry/TelemetryContext'

/** Location context types for narrative templates */
export type LocationContext = 'indoor' | 'outdoor' | 'underground' | 'urban' | 'unknown'

/** Generation hint data from backend (simplified for frontend use) */
export interface GenerationHint {
    direction: string
    /** Optional AI-cached narrative from backend */
    narrative?: string
}

export interface SoftDenialOverlayProps {
    /** The direction the player attempted to move */
    direction: string
    /** Generation hint from backend (includes direction and optional narrative) */
    generationHint?: GenerationHint
    /** Context of the current location for narrative selection */
    locationContext?: LocationContext
    /** Current location name for narrative personalization */
    locationName?: string
    /** Callback when player chooses to retry the same direction */
    onRetry: () => void
    /** Callback when player chooses to explore other directions */
    onExplore: () => void
    /** Callback when player dismisses the overlay */
    onDismiss: () => void
    /** Optional correlation ID for telemetry */
    correlationId?: string
    /** Optional CSS class for container styling */
    className?: string
}

/**
 * Narrative templates organized by location context.
 * Each template can include {direction} and {location} placeholders.
 */
const NARRATIVE_TEMPLATES: Record<LocationContext, string[]> = {
    indoor: [
        'You peer toward the {direction}, but the chamber walls offer no passage there.',
        'The {direction} wall stands solid and unyielding. Perhaps another path awaits.',
        'Shadows pool in the {direction} corner, but reveal no hidden doorway.',
        'Your torchlight finds only dressed stone to the {direction}.'
    ],
    outdoor: [
        'The path to the {direction} is obscured by dense undergrowth and tangled vines.',
        'Mist rolls across the {direction} horizon, concealing whatever lies beyond.',
        'The terrain drops away sharply to the {direction}—no safe passage there.',
        'Ancient trees form an impenetrable barrier to the {direction}.'
    ],
    underground: [
        'The tunnel narrows to the {direction}, too cramped for passage.',
        'A cave-in has sealed the {direction} passage long ago.',
        'Darkness swallows the {direction} corridor, and your instincts warn against it.',
        'Dripping water echoes from the {direction}, but the way is flooded.'
    ],
    urban: [
        'The {direction} street is barricaded—some disturbance has closed it off.',
        'A crowd blocks the {direction} avenue; they seem to be watching something.',
        "The {direction} alley ends abruptly at a merchant's locked warehouse.",
        'Guards stand watch to the {direction}, their expressions uninviting.'
    ],
    unknown: [
        'Something prevents you from going {direction}. The way is not yet clear.',
        'The path to the {direction} seems to shimmer and fade from view.',
        'An invisible force turns you aside when you try to go {direction}.',
        'The {direction} way is blocked by circumstances you cannot quite discern.'
    ]
}

/**
 * Select a narrative template based on location context and apply placeholders.
 */
function selectNarrative(context: LocationContext, direction: string, locationName?: string): string {
    const templates = NARRATIVE_TEMPLATES[context] || NARRATIVE_TEMPLATES.unknown
    // Use direction hash for deterministic selection (same direction = same narrative)
    const index = direction.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % templates.length
    let narrative = templates[index]

    // Apply placeholders
    narrative = narrative.replace(/{direction}/g, direction)
    if (locationName) {
        narrative = narrative.replace(/{location}/g, locationName)
    }

    return narrative
}

/**
 * SoftDenialOverlay
 * Displays immersive soft-denial narrative with player action options.
 */
export default function SoftDenialOverlay({
    direction,
    generationHint,
    locationContext = 'unknown',
    locationName,
    onRetry,
    onExplore,
    onDismiss,
    correlationId,
    className
}: SoftDenialOverlayProps): React.ReactElement {
    const telemetry = useTelemetry()

    // Select narrative: prefer AI-cached from backend, fallback to template
    const narrative = useMemo(() => {
        if (generationHint?.narrative) {
            return generationHint.narrative
        }
        return selectNarrative(locationContext, direction, locationName)
    }, [generationHint?.narrative, locationContext, direction, locationName])

    // Track display event on mount
    useEffect(() => {
        telemetry.trackGameEvent('Navigation.SoftDenial.Displayed', {
            direction,
            locationContext,
            hasAiNarrative: !!generationHint?.narrative,
            correlationId
        })
    }, [telemetry, direction, locationContext, generationHint?.narrative, correlationId])

    // Action handlers with telemetry
    const handleRetry = useCallback(() => {
        telemetry.trackGameEvent('Navigation.SoftDenial.Retry', {
            direction,
            correlationId
        })
        onRetry()
    }, [telemetry, direction, correlationId, onRetry])

    const handleExplore = useCallback(() => {
        telemetry.trackGameEvent('Navigation.SoftDenial.Explored', {
            direction,
            correlationId
        })
        onExplore()
    }, [telemetry, direction, correlationId, onExplore])

    const handleDismiss = useCallback(() => {
        telemetry.trackGameEvent('Navigation.SoftDenial.Quit', {
            direction,
            correlationId
        })
        onDismiss()
    }, [telemetry, direction, correlationId, onDismiss])

    // Handle keyboard escape to dismiss
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
            aria-labelledby="soft-denial-title"
            aria-describedby="soft-denial-narrative"
            className={['fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm', className]
                .filter(Boolean)
                .join(' ')}
        >
            <div className="card mx-4 max-w-lg w-full rounded-xl p-6 sm:p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <h2 id="soft-denial-title" className="text-responsive-lg font-semibold text-amber-400 mb-4 flex items-center gap-2">
                    <span aria-hidden="true" className="text-xl">
                        ⚠
                    </span>
                    The Way Is Blocked
                </h2>

                {/* Narrative text */}
                <p id="soft-denial-narrative" className="text-responsive-base text-slate-200 leading-relaxed mb-6 whitespace-pre-wrap">
                    {narrative}
                </p>

                {/* World expansion hint */}
                <p className="text-responsive-sm text-slate-400 italic mb-6">
                    The world continues to take shape... This path may open in time.
                </p>

                {/* Action buttons */}
                <div className="flex flex-col sm:flex-row gap-3">
                    <button
                        type="button"
                        onClick={handleRetry}
                        className="flex-1 px-4 py-3 rounded-lg bg-emerald-700/60 hover:bg-emerald-600/70 ring-1 ring-emerald-500/50 text-emerald-100 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-400 active:scale-[0.98]"
                    >
                        Try Again
                    </button>
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
