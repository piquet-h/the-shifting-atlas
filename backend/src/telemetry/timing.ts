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

// Test/debug sink (not used in production). Allows unit tests to observe emitted events
// without patching internal telemetry client implementation details.
let debugSink: ((name: string, properties: Record<string, unknown>) => void) | null = null
export function __setTimingDebugSink(sink: ((name: string, properties: Record<string, unknown>) => void) | null) {
    debugSink = sink
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
            if (debugSink) {
                debugSink('Timing.Op', {
                    opName,
                    durationMs,
                    ...(extraProperties || {}),
                    ...(opts?.correlationId ? { correlationId: opts.correlationId } : {})
                })
            }
        }
    }
}

// Test-only helper: provides direct capture callback for emitted Timing.Op event.
export function __startTimingTest(
    opName: string,
    onEmit: (name: string, properties: Record<string, unknown>) => void,
    opts?: GameTelemetryOptions
): TimingHandle {
    const handle = startTiming(opName, opts)
    return {
        stop(extraProperties?: Record<string, unknown>) {
            const before = debugSink
            debugSink = (name, properties) => {
                onEmit(name, properties)
                // restore prior sink (idempotent for subsequent calls)
                debugSink = before
            }
            handle.stop(extraProperties)
        }
    }
}
