import type { LocationResponse, PingRequest, PingResponse } from '@piquet-h/shared'
import { forwardRef, useCallback, useImperativeHandle, useState } from 'react'
import { usePlayer } from '../contexts/PlayerContext'
import { getSessionId, trackGameEventClient } from '../services/telemetry'
import { buildHeaders, buildLocationUrl, buildMoveRequest } from '../utils/apiClient'
import { extractErrorMessage } from '../utils/apiResponse'
import { buildCorrelationHeaders, buildSessionHeaders, generateCorrelationId } from '../utils/correlation'
import { unwrapEnvelope } from '../utils/envelope'
import CommandInput from './CommandInput'
import CommandOutput, { CommandRecord } from './CommandOutput'

interface CommandInterfaceProps {
    className?: string
    /** Available exits for the current location (for autocomplete) */
    availableExits?: string[]
}

export interface CommandInterfaceHandle {
    appendRecord: (record: { command: string; response?: string; error?: string; latencyMs?: number }) => void
}

export function formatMoveResponse(direction: string, loc: LocationResponse): string {
    const exits: string | undefined = Array.isArray(loc.exits) ? loc.exits.map((e) => e.direction).join(', ') : undefined
    return `Moved ${direction} -> ${loc.name}: ${loc.description.text}${exits ? ` (Exits: ${exits})` : ''}`
}

/**
 * CommandInterface
 * Orchestrates the command input/output lifecycle.
 * MVP Implementation: supports a single built-in `ping` command invoking `/api/ping`.
 * Future: parsing, suggestions, command registry, optimistic world state deltas.
 */
