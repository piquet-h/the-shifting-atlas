import type { LocationResponse, PingRequest, PingResponse } from '@piquet-h/shared'
import { forwardRef, useCallback, useImperativeHandle, useState } from 'react'
import { usePlayer } from '../contexts/PlayerContext'
import { getSessionId, trackGameEventClient } from '../services/telemetry'
import { buildHeaders, buildLocationUrl, buildMoveRequest, buildResolveCommandRequest } from '../utils/apiClient'
import { extractErrorMessage } from '../utils/apiResponse'
import { buildCorrelationHeaders, buildSessionHeaders, generateCorrelationId } from '../utils/correlation'
import { unwrapEnvelope } from '../utils/envelope'
import CommandInput from './CommandInput'
import CommandOutput, { CommandRecord } from './CommandOutput'
import type { Direction } from './hooks/useGameNavigationFlow'

/** Resolution data returned by POST /api/player/command */
interface CommandResolution {
    actionKind: 'Move' | 'Look' | 'Unknown'
    direction?: string
    canonicalWritesPlanned: boolean
    parsedIntent: {
        verb: string | null
        confidence: number
        needsClarification: boolean
        ambiguities?: Array<{
            id: string
            spanText: string
            issueType: string
            suggestions: string[]
            critical: boolean
        }>
    }
}

const VALID_DIRECTIONS = new Set<string>([
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
])

function isDirection(value: string): value is Direction {
    return VALID_DIRECTIONS.has(value)
}

interface CommandInterfaceProps {
    className?: string
    /** Available exits for the current location (for autocomplete) */
    availableExits?: string[]
    /** Optional external move handler used by GameView to share arrival-pause/soft-denial navigation flow. */
    onMoveCommand?: (direction: Direction) => void
    /** Optional busy flag controlled by parent navigation flow. */
    externalBusy?: boolean
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
    { className, availableExits = [], onMoveCommand, externalBusy = false }: CommandInterfaceProps,
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
            const lower = raw.trim().toLowerCase()
            const delegatedMove = lower.startsWith('move ') && !!onMoveCommand
            const delegatedDirection = delegatedMove ? lower.split(/\s+/)[1] : undefined

            if (raw && raw !== 'clear') {
                setCommandHistory((prev) => {
                    const newHistory = [...prev, raw]
                    return newHistory.slice(-50)
                })
            }

            if (!raw) return
            const id = crypto.randomUUID()
            const ts = Date.now()
            if (raw === 'clear') {
                setHistory([])
                return
            }

            if (delegatedMove && delegatedDirection && isDirection(delegatedDirection)) {
                onMoveCommand(delegatedDirection)
                return
            }

