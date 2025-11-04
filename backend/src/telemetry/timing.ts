import type { GameTelemetryOptions } from '../telemetry.js'
import { trackGameEvent } from '../telemetry.js'

/**
 * Lightweight timing helper (Issue #353) providing ad-hoc latency measurement without spans.
 * Usage:
 *   const t = startTiming('ContainerSetup')
 *   // ... work ...
 *   t.stop({ extra: 'value' })
 * Emits event name `Timing.Op` with properties: opName, durationMs plus any extra properties supplied.
 */
export interface TimingHandle {
    stop(extraProperties?: Record<string, unknown>): void
}

export function startTiming(opName: string, opts?: GameTelemetryOptions): TimingHandle {
    const started = Date.now()
    let stopped = false
    return {
        stop(extraProperties?: Record<string, unknown>) {
            if (stopped) return
            stopped = true
            const durationMs = Date.now() - started
            trackGameEvent(
                'Timing.Op',
                {
                    opName,
                    durationMs,
                    ...(extraProperties || {})
                },
                opts
            )
        }
    }
}
