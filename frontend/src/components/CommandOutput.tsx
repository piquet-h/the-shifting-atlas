import React, { useEffect, useRef } from 'react';

export interface CommandRecord {
  id: string;
  command: string;
  response?: string;
  error?: string;
  latencyMs?: number;
  ts: number;
}

export interface CommandOutputProps {
  items: CommandRecord[];
  'aria-label'?: string;
  className?: string;
  limit?: number; // soft limit for display (older truncated visually)
}

/**
 * CommandOutput
 * Responsibilities:
 *  - Render a scrollable, accessible log of command requests/responses
 *  - Announce the latest response via an ARIA live region (polite)
 *  - Future: virtualization for long histories, copy-to-clipboard, filtering
 */
export default function CommandOutput({ items, className, limit = 200, 'aria-label': ariaLabel = 'Command output log' }: CommandOutputProps): React.ReactElement {
  const liveRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const visible = items.slice(-limit);
  const last = visible[visible.length - 1];

  useEffect(() => {
    if (last && liveRef.current) {
      liveRef.current.textContent = last.error
        ? `Command failed: ${last.command}. ${last.error}`
        : `Command result: ${last.command}${last.response ? ` -> ${last.response}` : ''}`;
    }
    // Auto-scroll to bottom when new item appended
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [last]);

  return (
    <div className={className} aria-label={ariaLabel} role="region">
      <div
        ref={scrollRef}
        className="h-56 overflow-auto rounded-md bg-white/5 border border-white/10 p-3 text-xs font-mono space-y-2"
      >
        {visible.length === 0 && (
          <p className="text-slate-500 italic">No commands issued yet.</p>
        )}
        {visible.map((rec) => (
          <div key={rec.id} className="group">
            <div className="flex items-start gap-2">
              <span className="text-atlas-accent select-none">$</span>
              <span className="break-all text-slate-200">{rec.command}</span>
              {rec.latencyMs != null && (
                <span className="ml-auto text-[10px] text-slate-500" title="Latency">
                  {rec.latencyMs}ms
                </span>
              )}
            </div>
            {rec.response && (
              <div className="pl-5 text-emerald-300 whitespace-pre-wrap break-words">
                {rec.response}
              </div>
            )}
            {rec.error && (
              <div className="pl-5 text-red-400 whitespace-pre-wrap break-words" role="alert">
                {rec.error}
              </div>
            )}
          </div>
        ))}
      </div>
      <div ref={liveRef} className="sr-only" aria-live="polite" />
    </div>
  );
}
