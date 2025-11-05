import { randomUUID } from 'node:crypto'
import type { GameTelemetryOptions } from '../telemetry.js'
import { trackGameEvent } from '../telemetry.js'

/**
 * Lightweight timing helper (Issue #353) providing ad-hoc latency measurement without spans.
 *
 * New withTiming API - Usage:
 *   const result = await withTiming('FetchPlayer', async () => {
 *     return await playerRepo.get(id)
 *   }, { category: 'repository', includeErrorFlag: true })
 *
 * Legacy startTiming API (for manual instrumentation):
 *   const t = startTiming('ContainerSetup')
 *   // ... work ...
 *   t.stop({ extra: 'value' })
 *
 * Emits event name `Timing.Op` with properties: op, ms, correlationId, category?, error?
 */
export interface TimingHandle {
    stop(extraProperties?: Record<string, unknown>): void
}

export interface WithTimingOptions extends GameTelemetryOptions {
    category?: string
    includeErrorFlag?: boolean
}

// Test/debug sink (not used in production). Allows unit tests to observe emitted events
// without patching internal telemetry client implementation details.
let debugSink: ((name: string, properties: Record<string, unknown>) => void) | null = null
export function __setTimingDebugSink(sink: ((name: string, properties: Record<string, unknown>) => void) | null) {
    debugSink = sink
}

/**
 * Wraps a synchronous or asynchronous function with timing measurement.
 * Automatically emits Timing.Op event on completion (success or error).
 * Errors are re-thrown after emission when includeErrorFlag is true.
 */
export async function withTiming<T>(op: string, fn: () => T | Promise<T>, opts?: WithTimingOptions): Promise<T> {
    const started = Date.now()
    let error: Error | undefined
    try {
        const result = await fn()
        return result
    } catch (err) {
        error = err instanceof Error ? err : new Error(String(err))
        throw error
    } finally {
        const ms = Date.now() - started
        const properties: Record<string, unknown> = {
            op,
            ms
        }
        if (opts?.category) {
            properties.category = opts.category
        }
        if (error && opts?.includeErrorFlag) {
            properties.error = true
        }

        // Generate correlationId if not provided (matching trackGameEvent behavior)
        const correlationId = opts?.correlationId || randomUUID()
        const enrichedOpts = { ...opts, correlationId }

        trackGameEvent('Timing.Op', properties, enrichedOpts)
        if (debugSink) {
            debugSink('Timing.Op', {
                ...properties,
                correlationId
            })
        }
    }
}

/**
 * Legacy manual timing API (retained for backward compatibility).
 * Prefer withTiming for new code.
 */
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
