/* global sessionStorage */
import React, { useCallback, useEffect, useState } from 'react'
import { usePlayerGuid } from '../hooks/usePlayerGuid'
import { trackGameEventClient } from '../services/telemetry'
import { unwrapEnvelope } from '../utils/envelope'
import { extractErrorMessage } from '../utils/apiResponse'
import CommandInput from './CommandInput'
import CommandOutput, { CommandRecord } from './CommandOutput'

interface CommandInterfaceProps {
    className?: string
}

/**
 * CommandInterface
 * Orchestrates the command input/output lifecycle.
 * MVP Implementation: supports a single built-in `ping` command invoking `/api/ping`.
 * Future: parsing, suggestions, command registry, optimistic world state deltas.
 */
export default function CommandInterface({ className }: CommandInterfaceProps): React.ReactElement {
    const { playerGuid, loading: guidLoading } = usePlayerGuid()
    const [history, setHistory] = useState<CommandRecord[]>([])
    const [busy, setBusy] = useState(false)
    const [currentLocationId, setCurrentLocationId] = useState<string | undefined>(undefined)

    // Persist current location id across reloads within a browser tab (session-scoped persistence)
    useEffect(() => {
        try {
            const stored = sessionStorage.getItem('tsa.currentLocationId')
            if (stored) setCurrentLocationId(stored)
        } catch {
            /* ignore storage errors */
        }
    }, [])

    useEffect(() => {
        try {
            if (currentLocationId) sessionStorage.setItem('tsa.currentLocationId', currentLocationId)
            else sessionStorage.removeItem('tsa.currentLocationId')
        } catch {
            /* ignore */
        }
    }, [currentLocationId])

    const runCommand = useCallback(
        async (raw: string) => {
            const id = crypto.randomUUID()
            const ts = Date.now()
            const record: CommandRecord = { id, command: raw, ts }
            setHistory((h) => [...h, record])

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
                if (!playerGuid && raw !== 'clear') {
                    throw new Error('Player not ready yet')
                }
                const start = performance.now()
                const lower = raw.trim().toLowerCase()
                if (lower.startsWith('ping')) {
                    const payload = { playerGuid: playerGuid, message: raw.replace(/^ping\s*/, '') || 'ping' }
                    const res = await fetch('/api/ping', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(playerGuid ? { 'x-player-guid': playerGuid } : {})
                        },
                        body: JSON.stringify(payload)
                    })
                    const json = await res.json().catch(() => ({}))
                    latencyMs = Math.round(performance.now() - start)
                    const unwrapped = unwrapEnvelope<Record<string, unknown>>(json)
                    if (!res.ok || (unwrapped.isEnvelope && !unwrapped.success)) {
                        error = extractErrorMessage(res, json, unwrapped)
                    } else {
                        const data = unwrapped.data || {}
                        response = (data.echo as string) || 'pong'
                    }
                } else if (lower === 'look') {
                    const res = await fetch(`/api/location${currentLocationId ? `?id=${encodeURIComponent(currentLocationId)}` : ''}`, {
                        headers: playerGuid ? { 'x-player-guid': playerGuid } : undefined
                    })
                    const json = await res.json().catch(() => ({}))
                    latencyMs = Math.round(performance.now() - start)
                    const unwrapped = unwrapEnvelope<Record<string, unknown>>(json)
                    if (!res.ok || (unwrapped.isEnvelope && !unwrapped.success)) {
                        error = extractErrorMessage(res, json, unwrapped)
                    } else {
                        const loc = unwrapped.data as Record<string, unknown> | undefined
                        if (loc) {
                            setCurrentLocationId(loc.id as string)
                            const exitsArray = loc.exits as { direction: string }[] | undefined
                            const exits: string | undefined = Array.isArray(exitsArray)
                                ? exitsArray.map((e) => e.direction).join(', ')
                                : undefined
                            response = `${loc.name}: ${loc.description}${exits ? `\nExits: ${exits}` : ''}`
                        } else {
                            error = 'Malformed location response'
                        }
                    }
                } else if (lower.startsWith('move ')) {
                    const dir = lower.split(/\s+/)[1]
                    const fromParam = currentLocationId ? `&from=${encodeURIComponent(currentLocationId)}` : ''
                    const res = await fetch(`/api/player/move?dir=${encodeURIComponent(dir)}${fromParam}`, {
                        headers: playerGuid ? { 'x-player-guid': playerGuid } : undefined
                    })
                    const json = await res.json().catch(() => ({}))
                    latencyMs = Math.round(performance.now() - start)
                    const unwrapped = unwrapEnvelope<Record<string, unknown>>(json)
                    if (!res.ok || (unwrapped.isEnvelope && !unwrapped.success)) {
                        error = extractErrorMessage(res, json, unwrapped)
                    } else {
                        const loc = unwrapped.data as Record<string, unknown> | undefined
                        if (loc) {
                            setCurrentLocationId(loc.id as string)
                            const exitsArray = loc.exits as { direction: string }[] | undefined
                            const exits: string | undefined = Array.isArray(exitsArray)
                                ? exitsArray.map((e) => e.direction).join(', ')
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
            <CommandOutput items={history} className="mb-4" />
            <CommandInput onSubmit={runCommand} busy={busy} disabled={!playerGuid || guidLoading} />
            <p className="mt-2 text-[11px] text-slate-300">
                Commands: <code className="px-1 rounded bg-slate-700/70 text-slate-100">ping</code>,{' '}
                <code className="px-1 rounded bg-slate-700/70 text-slate-100">look</code>,{' '}
                <code className="px-1 rounded bg-slate-700/70 text-slate-100">move &lt;direction&gt;</code>,{' '}
                <code className="px-1 rounded bg-slate-700/70 text-slate-100">clear</code>.
            </p>
        </div>
    )
}
