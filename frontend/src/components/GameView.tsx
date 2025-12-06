/**
 * GameView Component
 *
 * Main game view displaying:
 * - Location name and description
 * - Available exits with visual indicators
 * - Player health/stats panel
 * - Command history panel
 *
 * Responsive layout: single column on mobile, multi-column on desktop.
 */
import type { LocationResponse } from '@piquet-h/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import React, { useCallback, useState } from 'react'
import { usePlayer } from '../contexts/PlayerContext'
import { useMediaQuery } from '../hooks/useMediaQueries'
import { usePlayerLocation } from '../hooks/usePlayerLocation'
import { trackGameEventClient } from '../services/telemetry'
import { buildHeaders, buildMoveRequest } from '../utils/apiClient'
import { extractErrorMessage } from '../utils/apiResponse'
import { buildCorrelationHeaders, generateCorrelationId } from '../utils/correlation'
import { unwrapEnvelope } from '../utils/envelope'
import CommandInterface from './CommandInterface'
import DescriptionRenderer from './DescriptionRenderer'
import NavigationUI from './NavigationUI'

/**
 * Cardinal & common text-adventure directions.
 * Mirrors shared/src/domainModels.ts but defined locally for browser bundle compatibility.
 */
type Direction = 'north' | 'south' | 'east' | 'west' | 'northeast' | 'northwest' | 'southeast' | 'southwest' | 'up' | 'down' | 'in' | 'out'

/** Set of allowed directions for validation / display. */
const DIRECTIONS: readonly Direction[] = [
    'north',
    'south',
    'east',
    'west',
    'northeast',
    'northwest',
    'southeast',
    'southwest',
    'up',
    'down',
    'in',
    'out'
] as const

/** Maximum description length before truncation */
const MAX_DESCRIPTION_LENGTH = 1000

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

/** Exit display info */
interface ExitInfo {
    direction: Direction
    available: boolean
}

interface GameViewProps {
    className?: string
}

/**
 * LocationPanel
 * Displays the current location name and description with truncation support.
 */
function LocationPanel({
    name,
    description,
    loading,
    error,
    onRetry
}: {
    name: string
    description: string
    loading: boolean
    error: string | null
    onRetry: () => void
}): React.ReactElement {
    const [expanded, setExpanded] = useState(false)
    const needsTruncation = description.length > MAX_DESCRIPTION_LENGTH

    const displayDescription = expanded || !needsTruncation ? description : description.slice(0, MAX_DESCRIPTION_LENGTH) + '...'

    if (loading) {
        return (
            <section className="rounded-xl bg-white/5 ring-1 ring-white/10 p-4 sm:p-5" aria-labelledby="location-title" aria-busy="true">
                <div className="flex items-center gap-3">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-atlas-accent border-t-transparent" />
                    <span className="text-slate-400 text-responsive-sm">Loading location...</span>
                </div>
            </section>
        )
    }

    if (error) {
        return (
            <section className="rounded-xl bg-red-900/20 ring-1 ring-red-500/30 p-4 sm:p-5" aria-labelledby="location-error" role="alert">
                <h2 id="location-error" className="text-responsive-lg font-semibold text-red-400 mb-2">
                    Failed to Load Location
                </h2>
                <p className="text-responsive-sm text-red-300 mb-3">{error}</p>
                <button
                    onClick={onRetry}
                    className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-responsive-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-red-400"
                >
                    Retry
                </button>
            </section>
        )
    }

    return (
        <section className="rounded-xl bg-white/5 ring-1 ring-white/10 p-4 sm:p-5" aria-labelledby="location-title">
            <h2 id="location-title" className="text-responsive-xl font-semibold text-white mb-2">
                {name || 'Unknown Location'}
            </h2>
            <div className="whitespace-pre-wrap">
                <DescriptionRenderer content={displayDescription} format="markdown" />
            </div>
            {needsTruncation && (
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="mt-2 text-atlas-accent text-responsive-sm hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-atlas-accent"
                    aria-expanded={expanded}
                >
                    {expanded ? 'Read less' : 'Read more'}
                </button>
            )}
        </section>
    )
}

/**
 * ExitsPanel
 * Displays available exits with visual direction indicators.
 * Clickable exits trigger navigation.
 */
