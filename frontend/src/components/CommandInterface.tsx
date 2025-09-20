import React, { useCallback, useState } from 'react';
import CommandInput from './CommandInput';
import CommandOutput, { CommandRecord } from './CommandOutput';

interface CommandInterfaceProps {
    className?: string;
    playerGuid?: string | null;
}

/**
 * CommandInterface
 * Orchestrates the command input/output lifecycle.
 * MVP Implementation: supports a single built-in `ping` command invoking `/api/ping`.
 * Future: parsing, suggestions, command registry, optimistic world state deltas.
 */
export default function CommandInterface({
    className,
    playerGuid,
}: CommandInterfaceProps): React.ReactElement {
    const [history, setHistory] = useState<CommandRecord[]>([]);
    const [busy, setBusy] = useState(false);

    const runCommand = useCallback(
        async (raw: string) => {
            const id = crypto.randomUUID();
            const ts = Date.now();
            const record: CommandRecord = { id, command: raw, ts };
            setHistory((h) => [...h, record]);

            if (!raw) return;
            if (raw === 'clear') {
                setHistory([]);
                return;
            }
            setBusy(true);
            let error: string | undefined;
            let response: string | undefined;
            let latencyMs: number | undefined;
            try {
                if (raw.startsWith('ping')) {
                    const start = performance.now();
                    const payload = {
                        guid: playerGuid || 'guest',
                        message: raw.replace(/^ping\s*/, '') || 'ping',
                    };
                    const res = await fetch('/api/ping', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                    });
                    const json = await res.json();
                    latencyMs = Math.round(performance.now() - start);
                    if (!res.ok) {
                        error = json?.error || `HTTP ${res.status}`;
                    } else {
                        response = json?.message || 'pong';
                    }
                } else {
                    response = `Unrecognized command: ${raw}`;
                }
            } catch (err) {
                error = err instanceof Error ? err.message : 'Unknown error';
            } finally {
                setBusy(false);
                setHistory((h) =>
                    h.map((rec) => (rec.id === id ? { ...rec, response, error, latencyMs } : rec)),
                );
            }
        },
        [playerGuid],
    );

    return (
        <div className={className}>
            <CommandOutput items={history} className="mb-4" />
            <CommandInput onSubmit={runCommand} busy={busy} />
            <p className="mt-2 text-[10px] text-slate-500">
                Type <code>ping</code> to test latency, <code>clear</code> to reset.
            </p>
        </div>
    );
}
