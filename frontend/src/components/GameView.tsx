/**
 * GameView Component
 *
 * Main game view displaying:
 * - Location name and description (narrative-focused main area)
 * - Command interface (text input)
 * - Right sidebar: player stats + optional navigation UI
 *
 * Responsive layout: single column on mobile, two-column on desktop/tablet.
 * Navigation UI is optional and can be toggled via user preferences.
 */
import { useQueryClient } from '@tanstack/react-query'
import React, { useCallback, useState } from 'react'
import { usePlayer } from '../contexts/PlayerContext'
import { useGamePreferences } from '../hooks/useGamePreferences'
import { useMediaQuery } from '../hooks/useMediaQueries'
import { usePlayerLocation } from '../hooks/usePlayerLocation'
import { trackGameEventClient } from '../services/telemetry'
import { formatMoveResponse, type CommandInterfaceHandle } from './CommandInterface'
import { useGameNavigationFlow, type Direction } from './hooks/useGameNavigationFlow'
import GameViewLayout from './layout/GameViewLayout'
import GameViewOverlays from './layout/GameViewOverlays'
import { type CommandHistoryItem, type PlayerStats } from './layout/GameViewPanels'
import type { LocationContext } from './SoftDenialOverlay'

/** Number of command history items to display */
const COMMAND_HISTORY_LIMIT = 10

/** Placeholder health value (until real backend integration) */
const PLACEHOLDER_HEALTH = 100

/** Placeholder inventory count (until real backend integration) */
const PLACEHOLDER_INVENTORY_COUNT = 0

interface GameViewProps {
    className?: string
}

/**
 * GameView
 * Main game view component orchestrating location, exits, stats, and command interface.
 * Responsive breakpoints:
 * - Mobile (<640px): Single column, collapsible stats panel
 * - Tablet (640px-1024px): Two-column layout with navigation sidebar
 * - Desktop (≥1024px): Three-column layout with dedicated history panel
 */