function ExitsPanel({
    exits,
    onNavigate,
    disabled
}: {
    exits: ExitInfo[]
    onNavigate?: (direction: Direction) => void
    disabled?: boolean
}): React.ReactElement {
    const availableExits = exits.filter((e) => e.available)
    const hasNoExits = availableExits.length === 0

    // Direction layout configuration for visual compass display
    const directionLayout: { direction: Direction; label: string; shortLabel: string }[] = [
        { direction: 'north', label: 'North', shortLabel: 'N' },
        { direction: 'south', label: 'South', shortLabel: 'S' },
        { direction: 'east', label: 'East', shortLabel: 'E' },
        { direction: 'west', label: 'West', shortLabel: 'W' },
        { direction: 'northeast', label: 'Northeast', shortLabel: 'NE' },
        { direction: 'northwest', label: 'Northwest', shortLabel: 'NW' },
        { direction: 'southeast', label: 'Southeast', shortLabel: 'SE' },
        { direction: 'southwest', label: 'Southwest', shortLabel: 'SW' },
        { direction: 'up', label: 'Up', shortLabel: '↑' },
        { direction: 'down', label: 'Down', shortLabel: '↓' },
        { direction: 'in', label: 'In', shortLabel: '→' },
        { direction: 'out', label: 'Out', shortLabel: '←' }
    ]

    return (
        <section className="rounded-xl bg-white/5 ring-1 ring-white/10 p-4 sm:p-5" aria-labelledby="exits-title">
            <h3 id="exits-title" className="text-responsive-base font-semibold text-white mb-3">
                Available Exits
            </h3>
            {hasNoExits ? (
                <p className="text-responsive-sm text-amber-400 italic">No visible exits — this appears to be a dead end.</p>
            ) : (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2" role="list" aria-label="Exit directions">
                    {directionLayout.map(({ direction, label, shortLabel }) => {
                        const exit = exits.find((e) => e.direction === direction)
                        const isAvailable = exit?.available ?? false
                        const canClick = isAvailable && onNavigate && !disabled

                        const Element = canClick ? 'button' : 'div'

                        return (
                            <Element
                                key={direction}
                                {...(canClick
                                    ? {
                                          type: 'button',
                                          onClick: () => onNavigate(direction),
                                          disabled: disabled
                                      }
                                    : {})}
                                role="listitem"
                                className={[
                                    'flex flex-col items-center justify-center p-2 rounded-lg text-center transition-colors',
                                    isAvailable
                                        ? canClick
                                            ? 'bg-emerald-900/40 ring-1 ring-emerald-500/40 text-emerald-300 hover:bg-emerald-800/50 cursor-pointer active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-400'
                                            : 'bg-emerald-900/40 ring-1 ring-emerald-500/40 text-emerald-300'
                                        : 'bg-slate-800/30 ring-1 ring-slate-700/30 text-slate-500'
                                ].join(' ')}
                                title={isAvailable ? `Exit available: ${label}${canClick ? ' (click to move)' : ''}` : `No exit: ${label}`}
                                aria-label={
                                    isAvailable ? `${label} exit available${canClick ? ', click to move' : ''}` : `No ${label} exit`
                                }
                            >
                                <span className="text-responsive-sm font-medium">{shortLabel}</span>
                                <span className="text-[10px] sm:text-xs hidden sm:block">{label}</span>
                            </Element>
                        )
                    })}
                </div>
            )}
        </section>
    )
}

/**
 * PlayerStatsPanel
 * Displays player health, current location, and inventory count.
 */
