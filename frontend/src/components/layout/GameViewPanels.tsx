import React, { useState } from 'react'

/** Number of command history items to display */
const COMMAND_HISTORY_LIMIT = 10

/** Player stats placeholder (until real backend integration) */
export interface PlayerStats {
    health: number
    maxHealth: number
    locationName: string
    inventoryCount: number
}

export interface CommandHistoryItem {
    id: string
    command: string
    response?: string
    error?: string
    timestamp: number
}

/**
 * PlayerStatsPanel
 * Displays player health, current location, and inventory count.
 * On mobile (<640px), the panel is collapsible to save screen space.
 */
export function PlayerStatsPanel({ stats, collapsible = false }: { stats: PlayerStats | null; collapsible?: boolean }): React.ReactElement {
    const [isExpanded, setIsExpanded] = useState(true)

    if (!stats) {
        return (
            <section className="card rounded-xl p-4 sm:p-5" aria-labelledby="stats-title" aria-busy="true">
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
                    <div className="flex justify-between text-responsive-sm">
                        <span className="text-slate-300">Location</span>
                        <span className="text-white font-medium truncate max-w-[60%]">{stats.locationName}</span>
                    </div>
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
export function CommandHistoryPanel({
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