            const record: CommandRecord = { id, command: raw, ts }
            setHistory((h) => [...h, record])
            setBusy(true)
            let error: string | undefined
            let response: string | undefined
            let latencyMs: number | undefined
            let travelMs: number | undefined
            try {
                const start = performance.now()
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
                        const jsonObj = json as Record<string, unknown>
                        const errorObj = jsonObj?.error as Record<string, unknown> | undefined
                        const errorCode = unwrapped.error?.code || errorObj?.code
                        if (errorCode === 'ExitGenerationRequested') {
                            response = 'The path is still being revealed. Please wait…'
                        } else {
                            error = extractErrorMessage(res, json, unwrapped)
                        }
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
                    // Free-form input: route through ResolvePlayerCommand (non-mutating) then
                    // invoke the appropriate canonical endpoint based on the resolved actionKind.
                    if (!playerGuid) {
                        throw new Error(
                            'Cannot process command yet - your session is still initializing. Please wait a moment and try again.'
                        )
                    }
                    const correlationId = generateCorrelationId()
                    const resolveReq = buildResolveCommandRequest(playerGuid, raw.trim())
                    const resolveHeaders = buildHeaders({
                        'Content-Type': 'application/json',
                        ...buildCorrelationHeaders(correlationId),
                        ...buildSessionHeaders(getSessionId())
                    })
                    const resolveRes = await fetch(resolveReq.url, {
                        method: resolveReq.method,
                        headers: resolveHeaders,
                        body: JSON.stringify(resolveReq.body)
                    })
                    const resolveJson = await resolveRes.json().catch(() => ({}))
                    const unwrappedResolve = unwrapEnvelope<CommandResolution>(resolveJson)

                    if (!resolveRes.ok || (unwrappedResolve.isEnvelope && !unwrappedResolve.success)) {
                        latencyMs = Math.round(performance.now() - start)
                        error = extractErrorMessage(resolveRes, resolveJson, unwrappedResolve)
                    } else {
                        // Use the correlation ID echoed back by the resolver for follow-on calls.
                        const canonicalCorrelationId = unwrappedResolve.correlationId ?? correlationId
                        const resolution = unwrappedResolve.data

                        if (resolution?.actionKind === 'Move' && resolution.direction) {
                            // Resolved to a movement: invoke the canonical move endpoint.
                            const moveRequest = buildMoveRequest(playerGuid, resolution.direction)
                            const moveHeaders = buildHeaders({
                                'Content-Type': 'application/json',
                                'x-player-guid': playerGuid,
                                ...buildCorrelationHeaders(canonicalCorrelationId),
                                ...buildSessionHeaders(getSessionId())
                            })
                            trackGameEventClient('UI.Move.Command', {
                                correlationId: canonicalCorrelationId,
                                direction: resolution.direction,
                                fromLocationId: currentLocationId || null
                            })
                            const moveRes = await fetch(moveRequest.url, {
                                method: moveRequest.method,
                                headers: moveHeaders,
                                body: JSON.stringify(moveRequest.body)
                            })
                            const moveJson = await moveRes.json().catch(() => ({}))
                            latencyMs = Math.round(performance.now() - start)
                            const unwrappedMove = unwrapEnvelope<LocationResponse & { travel?: { durationMs?: number } }>(moveJson)
                            if (!moveRes.ok || (unwrappedMove.isEnvelope && !unwrappedMove.success)) {
                                const jsonObj = moveJson as Record<string, unknown>
                                const errorObj = jsonObj?.error as Record<string, unknown> | undefined
                                const errorCode = unwrappedMove.error?.code || errorObj?.code
                                if (errorCode === 'ExitGenerationRequested') {
                                    response = 'The path is still being revealed. Please wait…'
                                } else {
                                    error = extractErrorMessage(moveRes, moveJson, unwrappedMove)
                                }
                            } else {
                                const loc = unwrappedMove.data
                                if (loc) {
                                    travelMs = typeof loc.travel?.durationMs === 'number' ? loc.travel.durationMs : undefined
                                    updateCurrentLocationId(loc.id)
                                    response = formatMoveResponse(resolution.direction, loc)
                                } else {
                                    error = 'Malformed move response'
                                }
                            }
                        } else if (resolution?.actionKind === 'Look') {
                            // Resolved to a look: invoke the canonical location endpoint.
                            const locationToFetch = currentLocationId
                            const url = buildLocationUrl(locationToFetch)
                            const lookHeaders = buildHeaders({
                                ...buildCorrelationHeaders(canonicalCorrelationId),
                                ...buildSessionHeaders(getSessionId())
                            })
                            trackGameEventClient('UI.Location.Look', {
                                correlationId: canonicalCorrelationId,
                                locationId: locationToFetch || null
                            })
                            const lookRes = await fetch(url, { headers: lookHeaders })
                            const lookJson = await lookRes.json().catch(() => ({}))
                            latencyMs = Math.round(performance.now() - start)
                            const unwrappedLook = unwrapEnvelope<LocationResponse>(lookJson)
                            if (!lookRes.ok || (unwrappedLook.isEnvelope && !unwrappedLook.success)) {
                                error = extractErrorMessage(lookRes, lookJson, unwrappedLook)
                            } else {
                                const loc = unwrappedLook.data
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
                        } else {
                            // Unknown or clarification needed: safe feedback only, no canonical writes.
                            latencyMs = Math.round(performance.now() - start)
                            const needsClarification = resolution?.parsedIntent.needsClarification
                            const ambiguities = resolution?.parsedIntent.ambiguities
                            if (needsClarification && ambiguities?.length) {
                                const amb = ambiguities[0]
                                response = `Not sure what you mean by "${amb.spanText}". Try: ${amb.suggestions.slice(0, 2).join(', ')}`
                            } else {
                                response = `Not sure how to do that. Try: ping, look, move <direction>, or clear.`
                            }
                        }
                    }
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
        [playerGuid, currentLocationId, updateCurrentLocationId, onMoveCommand]
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
                disabled={(guidLoading && !playerGuid) || busy || externalBusy}
                availableExits={availableExits}
                commandHistory={commandHistory}
            />
            <p className="mt-2 text-responsive-sm text-slate-300">
                Commands: <code className="code-inline">ping</code>, <code className="code-inline">look</code>,{' '}
                <code className="code-inline">move &lt;direction&gt;</code>, <code className="code-inline">clear</code>, or free-form text
                (e.g., <code className="code-inline">go north</code>).
            </p>
        </div>
    )
})

export default CommandInterface
