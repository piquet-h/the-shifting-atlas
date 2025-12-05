import type { LocationResponse, PingRequest, PingResponse } from '@piquet-h/shared'
import { useCallback, useEffect, useState } from 'react'
import { usePlayerGuid } from '../hooks/usePlayerGuid'
import { trackGameEventClient } from '../services/telemetry'
import { buildHeaders, buildLocationUrl, buildMoveRequest } from '../utils/apiClient'
import { extractErrorMessage } from '../utils/apiResponse'
import { buildCorrelationHeaders, generateCorrelationId } from '../utils/correlation'
import { unwrapEnvelope } from '../utils/envelope'
import CommandInput from './CommandInput'
import CommandOutput, { CommandRecord } from './CommandOutput'

interface CommandInterfaceProps {
    className?: string
    /** Available exits for the current location (for autocomplete) */
    availableExits?: string[]
}

/**
 * CommandInterface
 * Orchestrates the command input/output lifecycle.
 * MVP Implementation: supports a single built-in `ping` command invoking `/api/ping`.
 * Future: parsing, suggestions, command registry, optimistic world state deltas.
 */
export default function CommandInterface({ className, availableExits = [] }: CommandInterfaceProps): React.ReactElement {
    const { playerGuid, loading: guidLoading, error: guidError } = usePlayerGuid()
    const [history, setHistory] = useState<CommandRecord[]>([])
    const [busy, setBusy] = useState(false)
    const [currentLocationId, setCurrentLocationId] = useState<string | undefined>(undefined)
    const [commandHistory, setCommandHistory] = useState<string[]>([])

    // currentLocationId tracked for UI display only (not persisted)
    // Server reads player.currentLocationId from database for authoritative state

    // On mount or when playerGuid is resolved, hydrate currentLocationId from backend
    useEffect(() => {
        let aborted = false
        const hydrate = async () => {
            try {
                if (!playerGuid) return
                const res = await fetch(`/api/player/${playerGuid}`)
                const json = await res.json().catch(() => ({}))
                const unwrapped = unwrapEnvelope<{ id: string; currentLocationId?: string }>(json)
                if (!aborted && unwrapped?.data?.currentLocationId) {
                    setCurrentLocationId(unwrapped.data.currentLocationId)
                }
            } catch {
                // ignore – command flow will still work using starter location on first look
            }
        }
        hydrate()
        return () => {
            aborted = true
        }
    }, [playerGuid])

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
                            ...(playerGuid ? { 'x-player-guid': playerGuid } : {})
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
                    const url = buildLocationUrl(currentLocationId)
                    const headers = buildHeaders({
                        ...buildCorrelationHeaders(correlationId)
                    })
                    // Track UI event BEFORE request to capture user intent (dispatch time)
                    // Backend events will track processing outcome using the same correlationId
                    trackGameEventClient('UI.Location.Look', {
                        correlationId,
                        locationId: currentLocationId || null
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
                            setCurrentLocationId(loc.id)
                            const exits: string | undefined = Array.isArray(loc.exits)
                                ? loc.exits.map((e) => e.direction).join(', ')
                                : undefined
                            response = `${loc.name}: ${loc.description}${exits ? `\nExits: ${exits}` : ''}`
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
                        ...buildCorrelationHeaders(correlationId)
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
                    const unwrapped = unwrapEnvelope<LocationResponse>(json)
                    if (!res.ok || (unwrapped.isEnvelope && !unwrapped.success)) {
                        error = extractErrorMessage(res, json, unwrapped)
                    } else {
                        const loc = unwrapped.data
                        if (loc) {
                            setCurrentLocationId(loc.id)
                            const exits: string | undefined = Array.isArray(loc.exits)
                                ? loc.exits.map((e) => e.direction).join(', ')
                                : undefined
                            response = `Moved ${dir} -> ${loc.name}: ${loc.description}${exits ? `\nExits: ${exits}` : ''}`
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
                setHistory((h) => h.map((rec) => (rec.id === id ? { ...rec, response, error, latencyMs } : rec)))
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
        [playerGuid, currentLocationId]
    )

    return (
        <div className={className}>
            <CommandOutput items={history} className="mb-3 sm:mb-4" />
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
                Commands: <code className="px-1 rounded bg-slate-700/70 text-slate-100">ping</code>,{' '}
                <code className="px-1 rounded bg-slate-700/70 text-slate-100">look</code>,{' '}
                <code className="px-1 rounded bg-slate-700/70 text-slate-100">move &lt;direction&gt;</code>,{' '}
                <code className="px-1 rounded bg-slate-700/70 text-slate-100">clear</code>.
            </p>
        </div>
    )
}
