import React from 'react'
import ArrivalPauseOverlay from '../ArrivalPauseOverlay'
import SoftDenialOverlay, { type GenerationHint, type LocationContext } from '../SoftDenialOverlay'
import type { Direction } from '../hooks/useGameNavigationFlow'

interface GameViewOverlaysProps {
    arrivalPause: { direction: Direction; correlationId?: string } | null
    softDenial: { direction: Direction; generationHint?: GenerationHint; correlationId?: string } | null
    locationContextForDenial: LocationContext
    locationName?: string
    onArrivalPauseRefresh: () => void
    onArrivalPauseExhausted: () => void
    onArrivalPauseExplore: () => void
    onArrivalPauseDismiss: () => void
    onSoftDenialRetry: () => void
    onSoftDenialExplore: () => void
    onSoftDenialDismiss: () => void
}

export default function GameViewOverlays({
    arrivalPause,
    softDenial,
    locationContextForDenial,
    locationName,
    onArrivalPauseRefresh,
    onArrivalPauseExhausted,
    onArrivalPauseExplore,
    onArrivalPauseDismiss,
    onSoftDenialRetry,
    onSoftDenialExplore,
    onSoftDenialDismiss
}: GameViewOverlaysProps): React.ReactElement {
    return (
        <>
            {arrivalPause && (
                <ArrivalPauseOverlay
                    direction={arrivalPause.direction}
                    correlationId={arrivalPause.correlationId}
                    onRefresh={onArrivalPauseRefresh}
                    onExhausted={onArrivalPauseExhausted}
                    onExplore={onArrivalPauseExplore}
                    onDismiss={onArrivalPauseDismiss}
                />
            )}
            {softDenial && (
                <SoftDenialOverlay
                    direction={softDenial.direction}
                    generationHint={softDenial.generationHint}
                    locationContext={locationContextForDenial}
                    locationName={locationName}
                    onRetry={onSoftDenialRetry}
                    onExplore={onSoftDenialExplore}
                    onDismiss={onSoftDenialDismiss}
                    correlationId={softDenial.correlationId}
                />
            )}
        </>
    )
}