const CommandInterface = forwardRef<CommandInterfaceHandle, CommandInterfaceProps>(function CommandInterface(
    { className, availableExits = [] }: CommandInterfaceProps,
    ref
): React.ReactElement {
    // Use PlayerContext for playerGuid and currentLocationId (no redundant API calls)
    const { playerGuid, currentLocationId, loading: guidLoading, error: guidError, updateCurrentLocationId } = usePlayer()
    const [history, setHistory] = useState<CommandRecord[]>([])
    const [busy, setBusy] = useState(false)
    const [commandHistory, setCommandHistory] = useState<string[]>([])

    // currentLocationId now comes from PlayerContext
    // No separate hydration useEffect needed

    const runCommand = useCallback(
        async (raw: string) => {
            const id = crypto.randomUUID()
            const ts = Date.now()
            const record: CommandRecord = { id, command: raw, ts }
            setHistory((h) => [...h, record])

            // Add to command history (skip 'clear' commands)
            if (raw && raw !== 'clear') {
                setCommandHistory((prev) => {
                    const newHistory = [...prev, raw]
                    // Keep last 50 commands
                    return newHistory.slice(-50)
                })
            }

            if (!raw) return
            if (raw === 'clear') {
                setHistory([])
                return
            }
            setBusy(true)
            let error: string | undefined
            let response: string | undefined
            let latencyMs: number | undefined
            let travelMs: number | undefined
            try {
                const start = performance.now()
                const lower = raw.trim().toLowerCase()
                // Only commands that mutate player state (move) require a resolved player GUID.
                const requiresPlayer = lower.startsWith('move ')
                if (!playerGuid && requiresPlayer) {
                    throw new Error(
                        'Cannot move yet - your session is still initializing. Please wait a moment and try again. ' +
                            'If this persists, try refreshing the page to clear stale session data.'
                    )
                }
                if (lower.startsWith('ping')) {
                    const requestBody: PingRequest = {
                        message: raw.replace(/^ping\s*/, '') || 'ping'
                    }
                    const res = await fetch('/api/ping', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(playerGuid ? { 'x-player-guid': playerGuid } : {}),
                            ...buildSessionHeaders(getSessionId())
                        },
                        body: JSON.stringify(requestBody)
                    })
                    const json = await res.json().catch(() => ({}))
                    latencyMs = Math.round(performance.now() - start)
                    const unwrapped = unwrapEnvelope<PingResponse>(json)
                    if (!res.ok || (unwrapped.isEnvelope && !unwrapped.success)) {
                        error = extractErrorMessage(res, json, unwrapped)
                    } else {
                        const data = unwrapped.data
                        response = data?.echo || 'pong'
                    }
                } else if (lower === 'look') {
                    // Generate correlation ID for look request
                    const correlationId = generateCorrelationId()

                    // Use currentLocationId from context (no separate fetch needed)
                    const locationToFetch = currentLocationId

                    const url = buildLocationUrl(locationToFetch)
                    const headers = buildHeaders({
                        ...buildCorrelationHeaders(correlationId),
                        ...buildSessionHeaders(getSessionId())
                    })
                    // Track UI event BEFORE request to capture user intent (dispatch time)
                    // Backend events will track processing outcome using the same correlationId
                    trackGameEventClient('UI.Location.Look', {
                        correlationId,
                        locationId: locationToFetch || null
                    })
                    const res = await fetch(url, { headers })
                    const json = await res.json().catch(() => ({}))
                    latencyMs = Math.round(performance.now() - start)
                    const unwrapped = unwrapEnvelope<LocationResponse>(json)
                    if (!res.ok || (unwrapped.isEnvelope && !unwrapped.success)) {
                        error = extractErrorMessage(res, json, unwrapped)
                    } else {
                        const loc = unwrapped.data
                        if (loc) {
                            updateCurrentLocationId(loc.id)
                            const exits: string | undefined = Array.isArray(loc.exits)
                                ? loc.exits.map((e) => e.direction).join(', ')
                                : undefined
                            response = `${loc.name}: ${loc.description.text}${exits ? ` (Exits: ${exits})` : ''}`
                        } else {
                            error = 'Malformed location response'
                        }
                    }
                } else if (lower.startsWith('move ')) {
                    const dir = lower.split(/\s+/)[1]
                    // Generate correlation ID for move request
                    const correlationId = generateCorrelationId()
                    const moveRequest = buildMoveRequest(playerGuid, dir)
                    const headers = buildHeaders({
                        'Content-Type': 'application/json',
                        'x-player-guid': playerGuid || '',
                        ...buildCorrelationHeaders(correlationId),
                        ...buildSessionHeaders(getSessionId())
                    })
                    // Track UI event BEFORE request to capture user intent (dispatch time)
                    // Backend events will track processing outcome using the same correlationId
                    trackGameEventClient('UI.Move.Command', {
                        correlationId,
                        direction: dir,
                        fromLocationId: currentLocationId || null
                    })
                    const res = await fetch(moveRequest.url, {
                        method: moveRequest.method,
                        headers,
                        body: JSON.stringify(moveRequest.body)
                    })
                    const json = await res.json().catch(() => ({}))
                    latencyMs = Math.round(performance.now() - start)
                    const unwrapped = unwrapEnvelope<LocationResponse & { travel?: { durationMs?: number } }>(json)
                    if (!res.ok || (unwrapped.isEnvelope && !unwrapped.success)) {
                        error = extractErrorMessage(res, json, unwrapped)
                    } else {
                        const loc = unwrapped.data
                        if (loc) {
                            travelMs = typeof loc.travel?.durationMs === 'number' ? loc.travel.durationMs : undefined
                            updateCurrentLocationId(loc.id)
                            const exits: string | undefined = Array.isArray(loc.exits)
                                ? loc.exits.map((e) => e.direction).join(', ')
                                : undefined
                            response = `Moved ${dir} -> ${loc.name}: ${loc.description.text}${exits ? ` (Exits: ${exits})` : ''}`
                        } else {
                            error = 'Malformed move response'
                        }
                    }
                } else {
                    response = `Unrecognized command: ${raw}`
                }
            } catch (err) {
                error = err instanceof Error ? err.message : 'Unknown error'
            } finally {
                setBusy(false)
                setHistory((h) => h.map((rec) => (rec.id === id ? { ...rec, response, error, latencyMs, travelMs } : rec)))
                // Canonical event (Command.Executed) now part of shared telemetry specification.
                trackGameEventClient('Command.Executed', {
                    command: raw.split(/\s+/)[0],
                    success: !error,
                    latencyMs: latencyMs ?? null,
                    error: error || undefined,
                    locationId: currentLocationId || null
                })
            }
        },
        [playerGuid, currentLocationId, updateCurrentLocationId]
    )

    useImperativeHandle(
        ref,
        () => ({
            appendRecord: ({ command, response, error, latencyMs }) => {
                const id = crypto.randomUUID()
                const ts = Date.now()
                setHistory((h) => [...h, { id, command, response, error, latencyMs, ts }])

                if (command && command !== 'clear') {
                    setCommandHistory((prev) => {
                        const next = [...prev, command]
                        return next.slice(-50)
                    })
                }
            }
        }),
        []
    )

    return (
        <div className={['flex flex-col h-full', className].filter(Boolean).join(' ')}>
            <CommandOutput items={history} className="mb-3 sm:mb-4 flex-1 min-h-0" />
            {/* Show status message if player GUID is loading or errored */}
            {guidLoading && !playerGuid && (
                <div className="mb-2 text-responsive-sm text-amber-400 flex items-center gap-2">
                    <span className="inline-block w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                    Initializing session...
                </div>
            )}
            {guidError && !playerGuid && (
                <div className="mb-2 text-responsive-sm text-red-400">
                    Session initialization failed: {guidError}. Some commands may not work.
                </div>
            )}
            {/* Enable commands before player GUID resolves for non-player dependent actions (ping, look, clear).
                Disable only while GUID is actively loading and not yet available to reduce confusion.
                Note: move commands have additional validation in runCommand that checks playerGuid. */}
            <CommandInput
                onSubmit={runCommand}
                busy={busy}
                disabled={(guidLoading && !playerGuid) || busy}
                availableExits={availableExits}
                commandHistory={commandHistory}
            />
            <p className="mt-2 text-responsive-sm text-slate-300">
                Commands: <code className="code-inline">ping</code>, <code className="code-inline">look</code>,{' '}
                <code className="code-inline">move &lt;direction&gt;</code>, <code className="code-inline">clear</code>.
            </p>
        </div>
    )
})

export default CommandInterface
