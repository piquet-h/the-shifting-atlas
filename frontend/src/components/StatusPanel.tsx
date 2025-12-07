/**
 * StatusPanel Component
 *
 * Persistent status panel displaying:
 * - Player health (bar or numeric) with visual indicators for low health (<25%)
 * - Current location name (truncated with ellipsis for long names)
 * - Inventory item count (99+ cap for large values)
 * - Session duration timer (elapsed playtime)
 *
 * Features:
 * - Fixed position (top or side of screen)
 * - Auto-refresh on navigation or inventory change
 * - Collapsible on mobile (<640px) to save screen space
 * - Visual indicators for low health (<25%)
 * - Defeated state when health = 0
 *
 * Edge Cases:
 * - Health = 0 → display "defeated" state (no auto-refresh)
 * - Inventory count >99 → display "99+" instead of exact number
 * - Very long location names → truncate with ellipsis
 */
import React, { useState } from 'react'
import { useMediaQuery } from '../hooks/useMediaQueries'
import { useSessionTimer } from '../hooks/useSessionTimer'

export interface StatusPanelProps {
    /** Player health (0-max) */
    health: number
    /** Maximum health */
    maxHealth: number
    /** Current location name */
    locationName: string
    /** Inventory item count */
    inventoryCount: number
    /** Optional className for custom positioning */
    className?: string
}

/**
 * StatusPanel - Persistent player status display
 * Fixed to top-right of screen on desktop, collapsible on mobile
 */
export default function StatusPanel({ health, maxHealth, locationName, inventoryCount, className }: StatusPanelProps): React.ReactElement {
    const isMobile = !useMediaQuery('(min-width: 640px)')
    const [isCollapsed, setIsCollapsed] = useState(isMobile)
    const { duration } = useSessionTimer()

    // Calculate health percentage
    const healthPercent = maxHealth > 0 ? Math.round((health / maxHealth) * 100) : 0
    const isLowHealth = healthPercent < 25
    const isDefeated = health === 0

    // Determine health bar color
    const healthColor = isDefeated ? 'bg-gray-500' : isLowHealth ? 'bg-red-500' : healthPercent > 60 ? 'bg-emerald-500' : 'bg-amber-500'

    // Format inventory count with 99+ cap
    const displayInventoryCount = inventoryCount > 99 ? '99+' : inventoryCount.toString()

    // Truncate location name if too long (max 30 chars)
    const maxLocationNameLength = 30
    const displayLocationName =
        locationName.length > maxLocationNameLength ? locationName.slice(0, maxLocationNameLength) + '...' : locationName

    // Toggle collapse on mobile only
    const handleToggle = () => {
        if (isMobile) {
            setIsCollapsed(!isCollapsed)
        }
    }

    return (
        <aside
            className={[
                'bg-slate-800/95 backdrop-blur-sm ring-1 ring-white/10 rounded-xl shadow-xl',
                'transition-all duration-300',
                isMobile ? 'fixed top-4 right-4 left-4 z-50' : 'fixed top-4 right-4 z-50 w-80',
                className
            ]
                .filter(Boolean)
                .join(' ')}
            aria-labelledby="status-panel-title"
            aria-live="polite"
            aria-atomic="false"
        >
            {/* Header */}
            <button
                onClick={handleToggle}
                className={[
                    'w-full flex items-center justify-between p-4',
                    isMobile
                        ? 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-atlas-accent rounded-t-xl'
                        : 'cursor-default'
                ].join(' ')}
                aria-expanded={!isCollapsed}
                aria-controls="status-panel-content"
                disabled={!isMobile}
                tabIndex={isMobile ? 0 : -1}
            >
                <h2 id="status-panel-title" className="text-responsive-base font-semibold text-white">
                    Player Status
                </h2>
                {isMobile && (
                    <span className="text-slate-400 transition-transform" aria-hidden="true">
                        {isCollapsed ? '▼' : '▲'}
                    </span>
                )}
            </button>

            {/* Content */}
            {!isCollapsed && (
                <div id="status-panel-content" className="px-4 pb-4 space-y-3">
                    {/* Defeated State Banner */}
                    {isDefeated && (
                        <div className="p-2 rounded-lg bg-red-900/40 ring-1 ring-red-500/40 text-center" role="alert">
                            <span className="text-responsive-sm text-red-300 font-semibold">Defeated</span>
                        </div>
                    )}

                    {/* Health */}
                    <div>
                        <div className="flex justify-between text-responsive-sm mb-1">
                            <span className="text-slate-300">Health</span>
                            <span
                                className={['font-medium', isLowHealth && !isDefeated ? 'text-red-400 animate-pulse' : 'text-white'].join(
                                    ' '
                                )}
                            >
                                {health}/{maxHealth}
                            </span>
                        </div>
                        <div
                            className="h-2 bg-slate-700 rounded-full overflow-hidden"
                            role="progressbar"
                            aria-valuenow={health}
                            aria-valuemin={0}
                            aria-valuemax={maxHealth}
                            aria-label="Player health"
                        >
                            <div className={`h-full ${healthColor} transition-all duration-300`} style={{ width: `${healthPercent}%` }} />
                        </div>
                        {isLowHealth && !isDefeated && (
                            <p className="text-[10px] sm:text-xs text-red-400 mt-1" role="status">
                                ⚠️ Low health!
                            </p>
                        )}
                    </div>

                    {/* Location */}
                    <div className="flex justify-between text-responsive-sm">
                        <span className="text-slate-300">Location</span>
                        <span className="text-white font-medium truncate max-w-[60%]" title={locationName}>
                            {displayLocationName}
                        </span>
                    </div>

                    {/* Inventory */}
                    <div className="flex justify-between text-responsive-sm">
                        <span className="text-slate-300">Inventory</span>
                        <span className="text-white font-medium" title={`${inventoryCount} items`}>
                            {displayInventoryCount} items
                        </span>
                    </div>

                    {/* Session Duration */}
                    <div className="flex justify-between text-responsive-sm pt-2 border-t border-white/10">
                        <span className="text-slate-300">Session</span>
                        <span className="text-white font-mono font-medium">{duration}</span>
                    </div>
                </div>
            )}
        </aside>
    )
}
