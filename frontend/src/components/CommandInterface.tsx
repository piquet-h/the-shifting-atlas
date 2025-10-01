/* global sessionStorage */
import React, { useCallback, useEffect, useState } from 'react'
import { usePlayerGuid } from '../hooks/usePlayerGuid'
import { trackGameEventClient } from '../services/telemetry'
import CommandInput from './CommandInput'
import CommandOutput, { CommandRecord } from './CommandOutput'

interface CommandInterfaceProps {
    className?: string
    // playerGuid prop deprecated; auto-bootstrap handled internally. If provided it overrides internal hook.
    playerGuid?: string | null
}

/**
 * CommandInterface
 * Orchestrates the command input/output lifecycle.
 * MVP Implementation: supports a single built-in `ping` command invoking `/api/ping`.
 * Future: parsing, suggestions, command registry, optimistic world state deltas.
 */
export default function CommandInterface({ className, playerGuid: overrideGuid }: CommandInterfaceProps): React.ReactElement {
    const { playerGuid, loading: guidLoading } = usePlayerGuid()
    const effectiveGuid = overrideGuid ?? playerGuid
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
                if (!effectiveGuid && raw !== 'clear') {
                    throw new Error('Player not ready yet')
                }
                const start = performance.now()
                const lower = raw.trim().toLowerCase()
                if (lower.startsWith('ping')) {
                    const payload = { playerGuid: effectiveGuid, message: raw.replace(/^ping\s*/, '') || 'ping' }
                    const res = await fetch('/api/ping', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(effectiveGuid ? { 'x-player-guid': effectiveGuid } : {})
                        },
                        body: JSON.stringify(payload)
                    })
                    const json = await res.json()
                    latencyMs = Math.round(performance.now() - start)
                    if (!res.ok) error = json?.error || `HTTP ${res.status}`
                    else response = json?.message || 'pong'
                } else if (lower === 'look') {
                    const res = await fetch(`/api/location${currentLocationId ? `?id=${encodeURIComponent(currentLocationId)}` : ''}`, {
                        headers: effectiveGuid ? { 'x-player-guid': effectiveGuid } : undefined
                    })
                    const json = await res.json()
                    latencyMs = Math.round(performance.now() - start)
                    if (!res.ok) error = json?.error || `HTTP ${res.status}`
                    else {
                        setCurrentLocationId(json.id)
                        const exits: string | undefined = Array.isArray(json.exits)
                            ? (json.exits as { direction: string }[]).map((e) => e.direction).join(', ')
                            : undefined
                        response = `${json.name}: ${json.description}${exits ? `\nExits: ${exits}` : ''}`
                    }
                } else if (lower.startsWith('move ')) {
                    const dir = lower.split(/\s+/)[1]
                    const fromParam = currentLocationId ? `&from=${encodeURIComponent(currentLocationId)}` : ''
                    const res = await fetch(`/api/location/move?dir=${encodeURIComponent(dir)}${fromParam}`, {
                        headers: effectiveGuid ? { 'x-player-guid': effectiveGuid } : undefined
                    })
                    const json = await res.json()
                    latencyMs = Math.round(performance.now() - start)
                    if (!res.ok) error = json?.error || `Cannot move ${dir}`
                    else {
                        setCurrentLocationId(json.id)
                        const exits: string | undefined = Array.isArray(json.exits)
                            ? (json.exits as { direction: string }[]).map((e) => e.direction).join(', ')
                            : undefined
                        response = `Moved ${dir} -> ${json.name}: ${json.description}${exits ? `\nExits: ${exits}` : ''}`
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
        [effectiveGuid, currentLocationId]
    )

    return (
        <div className={className}>
            <CommandOutput items={history} className="mb-4" />
            <CommandInput onSubmit={runCommand} busy={busy} disabled={!effectiveGuid || guidLoading} />
            <p className="mt-2 text-[11px] text-slate-300">
                Commands: <code className="px-1 rounded bg-slate-700/70 text-slate-100">ping</code>,{' '}
                <code className="px-1 rounded bg-slate-700/70 text-slate-100">look</code>,{' '}
                <code className="px-1 rounded bg-slate-700/70 text-slate-100">move &lt;direction&gt;</code>,{' '}
                <code className="px-1 rounded bg-slate-700/70 text-slate-100">clear</code>.
            </p>
        </div>
    )
}