function PlayerStatsPanel({ stats }: { stats: PlayerStats | null }): React.ReactElement {
    if (!stats) {
        return (
            <section className="rounded-xl bg-white/5 ring-1 ring-white/10 p-4 sm:p-5" aria-labelledby="stats-title">
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
        <section className="rounded-xl bg-white/5 ring-1 ring-white/10 p-4 sm:p-5" aria-labelledby="stats-title">
            <h3 id="stats-title" className="text-responsive-base font-semibold text-white mb-3">
                Explorer Status
            </h3>
            <div className="space-y-3">
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
        <section className="rounded-xl bg-white/5 ring-1 ring-white/10 p-4 sm:p-5" aria-labelledby="history-title">
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
 */
export default function GameView({ className }: GameViewProps): React.ReactElement {
    const isDesktop = useMediaQuery('(min-width: 768px)')
    const queryClient = useQueryClient()
    const { playerGuid, currentLocationId, updateCurrentLocationId } = usePlayer()

    // Fetch player's current location using TanStack Query
    // Uses currentLocationId from context (already fetched at bootstrap)
    const { location, isLoading: locationLoading, error: locationError, refetch } = usePlayerLocation(currentLocationId)

    /**
     * Command history state (placeholder for future unified history integration).
     *
     * NOTE: CommandHistoryPanel and CommandInterface currently maintain separate history.
     * This is intentional for MVP - CommandInterface handles interactive command execution,
     * while CommandHistoryPanel provides a dedicated read-only view for the sidebar.
     * Future: Lift history state to a shared context or integrate with a global event store
     * to unify command tracking across components.
     */
    const [commandHistory] = useState<CommandHistoryItem[]>([])

    // Track optimistic navigation state for "Moving..." display
    const [isNavigating, setIsNavigating] = useState(false)

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

    // Build exits info from location data
    const exits: ExitInfo[] = DIRECTIONS.map((direction) => {
        const available = location?.exits?.some((e) => e.direction === direction) ?? false
        return { direction, available }
    })

    // Build available exits with descriptions for NavigationUI
    const availableExitsWithHints = React.useMemo(() => {
        return (location?.exits || []).map((exit) => ({
            direction: exit.direction as Direction,
            description: exit.description
        }))
    }, [location?.exits])

    // Extract available exit directions for autocomplete
    const availableExitDirections = exits.filter((e) => e.available).map((e) => e.direction)

    // Navigation mutation using TanStack Query for proper cache management
    const navigateMutation = useMutation({
        mutationFn: async ({ direction, correlationId }: { direction: Direction; correlationId: string }) => {
            if (!playerGuid) throw new Error('No player GUID available')

            const moveRequest = buildMoveRequest(playerGuid, direction)
            const headers = buildHeaders({
                'Content-Type': 'application/json',
                ...buildCorrelationHeaders(correlationId)
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

            return { direction }
        },
        onSuccess: (newLocation) => {
            // Update context's currentLocationId immediately
            // This ensures all components using PlayerContext see the new location
            updateCurrentLocationId(newLocation.id)

            // Invalidate location query to refetch with new location data
            queryClient.invalidateQueries({ queryKey: ['location'] })

            // Clear navigating flag - stats will derive from new location
            setIsNavigating(false)
        },
        onError: (err, { direction, correlationId }) => {
            // Clear navigating flag on error
            setIsNavigating(false)

            // Track exception
            trackGameEventClient('UI.Navigate.Exception', {
                correlationId,
                direction,
                error: err instanceof Error ? err.message : 'Unknown error'
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

    return (
        <div className={['flex flex-col gap-4 sm:gap-5', className].filter(Boolean).join(' ')}>
            {/* Mobile: single column, Desktop: multi-column grid */}
            {isDesktop ? (
                <div className="grid grid-cols-12 gap-4 sm:gap-5">
                    {/* Main content area */}
                    <div className="col-span-8 flex flex-col gap-4 sm:gap-5">
                        <LocationPanel
                            name={location?.name ?? ''}
                            description={location?.description?.text ?? ''}
                            loading={locationLoading}
                            error={locationError}
                            onRetry={refetch}
                        />
                        <ExitsPanel
                            exits={exits}
                            onNavigate={playerGuid ? handleNavigate : undefined}
                            disabled={navigateMutation.isPending}
                        />
                        {/* Navigation UI for authenticated users */}
                        {playerGuid && (
                            <NavigationUI
                                availableExits={availableExitsWithHints}
                                onNavigate={handleNavigate}
                                disabled={navigateMutation.isPending}
                            />
                        )}
                        {/* Command Interface for authenticated users */}
                        <section aria-labelledby="game-command-title">
                            <h3 id="game-command-title" className="text-responsive-base font-semibold text-white mb-3">
                                Command Interface
                            </h3>
                            <CommandInterface availableExits={availableExitDirections} />
                        </section>
                    </div>
                    {/* Sidebar */}
                    <aside className="col-span-4 flex flex-col gap-4 sm:gap-5">
                        <PlayerStatsPanel stats={playerStats} />
                        <CommandHistoryPanel history={commandHistory} />
                    </aside>
                </div>
            ) : (
                <>
                    {/* Mobile layout: stacked sections */}
                    <LocationPanel
                        name={location?.name ?? ''}
                        description={location?.description?.text ?? ''}
                        loading={locationLoading}
                        error={locationError}
                        onRetry={refetch}
                    />
                    <ExitsPanel exits={exits} onNavigate={playerGuid ? handleNavigate : undefined} disabled={navigateMutation.isPending} />
                    {/* Navigation UI for authenticated users */}
                    {playerGuid && (
                        <NavigationUI
                            availableExits={availableExitsWithHints}
                            onNavigate={handleNavigate}
                            disabled={navigateMutation.isPending}
                        />
                    )}
                    <PlayerStatsPanel stats={playerStats} />
                    {/* Command Interface */}
                    <section aria-labelledby="game-command-title-mobile">
                        <h3 id="game-command-title-mobile" className="text-responsive-base font-semibold text-white mb-3">
                            Command Interface
                        </h3>
                        <CommandInterface availableExits={availableExitDirections} />
                    </section>
                    <CommandHistoryPanel history={commandHistory} />
                </>
            )}
        </div>
    )
}
