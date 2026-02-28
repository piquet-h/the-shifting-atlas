import React, { useEffect, useRef } from 'react'

export interface CommandRecord {
    id: string
    command: string
    response?: string
    error?: string
    latencyMs?: number
    /** Simulated in-world travel time for movement commands (distinct from request latency). */
    travelMs?: number
    ts: number
}

function formatTravelMs(ms: number): string {
    // Keep this intentionally simple + additive-friendly (players can sum loops in seconds).
    const seconds = Math.round(ms / 1000)
    if (seconds <= 0) return `${ms}ms`
    return `${seconds}s`
}

export interface CommandOutputProps {
    items: CommandRecord[]
    'aria-label'?: string
    className?: string
    limit?: number // soft limit for display (older truncated visually)
}

/**
 * CommandOutput
 * Responsibilities:
 *  - Render a scrollable, accessible log of command requests/responses
 *  - Announce the latest response via an ARIA live region (polite)
 *  - Future: virtualization for long histories, copy-to-clipboard, filtering
 */
export default function CommandOutput({
    items,
    className,
    limit = 200,
    'aria-label': ariaLabel = 'Command output log'
}: CommandOutputProps): React.ReactElement {
    const liveRef = useRef<HTMLDivElement | null>(null)
    const scrollRef = useRef<HTMLDivElement | null>(null)

    const visible = items.slice(-limit)
    const last = visible[visible.length - 1]

    useEffect(() => {
        if (last && liveRef.current) {
            liveRef.current.textContent = last.error
                ? `Command failed: ${last.command}. ${last.error}`
                : `Command result: ${last.command}${last.response ? ` -> ${last.response}` : ''}`
        }
        // Auto-scroll to bottom when new item appended
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [last])

    return (
        <div className={['flex flex-col min-h-0', className].filter(Boolean).join(' ')} aria-label={ariaLabel} role="region">
            <div
                ref={scrollRef}
                className="flex-1 min-h-0 overflow-auto rounded-md bg-white/5 border border-white/10 p-2 sm:p-3 text-responsive-sm font-mono space-y-2"
            >
                {visible.length === 0 && <p className="text-slate-300 italic">No commands issued yet.</p>}
                {visible.map((rec) => (
                    <div key={rec.id} className="group">
                        <div className="flex items-start gap-1 sm:gap-2">
                            <span className="text-atlas-accent select-none">$</span>
                            <span className="break-all text-slate-200 flex-1 min-w-0">{rec.command}</span>
                            {rec.latencyMs != null && (
                                <span className="ml-auto text-[10px] sm:text-xs text-slate-500 flex-shrink-0" title="Latency">
                                    {rec.latencyMs}ms
                                </span>
                            )}
                            {rec.travelMs != null && (
                                <span
                                    className="text-[10px] sm:text-xs text-slate-500 flex-shrink-0"
                                    title="Simulated travel time (in-world)"
                                >
                                    Travel {formatTravelMs(rec.travelMs)}
                                </span>
                            )}
                        </div>
                        {rec.response && (
                            <div className="pl-3 sm:pl-5 text-emerald-300 whitespace-pre-wrap break-words">{rec.response}</div>
                        )}
                        {rec.error && (
                            <div className="pl-3 sm:pl-5 text-red-400 whitespace-pre-wrap break-words" role="alert">
                                {rec.error}
                            </div>
                        )}
                    </div>
                ))}
            </div>
            <div ref={liveRef} className="sr-only" aria-live="polite" />
        </div>
    )
}
