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
import type { LocationResponse } from '@piquet-h/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import React, { useCallback, useState } from 'react'
import { usePlayer } from '../contexts/PlayerContext'
import { useGamePreferences } from '../hooks/useGamePreferences'
import { useMediaQuery } from '../hooks/useMediaQueries'
import { usePlayerLocation } from '../hooks/usePlayerLocation'
import { getSessionId, trackGameEventClient } from '../services/telemetry'
import { buildHeaders, buildMoveRequest } from '../utils/apiClient'
import { extractErrorMessage } from '../utils/apiResponse'
import { buildCorrelationHeaders, buildSessionHeaders, generateCorrelationId } from '../utils/correlation'
import { unwrapEnvelope } from '../utils/envelope'
import CommandInterface, { formatMoveResponse, type CommandInterfaceHandle } from './CommandInterface'
import NavigationUI from './NavigationUI'
import SoftDenialOverlay, { type GenerationHint, type LocationContext } from './SoftDenialOverlay'

/**
 * Cardinal & common text-adventure directions.
 * Mirrors shared/src/domainModels.ts but defined locally for browser bundle compatibility.
 */
type Direction = 'north' | 'south' | 'east' | 'west' | 'northeast' | 'northwest' | 'southeast' | 'southwest' | 'up' | 'down' | 'in' | 'out'

/** Number of command history items to display */
const COMMAND_HISTORY_LIMIT = 10

/** Placeholder health value (until real backend integration) */
const PLACEHOLDER_HEALTH = 100

/** Placeholder inventory count (until real backend integration) */
const PLACEHOLDER_INVENTORY_COUNT = 0

/** Player stats placeholder (until real backend integration) */
interface PlayerStats {
    health: number
    maxHealth: number
    locationName: string
    inventoryCount: number
}

interface GameViewProps {
    className?: string
}

/**
 * PlayerStatsPanel
 * Displays player health, current location, and inventory count.
 * On mobile (<640px), the panel is collapsible to save screen space.
 */
function PlayerStatsPanel({ stats, collapsible = false }: { stats: PlayerStats | null; collapsible?: boolean }): React.ReactElement {
    const [isExpanded, setIsExpanded] = useState(true)

    if (!stats) {
        return (
            <section className="card rounded-xl p-4 sm:p-5" aria-labelledby="stats-title">
                <h3 id="stats-title" className="text-responsive-base font-semibold text-white mb-3">
                    Explorer Status
                </h3>
                <p className="text-responsive-sm text-slate-400 italic">Initializing...</p>
            </section>
        )
    }

    const healthPercent = Math.round((stats.health / stats.maxHealth) * 100)
    const healthColor = healthPercent > 60 ? 'bg-emerald-500' : healthPercent > 30 ? 'bg-amber-500' : 'bg-red-500'

    return (
        <section className="card rounded-xl p-4 sm:p-5" aria-labelledby="stats-title">
            <button
                onClick={() => collapsible && setIsExpanded(!isExpanded)}
                className={[
                    'w-full flex items-center justify-between mb-3',
                    collapsible ? 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-atlas-accent rounded' : ''
                ].join(' ')}
                aria-expanded={isExpanded}
                aria-controls={collapsible ? 'stats-content' : undefined}
                disabled={!collapsible}
            >
                <h3 id="stats-title" className="text-responsive-base font-semibold text-white">
                    Explorer Status
                </h3>
                {collapsible && (
                    <span className="text-slate-400 transition-transform" aria-hidden="true">
                        {isExpanded ? '▼' : '▶'}
                    </span>
                )}
            </button>
            {isExpanded && (
                <div id="stats-content" className="space-y-3">
                    {/* Health bar */}
                    <div>
                        <div className="flex justify-between text-responsive-sm mb-1">
                            <span className="text-slate-300">Health</span>
                            <span className="text-white font-medium">
                                {stats.health}/{stats.maxHealth}
                            </span>
                        </div>
                        <div
                            className="h-2 bg-slate-700 rounded-full overflow-hidden"
                            role="progressbar"
                            aria-valuenow={stats.health}
                            aria-valuemin={0}
                            aria-valuemax={stats.maxHealth}
                            aria-label="Health"
                        >
                            <div className={`h-full ${healthColor} transition-all duration-300`} style={{ width: `${healthPercent}%` }} />
                        </div>
                    </div>
                    {/* Location */}
                    <div className="flex justify-between text-responsive-sm">
                        <span className="text-slate-300">Location</span>
                        <span className="text-white font-medium truncate max-w-[60%]">{stats.locationName}</span>
                    </div>
                    {/* Inventory */}
                    <div className="flex justify-between text-responsive-sm">
                        <span className="text-slate-300">Inventory</span>
                        <span className="text-white font-medium">{stats.inventoryCount} items</span>
                    </div>
                </div>
            )}
        </section>
    )
}

