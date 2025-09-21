import React, {useCallback, useState} from 'react'
import {trackEvent} from '../services/telemetry'
import CommandInput from './CommandInput'
import CommandOutput, {CommandRecord} from './CommandOutput'

interface CommandInterfaceProps {
    className?: string
    playerGuid?: string | null // if absent, commands (except help/clear) disabled
}

/**
 * CommandInterface
 * Orchestrates the command input/output lifecycle.
 * MVP Implementation: supports a single built-in `ping` command invoking `/api/ping`.
 * Future: parsing, suggestions, command registry, optimistic world state deltas.
 */
export default function CommandInterface({className, playerGuid}: CommandInterfaceProps): React.ReactElement {
    const [history, setHistory] = useState<CommandRecord[]>([])
    const [busy, setBusy] = useState(false)
    const [currentRoomId, setCurrentRoomId] = useState<string | undefined>(undefined)

    const runCommand = useCallback(
        async (raw: string) => {
            const id = crypto.randomUUID()
            const ts = Date.now()
            const record: CommandRecord = {id, command: raw, ts}
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
                    const payload = {playerGuid, message: raw.replace(/^ping\s*/, '') || 'ping'}
                    const res = await fetch('/api/ping', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify(payload)
                    })
                    const json = await res.json()
                    latencyMs = Math.round(performance.now() - start)
                    if (!res.ok) error = json?.error || `HTTP ${res.status}`
                    else response = json?.message || 'pong'
                } else if (lower === 'look') {
                    const res = await fetch(`/api/room${currentRoomId ? `?id=${encodeURIComponent(currentRoomId)}` : ''}`)
                    const json = await res.json()
                    latencyMs = Math.round(performance.now() - start)
                    if (!res.ok) error = json?.error || `HTTP ${res.status}`
                    else {
                        setCurrentRoomId(json.id)
                        const exits: string | undefined = Array.isArray(json.exits)
                            ? (json.exits as {direction: string}[]).map((e) => e.direction).join(', ')
                            : undefined
                        response = `${json.name}: ${json.description}${exits ? `\nExits: ${exits}` : ''}`
                    }
                } else if (lower.startsWith('move ')) {
                    const dir = lower.split(/\s+/)[1]
                    const fromParam = currentRoomId ? `&from=${encodeURIComponent(currentRoomId)}` : ''
                    const res = await fetch(`/api/room/move?dir=${encodeURIComponent(dir)}${fromParam}`)
                    const json = await res.json()
                    latencyMs = Math.round(performance.now() - start)
                    if (!res.ok) error = json?.error || `Cannot move ${dir}`
                    else {
                        setCurrentRoomId(json.id)
                        const exits: string | undefined = Array.isArray(json.exits)
                            ? (json.exits as {direction: string}[]).map((e) => e.direction).join(', ')
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
                setHistory((h) => h.map((rec) => (rec.id === id ? {...rec, response, error, latencyMs} : rec)))
                trackEvent('command.executed', {
                    command: raw.split(/\s+/)[0],
                    full: raw,
                    success: !error,
                    latencyMs,
                    error: error || undefined,
                    roomId: currentRoomId || null
                })
            }
        },
        [playerGuid, currentRoomId]
    )

    return (
        <div className={className}>
            <CommandOutput items={history} className="mb-4" />
            <CommandInput onSubmit={runCommand} busy={busy} disabled={!playerGuid} />
            <p className="mt-2 text-[11px] text-slate-300">
                Commands: <code className="px-1 rounded bg-slate-700/70 text-slate-100">ping</code>,{' '}
                <code className="px-1 rounded bg-slate-700/70 text-slate-100">look</code>,{' '}
                <code className="px-1 rounded bg-slate-700/70 text-slate-100">move &lt;direction&gt;</code>,{' '}
                <code className="px-1 rounded bg-slate-700/70 text-slate-100">clear</code>.
            </p>
        </div>
    )
}