export default function GameView({ className }: GameViewProps): React.ReactElement {
    const isTablet = useMediaQuery('(min-width: 640px)')
    const isDesktop = useMediaQuery('(min-width: 1024px)')
    const { navigationUIEnabled } = useGamePreferences()
    const queryClient = useQueryClient()
    const { playerGuid, currentLocationId, updateCurrentLocationId } = usePlayer()

    // Fetch player's current location using TanStack Query
    // Uses currentLocationId from context (already fetched at bootstrap)
    const { location, refetch } = usePlayerLocation(currentLocationId)

    /**
     * Command history state (placeholder for future unified history integration).
     *
     * NOTE: CommandHistoryPanel and CommandInterface currently maintain separate history.
     * This is intentional for MVP - CommandInterface handles interactive command execution,
     * while CommandHistoryPanel provides a dedicated read-only view for the sidebar.
     * Future: Lift history state to a shared context or integrate with a global event store
     * to unify command tracking across components.
     */
    const [commandHistory, setCommandHistory] = useState<CommandHistoryItem[]>([])

    const commandInterfaceRef = React.useRef<CommandInterfaceHandle | null>(null)

    // Build available exits with descriptions for NavigationUI
    const availableExitsWithHints = React.useMemo(() => {
        return (location?.exits || []).map((exit) => ({
            direction: exit.direction as Direction,
            description: exit.description
        }))
    }, [location?.exits])

    // Extract available exit directions for autocomplete (from actual location exits)
    const availableExitDirections = (location?.exits || []).map((e) => e.direction)

    const appendCommandLog = useCallback(
        ({ command, response, error, latencyMs }: { command: string; response?: string; error?: string; latencyMs?: number }) => {
            const id = crypto.randomUUID()
            const timestamp = Date.now()
            setCommandHistory((prev) => {
                const next = [...prev, { id, command, response, error, timestamp }]
                return next.slice(-COMMAND_HISTORY_LIMIT)
            })

            commandInterfaceRef.current?.appendRecord({ command, response, error, latencyMs })
        },
        []
    )

    const {
        isNavigating,
        softDenial,
        arrivalPause,
        navigatePending,
        handleNavigate,
        setArrivalPause,
        handleSoftDenialRetry,
        handleSoftDenialExplore,
        handleSoftDenialDismiss,
        handleArrivalPauseRefresh,
        handleArrivalPauseExhausted,
        handleArrivalPauseExplore,
        handleArrivalPauseDismiss
    } = useGameNavigationFlow({
        playerGuid,
        currentLocationId,
        location,
        queryClient,
        updateCurrentLocationId,
        refetchLocation: refetch,
        appendCommandLog,
        formatMoveResponse
    })

    // Derive player stats from location (no useEffect needed)
    // TODO: Replace hardcoded health/inventory with real API data
    const playerStats: PlayerStats | null = location
        ? {
              health: PLACEHOLDER_HEALTH,
              maxHealth: PLACEHOLDER_HEALTH,
              locationName: isNavigating ? 'Moving...' : location.name,
              inventoryCount: PLACEHOLDER_INVENTORY_COUNT
          }
        : null

    // Watch location exits for the pending direction becoming available after a refresh.
    // When the exit appears (hard), auto-navigate and dismiss the arrival pause overlay.
    React.useEffect(() => {
        if (!arrivalPause) return
        const exitAvailable = location?.exits?.some((e) => e.direction === arrivalPause.direction)
        if (exitAvailable) {
            trackGameEventClient('Navigation.ArrivalPause.Ready', {
                direction: arrivalPause.direction,
                correlationId: arrivalPause.correlationId
            })
            setArrivalPause(null)
            handleNavigate(arrivalPause.direction)
        }
    }, [location, arrivalPause, handleNavigate, setArrivalPause])

    // Derive location context for soft-denial narratives
    // This is a simple heuristic based on location name/description keywords
    const locationContextForDenial: LocationContext = React.useMemo(() => {
        if (!location) return 'unknown'
        const text = `${location.name} ${location.description?.text || ''}`.toLowerCase()
        if (text.includes('cave') || text.includes('tunnel') || text.includes('underground') || text.includes('cavern')) {
            return 'underground'
        }
        if (
            text.includes('street') ||
            text.includes('city') ||
            text.includes('town') ||
            text.includes('market') ||
            text.includes('alley')
        ) {
            return 'urban'
        }
        if (
            text.includes('room') ||
            text.includes('chamber') ||
            text.includes('hall') ||
            text.includes('corridor') ||
            text.includes('building')
        ) {
            return 'indoor'
        }
        if (
            text.includes('forest') ||
            text.includes('field') ||
            text.includes('river') ||
            text.includes('mountain') ||
            text.includes('path') ||
            text.includes('road')
        ) {
            return 'outdoor'
        }
        return 'unknown'
    }, [location])

    return (
        <>
            <GameViewOverlays
                arrivalPause={arrivalPause}
                softDenial={softDenial}
                locationContextForDenial={locationContextForDenial}
                locationName={location?.name}
                onArrivalPauseRefresh={handleArrivalPauseRefresh}
                onArrivalPauseExhausted={handleArrivalPauseExhausted}
                onArrivalPauseExplore={handleArrivalPauseExplore}
                onArrivalPauseDismiss={handleArrivalPauseDismiss}
                onSoftDenialRetry={handleSoftDenialRetry}
                onSoftDenialExplore={handleSoftDenialExplore}
                onSoftDenialDismiss={handleSoftDenialDismiss}
            />
            <GameViewLayout
                className={className}
                isTablet={isTablet}
                isDesktop={isDesktop}
                playerGuid={playerGuid}
                navigationUIEnabled={navigationUIEnabled}
                availableExitsWithHints={availableExitsWithHints}
                availableExitDirections={availableExitDirections}
                onNavigate={handleNavigate}
                navigationDisabled={navigatePending}
                playerStats={playerStats}
                commandHistory={commandHistory}
                commandInterfaceRef={commandInterfaceRef}
            />
        </>
    )
}