/**
 * CommandHistoryPanel
 * Displays the last N command actions with responses.
 */
interface CommandHistoryItem {
    id: string
    command: string
    response?: string
    error?: string
    timestamp: number
}

function CommandHistoryPanel({
    history,
    limit = COMMAND_HISTORY_LIMIT
}: {
    history: CommandHistoryItem[]
    limit?: number
}): React.ReactElement {
    const visible = history.slice(-limit)

    return (
        <section className="card rounded-xl p-4 sm:p-5" aria-labelledby="history-title">
            <h3 id="history-title" className="text-responsive-base font-semibold text-white mb-3">
                Recent Actions
            </h3>
            <div className="max-h-48 overflow-auto space-y-2 text-responsive-sm font-mono">
                {visible.length === 0 ? (
                    <p className="text-slate-400 italic">No actions yet.</p>
                ) : (
                    visible.map((item) => (
                        <div key={item.id} className="border-b border-white/5 pb-2 last:border-0">
                            <div className="flex items-start gap-2">
                                <span className="text-atlas-accent select-none">$</span>
                                <span className="text-slate-200 flex-1 break-all">{item.command}</span>
                            </div>
                            {item.response && <div className="pl-4 text-emerald-300 text-[11px] sm:text-xs truncate">{item.response}</div>}
                            {item.error && <div className="pl-4 text-red-400 text-[11px] sm:text-xs truncate">{item.error}</div>}
                        </div>
                    ))
                )}
            </div>
        </section>
    )
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
    const { location } = usePlayerLocation(currentLocationId)

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

    // Track optimistic navigation state for "Moving..." display
    const [isNavigating, setIsNavigating] = useState(false)

    // Soft-denial state for 'generate' status responses
    const [softDenial, setSoftDenial] = useState<{
        direction: Direction
        generationHint?: GenerationHint
        correlationId?: string
    } | null>(null)

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

    // Build available exits with descriptions for NavigationUI
    const availableExitsWithHints = React.useMemo(() => {
        return (location?.exits || []).map((exit) => ({
            direction: exit.direction as Direction,
            description: exit.description
        }))
    }, [location?.exits])

    // Extract available exit directions for autocomplete (from actual location exits)
    const availableExitDirections = (location?.exits || []).map((e) => e.direction)

    // Navigation mutation using TanStack Query for proper cache management
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

    const navigateMutation = useMutation({
        mutationFn: async ({ direction, correlationId }: { direction: Direction; correlationId: string }) => {
            if (!playerGuid) throw new Error('No player GUID available')

            const moveRequest = buildMoveRequest(playerGuid, direction)
            const headers = buildHeaders({
                'Content-Type': 'application/json',
                ...buildCorrelationHeaders(correlationId),
                ...buildSessionHeaders(getSessionId())
            })

            // Track UI navigation button click
            trackGameEventClient('UI.Navigate.Button', {
                correlationId,
                direction,
                fromLocationId: location?.id || null
            })

            const res = await fetch(moveRequest.url, {
                method: moveRequest.method,
                headers,
                body: JSON.stringify(moveRequest.body)
            })

            const json = await res.json().catch(() => ({}))
            const unwrapped = unwrapEnvelope<LocationResponse>(json)

            if (!res.ok || (unwrapped.isEnvelope && !unwrapped.success)) {
                // Check for 'generate' status (ExitGenerationRequested) - soft denial
                const jsonObj = json as Record<string, unknown>
                const errorObj = jsonObj?.error as Record<string, unknown> | undefined
                const errorCode = unwrapped.error?.code || errorObj?.code
                if (errorCode === 'ExitGenerationRequested') {
                    // Extract generationHint from response payload
                    const generationHint = jsonObj?.generationHint as { direction?: string; originLocationId?: string } | undefined

                    // Return special marker for soft-denial handling
                    return {
                        __softDenial: true as const,
                        direction,
                        correlationId,
                        generationHint: generationHint
                            ? {
                                  direction: generationHint.direction || direction
                              }
                            : undefined
                    }
                }

                const errorMsg = extractErrorMessage(res, json, unwrapped)
                trackGameEventClient('UI.Navigate.Error', {
                    correlationId,
                    direction,
                    error: errorMsg,
                    statusCode: res.status
                })
                throw new Error(errorMsg)
            }

            if (!unwrapped.data) {
                throw new Error('No location data in response')
            }

            return unwrapped.data
        },
        onMutate: async ({ direction }) => {
            // Cancel outbound refetches to avoid race conditions
            await queryClient.cancelQueries({ queryKey: ['player', playerGuid] })
            await queryClient.cancelQueries({ queryKey: ['location'] })

            // Set navigating flag for optimistic "Moving..." display
            setIsNavigating(true)

            return { direction, startTime: performance.now() }
        },
        onSuccess: (result, variables, context) => {
            // Clear navigating flag
            setIsNavigating(false)

            // Check for soft-denial marker
            if (result && '__softDenial' in result && result.__softDenial) {
                const softDenialResult = result as {
                    __softDenial: true
                    direction: Direction
                    correlationId: string
                    generationHint?: GenerationHint
                }
                setSoftDenial({
                    direction: softDenialResult.direction,
                    generationHint: softDenialResult.generationHint,
                    correlationId: softDenialResult.correlationId
                })
                const softLatency = context?.startTime ? Math.round(performance.now() - context.startTime) : undefined
                const softDirection = context?.direction || variables.direction
                appendCommandLog({
                    command: `move ${softDirection}`,
                    response: 'The path is being charted. Try again in a moment.',
                    latencyMs: softLatency
                })
                return
            }

            // Normal success: update location
            const newLocation = result as LocationResponse
            // Update context's currentLocationId immediately
            // This ensures all components using PlayerContext see the new location
            updateCurrentLocationId(newLocation.id)

            const latencyMs = context?.startTime ? Math.round(performance.now() - context.startTime) : undefined
            const direction = context?.direction || variables.direction

            appendCommandLog({
                command: `move ${direction}`,
                response: formatMoveResponse(direction, newLocation),
                latencyMs
            })

            // Invalidate location query to refetch with new location data
            queryClient.invalidateQueries({ queryKey: ['location'] })
        },
        onError: (err, { direction, correlationId }, context) => {
            // Clear navigating flag on error
            setIsNavigating(false)

            // Track exception
            trackGameEventClient('UI.Navigate.Exception', {
                correlationId,
                direction,
                error: err instanceof Error ? err.message : 'Unknown error'
            })

            appendCommandLog({
                command: `move ${direction}`,
                error: err instanceof Error ? err.message : 'Unknown error',
                latencyMs: context?.startTime ? Math.round(performance.now() - context.startTime) : undefined
            })
        }
    })

    // Navigation handler wrapper for UI components
    // Extract stable mutate function to avoid callback recreation on every render
    const { mutate: navigateMutate } = navigateMutation
    const handleNavigate = useCallback(
        (direction: Direction) => {
            if (!playerGuid) return
            const correlationId = generateCorrelationId()
            navigateMutate({ direction, correlationId })
        },
        [playerGuid, navigateMutate]
    )

    // Soft-denial action handlers
    const handleSoftDenialRetry = useCallback(() => {
        if (!softDenial) return
        setSoftDenial(null)
        // Retry the same direction
        handleNavigate(softDenial.direction)
    }, [softDenial, handleNavigate])

    const handleSoftDenialExplore = useCallback(() => {
        // Just dismiss the overlay - player will explore other exits
        setSoftDenial(null)
    }, [])

    const handleSoftDenialDismiss = useCallback(() => {
        setSoftDenial(null)
    }, [])

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
        <div className={['flex flex-col gap-4 sm:gap-5 min-h-screen', className].filter(Boolean).join(' ')}>
            {/* Soft-denial overlay for 'generate' status responses */}
            {softDenial && (
                <SoftDenialOverlay
                    direction={softDenial.direction}
                    generationHint={softDenial.generationHint}
                    locationContext={locationContextForDenial}
                    locationName={location?.name}
                    onRetry={handleSoftDenialRetry}
                    onExplore={handleSoftDenialExplore}
                    onDismiss={handleSoftDenialDismiss}
                    correlationId={softDenial.correlationId}
                />
            )}
            {/* Responsive layouts: Mobile (<640px), Tablet (640-1024px), Desktop (≥1024px) */}
            {isDesktop ? (
                /* Desktop: Two-column layout: Command panel + sidebar */
                <div className="grid grid-cols-12 gap-4 lg:gap-5 min-h-screen">
                    {/* Main content area (Your Atlas) */}
                    <div className="col-span-8 flex flex-col gap-4 lg:gap-5 min-h-screen">
                        <section aria-labelledby="game-command-title-desktop" className="card rounded-xl flex flex-col flex-1 min-h-0">
                            <h3 id="game-command-title-desktop" className="text-responsive-base font-semibold text-white mb-3">
                                Your Atlas
                            </h3>
                            <div className="flex flex-col flex-1 min-h-0">
                                <CommandInterface ref={commandInterfaceRef} availableExits={availableExitDirections} className="flex-1" />
                            </div>
                        </section>
                    </div>
                    {/* Right sidebar: Navigation and Stats */}
                    <aside className="col-span-4 flex flex-col gap-4 lg:gap-5">
                        {/* Navigation UI - optional based on user preference */}
                        {playerGuid && navigationUIEnabled && (
                            <NavigationUI
                                availableExits={availableExitsWithHints}
                                onNavigate={handleNavigate}
                                disabled={navigateMutation.isPending}
                            />
                        )}
                        <PlayerStatsPanel stats={playerStats} />
                        <CommandHistoryPanel history={commandHistory} />
                    </aside>
                </div>
            ) : isTablet ? (
                /* Tablet: Two-column layout with sidebar */
                <div className="grid grid-cols-12 gap-4 sm:gap-5 min-h-screen">
                    {/* Main content area: Your Atlas */}
                    <div className="col-span-8 flex flex-col gap-4 sm:gap-5 min-h-screen">
                        <section aria-labelledby="game-command-title-tablet" className="card rounded-xl flex flex-col flex-1 min-h-0">
                            <h3 id="game-command-title-tablet" className="text-responsive-base font-semibold text-white mb-3">
                                Your Atlas
                            </h3>
                            <div className="flex flex-col flex-1 min-h-0">
                                <CommandInterface ref={commandInterfaceRef} availableExits={availableExitDirections} className="flex-1" />
                            </div>
                        </section>
                    </div>
                    {/* Right sidebar: Navigation and Stats */}
                    <aside className="col-span-4 flex flex-col gap-4 sm:gap-5">
                        {/* Navigation UI - optional based on user preference */}
                        {playerGuid && navigationUIEnabled && (
                            <NavigationUI
                                availableExits={availableExitsWithHints}
                                onNavigate={handleNavigate}
                                disabled={navigateMutation.isPending}
                            />
                        )}
                        <PlayerStatsPanel stats={playerStats} />
                        <CommandHistoryPanel history={commandHistory} />
                    </aside>
                </div>
            ) : (
                /* Mobile: Single column */
                <>
                    {/* Navigation UI - optional based on user preference */}
                    {playerGuid && navigationUIEnabled && (
                        <NavigationUI
                            availableExits={availableExitsWithHints}
                            onNavigate={handleNavigate}
                            disabled={navigateMutation.isPending}
                        />
                    )}
                    {/* Collapsible stats panel on mobile */}
                    <PlayerStatsPanel stats={playerStats} collapsible={true} />
                    {/* Command Interface */}
                    <section aria-labelledby="game-command-title-mobile" className="card rounded-xl flex flex-col flex-1 min-h-0">
                        <h3 id="game-command-title-mobile" className="text-responsive-base font-semibold text-white mb-3">
                            Your Atlas
                        </h3>
                        <div className="flex flex-col flex-1 min-h-0">
                            <CommandInterface ref={commandInterfaceRef} availableExits={availableExitDirections} className="flex-1" />
                        </div>
                    </section>
                    <CommandHistoryPanel history={commandHistory} />
                </>
            )}
        </div>
    )
}
